/**
 * POST /api/crypto/ax/prepare
 *
 * Build unsigned Ax instructions for fungible SOL↔SPL and SPL↔SPL.
 * Actions: create | fund | release | cancel | reclaim | open_dispute | cancel_unfunded
 *
 * Party A = buyer wallet (must sign create). Party B = seller wallet.
 * Dual-SPL release includes remainingAccounts[0] = fee receiver ATA for mint B.
 */

import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TRUSTLAYER_FEE_RECEIVER,
  TRUSTLAYER_ADMIN,
  TRUSTLAYER_PROGRAM_ID,
  DEVNET_RPC_URL,
  NATIVE_SOL_MINT,
  assetMeta,
  createAxSplitInstructionData,
  createFundAxInstructionData,
  createReleaseAxInstructionData,
  createCancelAxInstructionData,
  createReclaimAxInstructionData,
  createOpenDisputeAxInstructionData,
  createCancelUnfundedAxInstructionData,
  deriveAxPda,
  dualSplFeeRemainingAccounts,
  feeModeToOnChain,
  getAssociatedTokenAddress,
  isCryptoAssetCode,
  assetCodeToAxAssetType,
  type CryptoAssetCode,
} from "@/lib/crypto/solana";
import {
  assertAxWalletsBound,
  resolveAxLegs,
  type AxLegResolved,
} from "@/lib/domain/ax-legs";
import { isAxAdapter } from "@/lib/domain/settlement";
import { authorizeAgentDealExecution } from "@/lib/agents/execution-permissions";

type AxAction =
  | "create"
  | "fund"
  | "release"
  | "cancel"
  | "reclaim"
  | "open_dispute"
  | "cancel_unfunded";

function acc(
  pubkey: PublicKey,
  isSigner: boolean,
  isWritable: boolean
) {
  return {
    pubkey: pubkey.toBase58(),
    isSigner,
    isWritable,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const dealId = String(body.dealId || "");
    const action = String(body.action || "create") as AxAction;
    const leg = body.leg === 1 || body.leg === "1" ? 1 : 0;
    const signerWalletStr = String(body.signerWallet || body.wallet || "").trim();

    if (!dealId) {
      return NextResponse.json({ error: "dealId required" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const adminDb = createSupabaseAdminClient();
    const { data: deal, error: dealErr } = await adminDb
      .from("deals")
      .select(
        "id, buyer_id, seller_id, settlement_adapter, chain, rail, fee_mode, deadline, duration_seconds, status, creator_checklist, ax_release_authority, agent_transaction_id"
      )
      .eq("id", dealId)
      .single();

    if (dealErr || !deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    if (deal.creator_checklist?.agent_transaction_id && !deal.agent_transaction_id) {
      return NextResponse.json({ error: "This agent-originated Ax deal is not linked yet. Complete the agent-to-deal bridge before preparing settlement." }, { status: 409 });
    }
    if (!isAxAdapter(deal.settlement_adapter)) {
      return NextResponse.json(
        {
          error:
            "Deal is not solana_ax. Set settlement_adapter before Ax prepare.",
        },
        { status: 400 }
      );
    }

    const isParty = Boolean(
      user && (user.id === deal.buyer_id || user.id === deal.seller_id)
    );

    const settleActions = new Set(["release", "cancel"]);
    const partyOnlyActions = new Set([
      "create",
      "fund",
      "reclaim",
      "open_dispute",
      "cancel_unfunded",
    ]);

    // Resolve settle authority from create checklist (admin default / custom pubkey).
    const checklist = (deal as { creator_checklist?: Record<string, unknown> })
      .creator_checklist;
    const releaseMode = String(
      checklist?.releaseAuthorityMode ||
        ((deal as { ax_release_authority?: string }).ax_release_authority
          ? "custom"
          : "admin")
    ).toLowerCase();
    const customAuthPk = String(
      checklist?.releaseAuthorityPubkey ||
        (deal as { ax_release_authority?: string }).ax_release_authority ||
        ""
    ).trim();
    let settleAuthorityPk = TRUSTLAYER_ADMIN.toBase58();
    if (releaseMode === "custom" && customAuthPk.length >= 32) {
      try {
        settleAuthorityPk = new PublicKey(customAuthPk).toBase58();
      } catch {
        settleAuthorityPk = TRUSTLAYER_ADMIN.toBase58();
      }
    }
    const signerIsSettleAuthority =
      !!signerWalletStr && signerWalletStr === settleAuthorityPk;

    if (partyOnlyActions.has(action)) {
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (!isParty) {
        return NextResponse.json(
          { error: "Not a party to this deal" },
          { status: 403 }
        );
      }
    }

    // 1-leg parity: create/fund only after counterparty accepted
    if (action === "create" || action === "fund") {
      const ds = String((deal as { status?: string }).status || "").toLowerCase();
      const ok = ["accepted", "awaiting_payment", "funded", "disputed"].includes(
        ds
      );
      if (!ok) {
        return NextResponse.json(
          {
            error:
              "Deal is not ready for crypto. The counterparty must accept the agreement before Create Ax or Fund (same rule as 1-leg escrow).",
            dealStatus: ds || null,
          },
          { status: 409 }
        );
      }
    }

    // Release / cancel: authority wallet may prepare without TL account.
    if (settleActions.has(action)) {
      if (!user && !signerIsSettleAuthority) {
        return NextResponse.json(
          {
            error:
              "Connect the settle authority wallet (or sign in as a deal party) to prepare release/cancel.",
          },
          { status: 401 }
        );
      }
      if (user && !isParty && !signerIsSettleAuthority) {
        return NextResponse.json(
          {
            error:
              "Only the settle authority (TrustLayer admin or custom authority wallet) or a deal party can prepare release/cancel.",
          },
          { status: 403 }
        );
      }
    }

    // Narrow for party-only paths (TS does not keep the earlier guard).
    const partyUser = user;

    // Load legs with admin client so settle authority (admin/custom) is not
    // blocked by RLS (participant-only SELECT on deal_settlement_legs).
    const { data: legRows } = await adminDb
      .from("deal_settlement_legs")
      .select("*")
      .eq("deal_id", dealId)
      .order("leg_index", { ascending: true });

    let legs: AxLegResolved[] | null = null;
    if (legRows && legRows.length === 2) {
      legs = legRows.map((r) => {
        const at = String(r.asset_type || "").toLowerCase();
        const assetType =
          at === "nft" ? "nft" : at === "native_sol" ? "native_sol" : "spl";
        return {
          legIndex: (r.leg_index === 1 ? 1 : 0) as 0 | 1,
          partyRole: r.party_role as "buyer" | "seller",
          assetType: assetType as "native_sol" | "spl" | "nft",
          assetCode: String(r.asset_code).toUpperCase(),
          mint: r.mint,
          decimals: Number(r.decimals),
          amountBaseUnits: String(r.amount_base_units),
          feeAmountBaseUnits: String(r.fee_amount),
          feeAssetCode: String(r.fee_asset_code).toUpperCase(),
          feeBps: Number(r.fee_bps),
          feePayer: "funder" as const,
          amount: String(r.amount_base_units),
          feeAmount: String(r.fee_amount),
          fundAmount: String(r.amount_base_units),
          nftValuationSol: r.nft_valuation_amount
            ? String(r.nft_valuation_amount)
            : null,
        };
      });
    } else if (action === "create" && body.legA && body.legB) {
      legs = resolveAxLegs({
        legA: body.legA,
        legB: body.legB,
        feeMode: deal.fee_mode || body.feeMode || "on_top",
      });
    }

    if (!legs || legs.length !== 2) {
      return NextResponse.json(
        {
          error:
            "Ax legs missing. Pass legA/legB on create or persist deal_settlement_legs first.",
        },
        { status: 400 }
      );
    }

    // Wallets: prefer body, else active wallets for buyer/seller
    let partyAWallet = String(body.partyAWallet || body.buyerWallet || "").trim();
    let partyBWallet = String(
      body.partyBWallet || body.sellerWallet || ""
    ).trim();

    if (!partyAWallet || !partyBWallet) {
      const ids = [deal.buyer_id, deal.seller_id].filter(Boolean) as string[];
      const { data: wallets } = await adminDb
        .from("wallets")
        .select("user_id, address")
        .in("user_id", ids);
      const byUser = new Map(
        (wallets || []).map((w) => [w.user_id, String(w.address)])
      );
      if (!partyAWallet && deal.buyer_id) {
        partyAWallet = byUser.get(deal.buyer_id) || "";
      }
      if (!partyBWallet && deal.seller_id) {
        partyBWallet = byUser.get(deal.seller_id) || "";
      }
    }

    const bound = assertAxWalletsBound({
      partyAWallet,
      partyBWallet,
    });

    if ((deal as { agent_transaction_id?: string | null }).agent_transaction_id && (action === "create" || action === "fund")) {
      try {
        await authorizeAgentDealExecution({
          client: supabase,
          transactionId: String((deal as { agent_transaction_id: string }).agent_transaction_id),
          scope: action === "create" ? "settlement:create" : "settlement:fund",
          assetCode: String(legs[leg].assetCode).toUpperCase(),
          settlementType: "solana_ax",
          walletAddress: action === "create" ? bound.partyAWallet : signerWalletStr || (leg === 0 ? bound.partyAWallet : bound.partyBWallet),
        });
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Agent execution grant denied." }, { status: 403 });
      }
    }

    const userA = new PublicKey(bound.partyAWallet);
    const userB = new PublicKey(bound.partyBWallet);

    // chain deal id: use settlements.chain_deal_id or body / numeric from deal
    const { data: settlementRows } = await adminDb
      .from("crypto_settlements")
      .select("*")
      .eq("deal_id", dealId)
      .order("ax_leg_index", { ascending: true, nullsFirst: true })
      .limit(5);
    const settlement =
      (settlementRows || []).find((r) => r.chain_deal_id) ||
      (settlementRows || [])[0] ||
      null;

    let chainDealId = String(
      body.chainDealId ||
        settlement?.chain_deal_id ||
        body.dealIdNumeric ||
        ""
    ).trim();
    // Allocate u64 chain_deal_id on create when not yet stored (devnet-safe random).
    if ((!chainDealId || !/^\d+$/.test(chainDealId)) && action === "create") {
      const buf = randomBytes(8);
      let n = 0n;
      for (let i = 0; i < 8; i++) n = (n << 8n) | BigInt(buf[i]);
      n = n & 0x7fffffffffffffffn; // clear sign bit
      if (n === 0n) n = 1n;
      chainDealId = n.toString();
    }
    if (!chainDealId || !/^\d+$/.test(chainDealId)) {
      return NextResponse.json(
        {
          error:
            "Numeric chainDealId required (u64). Create flow should allocate and store crypto_settlements.chain_deal_id.",
        },
        { status: 400 }
      );
    }

    const [axPda] = deriveAxPda(chainDealId, userA, userB);

    // ---- Terminal / retry reconcile (parity with 1-leg alreadyReleased) ----
    const connectionForState = new Connection(
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL || DEVNET_RPC_URL,
      "confirmed"
    );
    let chainDecoded: {
      status?: string;
      fundedA?: boolean;
      fundedB?: boolean;
    } | null = null;
    let pdaExists = false;
    try {
      const info = await connectionForState.getAccountInfo(axPda, "confirmed");
      if (info?.data) {
        pdaExists = true;
        const { decodeAxSwapAccount } = await import(
          "@/lib/crypto/ax-accounts"
        );
        chainDecoded = decodeAxSwapAccount(Buffer.from(info.data));
      }
    } catch (e) {
      console.warn("[ax/prepare] chain read:", e);
    }

    async function healAxTerminal(status: "released" | "cancelled" | "refunded") {
      const dealStatus =
        status === "released"
          ? "completed"
          : status === "refunded"
            ? "refunded"
            : "cancelled";
      try {
        await adminDb
          .from("deals")
          .update({ status: dealStatus })
          .eq("id", dealId)
          .in("status", [
            "funded",
            "awaiting_payment",
            "awaiting_delivery",
            "accepted",
            "disputed",
            "draft",
          ]);
        await adminDb
          .from("crypto_settlements")
          .update({
            onchain_status: status,
            funded: status === "released",
          })
          .eq("deal_id", dealId);
      } catch (e) {
        console.warn("[ax/prepare] heal:", e);
      }
    }

    // Release when PDA already closed or status released → do not build another ix
    if (action === "release") {
      const terminal =
        !pdaExists ||
        chainDecoded?.status === "released" ||
        chainDecoded?.status === "cancelled" ||
        chainDecoded?.status === "refunded";
      if (terminal) {
        const st =
          chainDecoded?.status === "cancelled"
            ? "cancelled"
            : chainDecoded?.status === "refunded"
              ? "refunded"
              : "released";
        const finalSt = !pdaExists && st === "released" ? "released" : st;
        await healAxTerminal(
          finalSt === "cancelled"
            ? "cancelled"
            : finalSt === "refunded"
              ? "refunded"
              : "released"
        );
        return NextResponse.json({
          action: "release",
          alreadyReleased: finalSt === "released",
          alreadyCancelled: finalSt === "cancelled",
          alreadyTerminal: true,
          onchainStatus: finalSt,
          chainDealId,
          axPda: axPda.toBase58(),
          message:
            finalSt === "released"
              ? "Ax already released on-chain. Deal marked completed."
              : `Ax already ${finalSt} on-chain. Database synced.`,
        });
      }
    }

    if (action === "cancel") {
      if (
        !pdaExists ||
        chainDecoded?.status === "cancelled" ||
        chainDecoded?.status === "released" ||
        chainDecoded?.status === "refunded"
      ) {
        const rows = settlementRows || [];
        const hadRelease = rows.some((r: { release_tx_signature?: string }) =>
          Boolean(r.release_tx_signature)
        );
        const hadCancel = rows.some((r: { cancel_tx_signature?: string }) =>
          Boolean(r.cancel_tx_signature)
        );
        let healed: "released" | "cancelled" | "refunded" = "cancelled";
        if (chainDecoded?.status === "released" || hadRelease)
          healed = "released";
        else if (chainDecoded?.status === "refunded") healed = "refunded";
        else if (chainDecoded?.status === "cancelled" || hadCancel)
          healed = "cancelled";
        else if (!pdaExists && !chainDecoded) healed = "released";
        await healAxTerminal(healed);
        return NextResponse.json({
          action: "cancel",
          alreadyCancelled: healed === "cancelled",
          alreadyReleased: healed === "released",
          alreadyTerminal: true,
          onchainStatus: healed,
          chainDealId,
          axPda: axPda.toBase58(),
          message: `Ax already ${healed} on-chain. Database synced.`,
        });
      }
    }

    if (action === "fund" && chainDecoded) {
      const fundLeg = leg === 1 ? 1 : 0;
      const legFunded =
        fundLeg === 0 ? !!chainDecoded.fundedA : !!chainDecoded.fundedB;
      if (legFunded) {
        return NextResponse.json({
          action: "fund",
          alreadyFunded: true,
          fundLeg,
          fundedA: !!chainDecoded.fundedA,
          fundedB: !!chainDecoded.fundedB,
          onchainStatus:
            chainDecoded.fundedA && chainDecoded.fundedB
              ? "funded"
              : "created_unfunded",
          chainDealId,
          axPda: axPda.toBase58(),
          message: `Leg ${fundLeg === 0 ? "A" : "B"} already funded on-chain.`,
        });
      }
    }

    if (action === "create" && pdaExists) {
      return NextResponse.json({
        action: "create",
        alreadyCreated: true,
        fundedA: !!chainDecoded?.fundedA,
        fundedB: !!chainDecoded?.fundedB,
        onchainStatus: chainDecoded?.status || "created_unfunded",
        chainDealId,
        axPda: axPda.toBase58(),
        message: "Ax PDA already exists on-chain.",
      });
    }

    const legA = legs[0];
    const legB = legs[1];
    function resolveLegMeta(L: AxLegResolved) {
      if (L.assetType === "nft") {
        if (!L.mint) throw new Error("NFT leg missing mint");
        return {
          onChainType: 2 as const, // Nft
          mint: new PublicKey(L.mint),
          isNative: false,
          isNft: true,
        };
      }
      if (L.assetType === "native_sol" || L.assetCode === "SOL") {
        return {
          onChainType: 0 as const,
          mint: NATIVE_SOL_MINT,
          isNative: true,
          isNft: false,
        };
      }
      const meta = assetMeta(L.assetCode as CryptoAssetCode);
      return {
        onChainType: 1 as const,
        mint: meta.mint,
        isNative: false,
        isNft: false,
      };
    }
    const metaA = resolveLegMeta(legA);
    const metaB = resolveLegMeta(legB);
    const mintA = metaA.mint;
    const mintB = metaB.mint;
    // Native SOL: system program. SPL/NFT: token program (must match create).
    const tpA = metaA.isNative ? SystemProgram.programId : TOKEN_PROGRAM_ID;
    const tpB = metaB.isNative ? SystemProgram.programId : TOKEN_PROGRAM_ID;

    const programId = TRUSTLAYER_PROGRAM_ID.toBase58();
    const feeReceiver = TRUSTLAYER_FEE_RECEIVER;

    if (action === "create") {
      if (!partyUser) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (partyUser.id !== deal.buyer_id) {
        return NextResponse.json(
          { error: "Only the buyer (party A) signs create_ax_split." },
          { status: 403 }
        );
      }

      const expiry =
        body.expiryTimestamp != null
          ? Number(body.expiryTimestamp)
          : deal.deadline
            ? Math.floor(new Date(deal.deadline).getTime() / 1000)
            : Math.floor(Date.now() / 1000) +
              Math.max(Number(deal.duration_seconds) || 3600, 60);

      const data = createAxSplitInstructionData({
        chainDealId,
        amountA: BigInt(legA.amountBaseUnits),
        amountB: BigInt(legB.amountBaseUnits),
        feeA: BigInt(legA.feeAmountBaseUnits),
        feeB: BigInt(legB.feeAmountBaseUnits),
        releaseMode: 1,
        releaseAuthority: (() => {
          const cl = (deal as { creator_checklist?: Record<string, unknown> })
            .creator_checklist;
          const mode = String(cl?.releaseAuthorityMode || "admin");
          const pk = String(cl?.releaseAuthorityPubkey || "").trim();
          if (mode === "custom" && pk.length >= 32) {
            try {
              return new PublicKey(pk);
            } catch {
              /* fall through */
            }
          }
          return TRUSTLAYER_ADMIN;
        })(),
        userASettlement: userA,
        userBSettlement: userB,
        expiryTimestamp: expiry,
        earliestSettlementTimestamp: 0,
        assetTypeA: metaA.onChainType,
        assetTypeB: metaB.onChainType,
        mintA,
        mintB,
        tokenProgramA: tpA,
        tokenProgramB: tpB,
        feePayer: feeModeToOnChain(deal.fee_mode),
      });

      return NextResponse.json({
        action: "create",
        programId,
        axPda: axPda.toBase58(),
        chainDealId,
        partyAWallet: userA.toBase58(),
        partyBWallet: userB.toBase58(),
        legs: legs.map((l) => ({
          legIndex: l.legIndex,
          assetCode: l.assetCode,
          amountBaseUnits: l.amountBaseUnits,
          feeAmountBaseUnits: l.feeAmountBaseUnits,
        })),
        instruction: {
          programId,
          data: Buffer.from(data).toString("base64"),
          keys: [
            acc(userA, true, true), // payer = user_a
            acc(userA, false, false),
            acc(userB, false, false),
            acc(axPda, false, true),
            acc(SystemProgram.programId, false, false),
          ],
        },
      });
    }

    if (action === "fund") {
      if (!partyUser) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const fundLeg = (leg === 1 ? 1 : 0) as 0 | 1;
      const L = fundLeg === 0 ? legA : legB;
      const funder = fundLeg === 0 ? userA : userB;
      if (
        (fundLeg === 0 && partyUser.id !== deal.buyer_id) ||
        (fundLeg === 1 && partyUser.id !== deal.seller_id)
      ) {
        return NextResponse.json(
          { error: "You can only fund your own Ax leg." },
          { status: 403 }
        );
      }

      const m = resolveLegMeta(L);
      const mint = m.mint;
      // NFT: transfer 1 token + lock 1.5× SOL fee (program pulls SOL from funder)
      // Fungible native: funder is the "ata"; SPL/NFT: real ATA
      const funderAta = m.isNative
        ? funder
        : getAssociatedTokenAddress(funder, mint);
      const axAta = m.isNative
        ? axPda
        : getAssociatedTokenAddress(axPda, mint);

      const data = createFundAxInstructionData(chainDealId, fundLeg);
      const solLockHint =
        L.assetType === "nft"
          ? {
              feeSol: L.feeAmount,
              solLockAtFund:
                (L as { solLockAtFund?: string }).solLockAtFund || null,
              note: "NFT fund locks ~1.5× SOL fee (settlement + refund reserve). Reserve refunded on release.",
            }
          : null;
      return NextResponse.json({
        action: "fund",
        leg: fundLeg,
        programId,
        axPda: axPda.toBase58(),
        chainDealId,
        nftSolLock: solLockHint,
        instruction: {
          programId,
          data: Buffer.from(data).toString("base64"),
          keys: [
            acc(funder, true, true),
            acc(mint, false, false),
            acc(funderAta, false, true),
            acc(axAta, false, true),
            acc(axPda, false, true),
            acc(TOKEN_PROGRAM_ID, false, false),
            acc(ASSOCIATED_TOKEN_PROGRAM_ID, false, false),
            acc(SystemProgram.programId, false, false),
          ],
        },
      });
    }

    if (action === "release") {
      const data = createReleaseAxInstructionData(chainDealId);

      // Native SOL: do NOT pass Ax PDA again as vault (duplicate writable key + close
      // causes lamport balance mismatch). Program ignores vault for native; use a
      // distinct already-writable account as placeholder (settlement wallet).
      // SPL: vault = ATA(ax, mint); mint = real mint.
      const axAtaA = metaA.isNative
        ? userA
        : getAssociatedTokenAddress(axPda, mintA);
      const axAtaB = metaB.isNative
        ? userB
        : getAssociatedTokenAddress(axPda, mintB);
      const mintAccountA = metaA.isNative ? NATIVE_SOL_MINT : mintA;
      const mintAccountB = metaB.isNative ? NATIVE_SOL_MINT : mintB;

      // After swap: B receives asset A, A receives asset B
      const destBTokenA = metaA.isNative
        ? userB
        : getAssociatedTokenAddress(userB, mintA);
      const destATokenB = metaB.isNative
        ? userA
        : getAssociatedTokenAddress(userA, mintB);

      // Platform fee always to TRUSTLAYER_FEE_RECEIVER:
      // - SOL fee: lamports on fee_receiver (fee_token ignored for native)
      // - SPL fee: ATA(fee_receiver, that mint)
      const feeAtaA = metaA.isNative
        ? null
        : getAssociatedTokenAddress(feeReceiver, mintA);
      const feeAtaB = metaB.isNative
        ? null
        : getAssociatedTokenAddress(feeReceiver, mintB);

      // Program fee_token slot + remaining:
      // dual SPL → fee_token = ATA A, remaining[0] = ATA B
      // only B SPL (e.g. SOL↔USDC) → fee_token = ATA B (native fee_a ignores it)
      // only A SPL → fee_token = ATA A
      // both native → fee_token = fee_receiver
      const aSpl = !metaA.isNative && !metaA.isNft;
      const bSpl = !metaB.isNative && !metaB.isNft;
      let feeTokenPrimary: PublicKey = feeReceiver;
      let remaining: {
        pubkey: string;
        isSigner: boolean;
        isWritable: boolean;
      }[] = [];
      if (aSpl && bSpl) {
        feeTokenPrimary = feeAtaA!;
        remaining = dualSplFeeRemainingAccounts(feeAtaB!).map((r) => ({
          pubkey: r.pubkey.toBase58(),
          isSigner: r.isSigner,
          isWritable: r.isWritable,
        }));
      } else if (aSpl) {
        feeTokenPrimary = feeAtaA!;
      } else if (bSpl) {
        feeTokenPrimary = feeAtaB!;
      }

      const atasToEnsure: string[] = [];
      if (aSpl) {
        atasToEnsure.push(
          axAtaA.toBase58(),
          destBTokenA.toBase58(),
          feeAtaA!.toBase58()
        );
      }
      if (bSpl) {
        atasToEnsure.push(
          axAtaB.toBase58(),
          destATokenB.toBase58(),
          feeAtaB!.toBase58()
        );
      }

      // Account 0 = wallet that signs (authority admin / custom / party).
      let signerPk = userA;
      if (signerWalletStr) {
        try {
          signerPk = new PublicKey(signerWalletStr);
        } catch {
          return NextResponse.json(
            { error: "Invalid signerWallet" },
            { status: 400 }
          );
        }
      } else if (user && user.id === deal.seller_id) {
        signerPk = userB;
      }

      return NextResponse.json({
        action: "release",
        programId,
        axPda: axPda.toBase58(),
        chainDealId,
        dualSplFeeRemaining: aSpl && bSpl,
        ensureAtas: [...new Set(atasToEnsure)],
        feeReceiver: feeReceiver.toBase58(),
        instruction: {
          programId,
          data: Buffer.from(data).toString("base64"),
          keys: [
            acc(signerPk, true, true),
            acc(userA, false, true),
            acc(userB, false, true),
            // settlement destinations (create used userA/userB wallets)
            acc(userA, false, true),
            acc(userB, false, true),
            acc(feeReceiver, false, true),
            acc(mintAccountA, false, false),
            acc(mintAccountB, false, false),
            acc(axAtaA, false, true),
            acc(axAtaB, false, true),
            acc(destBTokenA, false, true),
            acc(destATokenB, false, true),
            acc(feeTokenPrimary, false, true),
            acc(axPda, false, true),
            acc(tpA, false, false),
            acc(tpB, false, false),
            acc(ASSOCIATED_TOKEN_PROGRAM_ID, false, false),
            acc(SystemProgram.programId, false, false),
            ...remaining,
          ],
        },
      });
    }

    if (action === "cancel") {
      // Mirror release account hygiene: native vault slots must NOT be Ax PDA
      // (writable Ax appears twice → lamport balance mismatch with token CPIs).
      const data = createCancelAxInstructionData(chainDealId);
      const userATok = metaA.isNative
        ? userA
        : getAssociatedTokenAddress(userA, mintA);
      const userBTok = metaB.isNative
        ? userB
        : getAssociatedTokenAddress(userB, mintB);
      const axAtaA = metaA.isNative
        ? userA
        : getAssociatedTokenAddress(axPda, mintA);
      const axAtaB = metaB.isNative
        ? userB
        : getAssociatedTokenAddress(axPda, mintB);
      const mintAccountA = metaA.isNative ? NATIVE_SOL_MINT : mintA;
      const mintAccountB = metaB.isNative ? NATIVE_SOL_MINT : mintB;

      // Authority cancel: account 0 = connected signer (admin / custom authority)
      let signerPk = userA;
      if (signerWalletStr) {
        try {
          signerPk = new PublicKey(signerWalletStr);
        } catch {
          return NextResponse.json(
            { error: "Invalid signerWallet" },
            { status: 400 }
          );
        }
      } else if (user && user.id === deal.seller_id) {
        signerPk = userB;
      }

      return NextResponse.json({
        action: "cancel",
        programId,
        axPda: axPda.toBase58(),
        chainDealId,
        instruction: {
          programId,
          data: Buffer.from(data).toString("base64"),
          keys: [
            acc(signerPk, true, true),
            acc(userA, false, true),
            acc(userB, false, true),
            acc(mintAccountA, false, false),
            acc(mintAccountB, false, false),
            acc(userATok, false, true),
            acc(userBTok, false, true),
            acc(axAtaA, false, true),
            acc(axAtaB, false, true),
            acc(axPda, false, true),
            acc(tpA, false, false),
            acc(tpB, false, false),
            acc(ASSOCIATED_TOKEN_PROGRAM_ID, false, false),
            acc(SystemProgram.programId, false, false),
          ],
        },
      });
    }

    if (action === "reclaim") {
      if (!partyUser) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const rLeg = (leg === 1 ? 1 : 0) as 0 | 1;
      const L = rLeg === 0 ? legA : legB;
      const party = rLeg === 0 ? userA : userB;
      const m = resolveLegMeta(L);
      const mint = m.mint;
      const partyAta = m.isNative
        ? party
        : getAssociatedTokenAddress(party, mint);
      const axAta = m.isNative
        ? axPda
        : getAssociatedTokenAddress(axPda, mint);
      const data = createReclaimAxInstructionData(chainDealId, rLeg);
      return NextResponse.json({
        action: "reclaim",
        leg: rLeg,
        instruction: {
          programId,
          data: Buffer.from(data).toString("base64"),
          keys: [
            acc(party, true, true),
            acc(mint, false, false),
            acc(partyAta, false, true),
            acc(axAta, false, true),
            acc(axPda, false, true),
            acc(TOKEN_PROGRAM_ID, false, false),
            acc(ASSOCIATED_TOKEN_PROGRAM_ID, false, false),
            acc(SystemProgram.programId, false, false),
          ],
        },
      });
    }

    if (action === "open_dispute") {
      if (!partyUser) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const data = createOpenDisputeAxInstructionData(chainDealId);
      const opener = partyUser.id === deal.buyer_id ? userA : userB;
      return NextResponse.json({
        action: "open_dispute",
        instruction: {
          programId,
          data: Buffer.from(data).toString("base64"),
          keys: [
            acc(opener, true, true),
            acc(userA, false, false),
            acc(userB, false, false),
            acc(axPda, false, true),
          ],
        },
      });
    }

    if (action === "cancel_unfunded") {
      if (!partyUser) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const data = createCancelUnfundedAxInstructionData(chainDealId);
      const party = partyUser.id === deal.buyer_id ? userA : userB;
      return NextResponse.json({
        action: "cancel_unfunded",
        instruction: {
          programId,
          data: Buffer.from(data).toString("base64"),
          keys: [
            acc(party, true, true),
            acc(userA, false, true),
            acc(userB, false, true),
            acc(axPda, false, true),
          ],
        },
      });
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ax prepare failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
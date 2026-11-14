import { NextResponse } from "next/server";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  assetMeta,
  DEVNET_RPC_URL,
  TRUSTLAYER_PROGRAM_ID,
  TRUSTLAYER_FEE_RECEIVER,
  TRUSTLAYER_ADMIN,
  deriveEscrowPda,
  deriveAxPda,
  createAdminResolveReleaseInstructionData,
  createAdminResolveRefundInstructionData,
  createAdminResolveReleaseSplInstructionData,
  createAdminResolveRefundSplInstructionData,
  createAdminResolveReleaseAxInstructionData,
  createAdminResolveRefundAxInstructionData,
  isCryptoAssetCode,
  NATIVE_SOL_MINT,
} from "@/lib/crypto/solana";
import { decodeAxSwapAccount } from "@/lib/crypto/ax-accounts";
import {
  decodeEscrowAccount,
  ESCROW_ACCOUNT_MIN_LEN,
} from "@/lib/crypto/escrow-accounts";
import { requireAdminUser } from "@/lib/domain/admin";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { loadAdminKeypair } from "@/lib/crypto/admin-wallet";
import {
  syncSettlementTerminalState,
  verifyTrustLayerTerminalTransaction,
  persistSettlementSignature,
} from "@/lib/crypto/reconcile-from-signature";

const MIN_ESCROW_ACCOUNT_LEN = ESCROW_ACCOUNT_MIN_LEN;


export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const { id: disputeId } = await params;
    const body = (await request.json()) as {
      action?: "release" | "refund";
      notes?: string;
    };

    if (body.action !== "release" && body.action !== "refund") {
      return NextResponse.json(
        { error: "action must be release or refund." },
        { status: 400 }
      );
    }

    const notes = (body.notes || "").trim();
    if (notes.length < 10) {
      return NextResponse.json(
        { error: "Resolution notes must be at least 10 characters." },
        { status: 400 }
      );
    }

    const { user } = await requireAdminUser();
    const admin = createSupabaseAdminClient();

    const { data: dispute } = await admin
      .from("deal_disputes")
      .select("*")
      .eq("id", disputeId)
      .maybeSingle();
    if (!dispute) {
      return NextResponse.json({ error: "Dispute not found." }, { status: 404 });
    }
    if (dispute.status !== "open") {
      return NextResponse.json({ error: "Dispute is not open." }, { status: 409 });
    }

    const mIndex = Number(dispute.milestone_index);
    if (!Number.isInteger(mIndex) || mIndex < 0 || mIndex > 9) {
      return NextResponse.json(
        { error: "Invalid dispute milestone index." },
        { status: 409 }
      );
    }

    const { data: deal } = await admin
      .from("deals")
      .select("*, settlement_adapter")
      .eq("id", dispute.deal_id)
      .maybeSingle();
    if (!deal) {
      return NextResponse.json({ error: "Deal not found." }, { status: 404 });
    }

    // Ax uses two rows (ax_leg_index 0|1) per deal+milestone — never maybeSingle.
    const adapter = String(deal.settlement_adapter || "").toLowerCase();
    const isAxDeal = adapter === "solana_ax" || adapter.includes("ax");

    let settlement: Record<string, any> | null = null;
    if (isAxDeal) {
      const { data: rows } = await admin
        .from("crypto_settlements")
        .select("*")
        .eq("deal_id", deal.id)
        .eq("milestone_index", mIndex)
        .order("ax_leg_index", { ascending: true });
      const list = rows || [];
      settlement =
        list.find((r: any) => r.ax_leg_index === 0 || r.ax_leg_index === "0") ||
        list[0] ||
        null;
    } else {
      const { data } = await admin
        .from("crypto_settlements")
        .select("*")
        .eq("deal_id", deal.id)
        .eq("milestone_index", mIndex)
        .maybeSingle();
      settlement = data;
    }

    if (!settlement?.chain_deal_id) {
      return NextResponse.json(
        { error: "No settlement for disputed milestone." },
        { status: 409 }
      );
    }

    const okStatus = ["funded", "disputed"].includes(
      String(settlement.onchain_status || "")
    );
    if (!okStatus && !settlement.funded) {
      return NextResponse.json(
        {
          error: "Disputed settlement is not in a funded/disputed on-chain state.",
          onchain_status: settlement.onchain_status,
        },
        { status: 409 }
      );
    }

    const isAx =
      String(settlement.settlement_kind || "").toLowerCase() === "ax" ||
      String(deal.settlement_adapter || "") === "solana_ax";

    // -------------------- Ax admin resolve --------------------
    if (isAx) {
      const userA = new PublicKey(
        String(settlement.buyer_wallet || settlement.initiator_wallet)
      );
      const userB = new PublicKey(String(settlement.seller_wallet));
      const chainDealId = String(settlement.chain_deal_id);
      const [axPda] = deriveAxPda(chainDealId, userA, userB);

      const connection = new Connection(DEVNET_RPC_URL, "confirmed");
      const account = await connection.getAccountInfo(axPda, "confirmed");
      if (!account || !account.owner.equals(TRUSTLAYER_PROGRAM_ID)) {
        return NextResponse.json(
          { error: "Ax PDA not found on-chain.", axPda: axPda.toBase58() },
          { status: 409 }
        );
      }
      const decoded = decodeAxSwapAccount(Buffer.from(account.data));
      if (decoded.status !== "disputed") {
        return NextResponse.json(
          {
            error: "Ax must be Disputed on-chain before admin resolve.",
            status: decoded.status,
          },
          { status: 409 }
        );
      }
      if (!decoded.fundedA || !decoded.fundedB) {
        return NextResponse.json(
          { error: "Both Ax legs must be funded for admin resolve." },
          { status: 409 }
        );
      }

      const { data: legs } = await admin
        .from("deal_settlement_legs")
        .select("*")
        .eq("deal_id", deal.id)
        .order("leg_index", { ascending: true });
      if (!legs || legs.length < 2) {
        return NextResponse.json(
          { error: "Ax settlement legs missing in DB." },
          { status: 409 }
        );
      }

      function legMeta(row: Record<string, unknown>) {
        const at = String(row.asset_type || "").toLowerCase();
        const code = String(row.asset_code || "").toUpperCase();
        if (at === "nft" || code === "NFT") {
          return {
            isNative: false,
            isNft: true,
            mint: new PublicKey(String(row.mint)),
          };
        }
        if (at === "native_sol" || code === "SOL") {
          return { isNative: true, isNft: false, mint: NATIVE_SOL_MINT };
        }
        return {
          isNative: false,
          isNft: false,
          mint: new PublicKey(String(row.mint)),
        };
      }
      const metaA = legMeta(legs[0] as Record<string, unknown>);
      const metaB = legMeta(legs[1] as Record<string, unknown>);
      const feeReceiver = TRUSTLAYER_FEE_RECEIVER;

      // Program: for NativeSol legs, mint_* accounts must be the Ax PDA (not Pubkey::default).
      const mintA = metaA.isNative ? axPda : metaA.mint;
      const mintB = metaB.isNative ? axPda : metaB.mint;
      // Real SPL mints for ATA derivation (never use Ax PDA as mint for ATA seeds).
      const splMintA = metaA.isNative ? null : metaA.mint;
      const splMintB = metaB.isNative ? null : metaB.mint;

      const axTokenA = metaA.isNative
        ? axPda
        : getAssociatedTokenAddress(axPda, splMintA!);
      const axTokenB = metaB.isNative
        ? axPda
        : getAssociatedTokenAddress(axPda, splMintB!);
      // Release destinations: B receives A, A receives B
      const destBTokenA = metaA.isNative
        ? userB
        : getAssociatedTokenAddress(userB, splMintA!);
      const destATokenB = metaB.isNative
        ? userA
        : getAssociatedTokenAddress(userA, splMintB!);

      // fee_token must equal ATA(fee_receiver, fee_mint, token_program) when fee is SPL.
      // Program take_fee_one checks require_keys_eq!(fee_token, expected_fee_ata).
      // Bug was: metaA.isNative → feeToken = feeReceiver wallet while fee still taken
      // from SPL leg B (or A) → Left=fee wallet, Right=expected ATA (InvalidTokenAccount 6024).
      // Prefer primary fee ATA: leg A SPL mint if present, else leg B SPL mint; else wallet for SOL-only.
      const primaryFeeSplMint = splMintA ?? splMintB;
      const feeToken = primaryFeeSplMint
        ? getAssociatedTokenAddress(feeReceiver, primaryFeeSplMint)
        : feeReceiver;

      // Refund path: return to user ATAs
      const userAToken = metaA.isNative
        ? userA
        : getAssociatedTokenAddress(userA, splMintA!);
      const userBToken = metaB.isNative
        ? userB
        : getAssociatedTokenAddress(userB, splMintB!);

      const adminKp = loadAdminKeypair();
      if (!adminKp.publicKey.equals(TRUSTLAYER_ADMIN)) {
        return NextResponse.json({ error: "Admin key mismatch." }, { status: 500 });
      }

      const keys: {
        pubkey: PublicKey;
        isSigner: boolean;
        isWritable: boolean;
      }[] =
        body.action === "release"
          ? [
              { pubkey: adminKp.publicKey, isSigner: true, isWritable: true },
              { pubkey: userA, isSigner: false, isWritable: true },
              { pubkey: userB, isSigner: false, isWritable: true },
              { pubkey: userA, isSigner: false, isWritable: true }, // settlement dest A (mut on-chain)
              { pubkey: userB, isSigner: false, isWritable: true }, // settlement dest B
              { pubkey: feeReceiver, isSigner: false, isWritable: true },
              { pubkey: mintA, isSigner: false, isWritable: false },
              { pubkey: mintB, isSigner: false, isWritable: false },
              { pubkey: axTokenA, isSigner: false, isWritable: true },
              { pubkey: axTokenB, isSigner: false, isWritable: true },
              { pubkey: destBTokenA, isSigner: false, isWritable: true },
              { pubkey: destATokenB, isSigner: false, isWritable: true },
              { pubkey: feeToken, isSigner: false, isWritable: true },
              { pubkey: axPda, isSigner: false, isWritable: true },
              {
                pubkey: metaA.isNative ? SystemProgram.programId : TOKEN_PROGRAM_ID,
                isSigner: false,
                isWritable: false,
              },
              {
                pubkey: metaB.isNative ? SystemProgram.programId : TOKEN_PROGRAM_ID,
                isSigner: false,
                isWritable: false,
              },
              { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ]
          : [
              { pubkey: adminKp.publicKey, isSigner: true, isWritable: true },
              { pubkey: userA, isSigner: false, isWritable: true },
              { pubkey: userB, isSigner: false, isWritable: true },
              { pubkey: feeReceiver, isSigner: false, isWritable: true },
              { pubkey: mintA, isSigner: false, isWritable: false },
              { pubkey: mintB, isSigner: false, isWritable: false },
              { pubkey: userAToken, isSigner: false, isWritable: true },
              { pubkey: userBToken, isSigner: false, isWritable: true },
              { pubkey: feeToken, isSigner: false, isWritable: true },
              { pubkey: axTokenA, isSigner: false, isWritable: true },
              { pubkey: axTokenB, isSigner: false, isWritable: true },
              { pubkey: axPda, isSigner: false, isWritable: true },
              {
                pubkey: metaA.isNative ? SystemProgram.programId : TOKEN_PROGRAM_ID,
                isSigner: false,
                isWritable: false,
              },
              {
                pubkey: metaB.isNative ? SystemProgram.programId : TOKEN_PROGRAM_ID,
                isSigner: false,
                isWritable: false,
              },
              { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ];

      // Dual SPL fees: program expects remaining_accounts[0] = fee ATA for leg B mint.
      if (splMintA && splMintB) {
        const feeTokenB = getAssociatedTokenAddress(feeReceiver, splMintB);
        if (!feeTokenB.equals(feeToken)) {
          keys.push({
            pubkey: feeTokenB,
            isSigner: false,
            isWritable: true,
          });
        }
      }

      const data =
        body.action === "release"
          ? createAdminResolveReleaseAxInstructionData(chainDealId)
          : createAdminResolveRefundAxInstructionData(chainDealId);

      const ix = new TransactionInstruction({
        programId: TRUSTLAYER_PROGRAM_ID,
        keys,
        data,
      });
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({
        feePayer: adminKp.publicKey,
        blockhash,
        lastValidBlockHeight,
      }).add(ix);
      tx.sign(adminKp);
      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      const nextOnchain = body.action === "release" ? "released" : "refunded";
      const nextDealStatus =
        body.action === "release" ? "completed" : "refunded";

      try {
        await admin
          .from("crypto_settlements")
          .update({
            onchain_status: nextOnchain,
            funded: false,
            last_tx_signature: signature,
            last_verified_at: new Date().toISOString(),
            ...(body.action === "release"
              ? { release_tx_signature: signature }
              : { refund_tx_signature: signature }),
          })
          .eq("id", settlement.id);

        await admin
          .from("deal_disputes")
          .update({
            status:
              body.action === "release" ? "resolved_release" : "resolved_refund",
            resolved_at: new Date().toISOString(),
            resolved_by: user.id,
            resolution_notes: notes,
          })
          .eq("id", dispute.id);

        await admin
          .from("deals")
          .update({ status: nextDealStatus })
          .eq("id", deal.id);

        await admin.from("deal_events").insert({
          deal_id: deal.id,
          actor_user_id: user.id,
          actor_type: "admin",
          event_type: `ax_admin_${body.action}_resolved`,
          metadata: {
            signature,
            ax_pda: axPda.toBase58(),
            chain_deal_id: chainDealId,
            dispute_id: dispute.id,
            notes,
          },
        });

        return NextResponse.json({
          ok: true,
          signature,
          action: body.action,
          settlementKind: "ax",
          axPda: axPda.toBase58(),
          dbSynced: true,
        });
      } catch (dbErr) {
        console.error("Ax on-chain OK; DB sync failed:", dbErr);
        return NextResponse.json({
          ok: true,
          signature,
          action: body.action,
          settlementKind: "ax",
          axPda: axPda.toBase58(),
          dbSynced: false,
          warning:
            "On-chain Ax resolution succeeded, but database sync failed. Use Recover with this signature.",
          error: dbErr instanceof Error ? dbErr.message : "DB sync failed",
        });
      }
    }
    // -------------------- end Ax branch; continue 1-leg path --------------------


    const initiator = new PublicKey(String(settlement.initiator_wallet));
    const buyer = new PublicKey(String(settlement.buyer_wallet));
    const seller = new PublicKey(String(settlement.seller_wallet));
    const feeReceiver = TRUSTLAYER_FEE_RECEIVER;
    const chainDealId = String(settlement.chain_deal_id);

    const [escrow] = deriveEscrowPda(initiator, chainDealId, mIndex);

    if (settlement.escrow_pda && settlement.escrow_pda !== escrow.toBase58()) {
      return NextResponse.json(
        {
          error: "Stored escrow PDA does not match disputed milestone seeds.",
          stored: settlement.escrow_pda,
          derived: escrow.toBase58(),
          initiator: initiator.toBase58(),
          chainDealId,
          milestoneIndex: mIndex,
        },
        { status: 409 }
      );
    }

    const connection = new Connection(DEVNET_RPC_URL, "confirmed");
    const account = await connection.getAccountInfo(escrow, "confirmed");
    if (!account || !account.owner.equals(TRUSTLAYER_PROGRAM_ID)) {
      return NextResponse.json(
        { error: "Disputed escrow account not found on-chain." },
        { status: 409 }
      );
    }

    if (account.data.length < MIN_ESCROW_ACCOUNT_LEN) {
      return NextResponse.json(
        { error: "Invalid escrow account layout." },
        { status: 409 }
      );
    }

    const chain = decodeEscrowAccount(Buffer.from(account.data));

    // Hard seed alignment: on-chain must match settlement + instruction args
    if (chain.dealId !== chainDealId) {
      return NextResponse.json(
        {
          error: "On-chain deal_id does not match settlement.chain_deal_id.",
          onchain: chain.dealId,
          expected: chainDealId,
        },
        { status: 409 }
      );
    }
    if (Number(chain.milestoneIndex) !== mIndex) {
      return NextResponse.json(
        {
          error: "On-chain milestone_index does not match dispute.",
          onchain: chain.milestoneIndex,
          expected: mIndex,
        },
        { status: 409 }
      );
    }
    if (chain.initiator !== initiator.toBase58()) {
      return NextResponse.json(
        {
          error: "On-chain initiator does not match settlement.initiator_wallet.",
          onchain: chain.initiator,
          expected: initiator.toBase58(),
        },
        { status: 409 }
      );
    }
    if (!chain.funded) {
      return NextResponse.json(
        { error: "On-chain escrow is not funded." },
        { status: 409 }
      );
    }

    const adminKp = loadAdminKeypair();
    if (!adminKp.publicKey.equals(TRUSTLAYER_ADMIN)) {
      return NextResponse.json(
        {
          error:
            "Loaded admin keypair does not match TRUSTLAYER_ADMIN (on-chain constraint will fail).",
          loaded: adminKp.publicKey.toBase58(),
          expected: TRUSTLAYER_ADMIN.toBase58(),
        },
        { status: 500 }
      );
    }

    // Prefer deal asset; settlement may not have asset_code column
    const code = String(deal.asset_code || deal.currency || "SOL").toUpperCase();
    if (!isCryptoAssetCode(code)) {
      return NextResponse.json({ error: `Unsupported asset: ${code}` }, { status: 409 });
    }
    const isSpl = code === "USDC" || code === "USDT";

    // On-chain asset_type: 0 = SOL, 1 = SPL
    if ((chain.assetType === 1) !== isSpl) {
      return NextResponse.json(
        {
          error: "Deal asset does not match on-chain escrow asset_type.",
          assetCode: code,
          onchainAssetType: chain.assetType,
        },
        { status: 409 }
      );
    }

    let keys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[];
    let data: Buffer;

    if (isSpl) {
      const mint = assetMeta(code as "USDC" | "USDT").mint;
      const escrowAta = getAssociatedTokenAddress(escrow, mint);
      const buyerAta = getAssociatedTokenAddress(buyer, mint);
      const sellerAta = getAssociatedTokenAddress(seller, mint);
      const feeAta = getAssociatedTokenAddress(feeReceiver, mint);

      data =
        body.action === "release"
          ? createAdminResolveReleaseSplInstructionData(
              chainDealId,
              mIndex,
              initiator
            )
          : createAdminResolveRefundSplInstructionData(
              chainDealId,
              mIndex,
              initiator
            );

      // Order must match Anchor AdminResolveReleaseSpl / RefundSpl accounts
      // initiator is early so seeds = [escrow, initiator, deal_id, milestone] bind correctly
      if (body.action === "release") {
        keys = [
          { pubkey: adminKp.publicKey, isSigner: true, isWritable: true },
          { pubkey: initiator, isSigner: false, isWritable: true },
          { pubkey: buyer, isSigner: false, isWritable: true },
          { pubkey: seller, isSigner: false, isWritable: true },
          { pubkey: feeReceiver, isSigner: false, isWritable: true },
          { pubkey: escrow, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: escrowAta, isSigner: false, isWritable: true },
          { pubkey: sellerAta, isSigner: false, isWritable: true },
          { pubkey: feeAta, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          {
            pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
            isSigner: false,
            isWritable: false,
          },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ];
      } else {
        keys = [
          { pubkey: adminKp.publicKey, isSigner: true, isWritable: true },
          { pubkey: initiator, isSigner: false, isWritable: true },
          { pubkey: buyer, isSigner: false, isWritable: true },
          { pubkey: feeReceiver, isSigner: false, isWritable: true },
          { pubkey: escrow, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: escrowAta, isSigner: false, isWritable: true },
          { pubkey: buyerAta, isSigner: false, isWritable: true },
          { pubkey: feeAta, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          {
            pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
            isSigner: false,
            isWritable: false,
          },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ];
      }
    } else {
      data =
        body.action === "release"
          ? createAdminResolveReleaseInstructionData(
              chainDealId,
              mIndex,
              initiator
            )
          : createAdminResolveRefundInstructionData(
              chainDealId,
              mIndex,
              initiator
            );

      // SOL — same initiator-early ordering (was buyer → seller → initiator before)
      if (body.action === "release") {
        keys = [
          { pubkey: adminKp.publicKey, isSigner: true, isWritable: true },
          { pubkey: initiator, isSigner: false, isWritable: true },
          { pubkey: buyer, isSigner: false, isWritable: true },
          { pubkey: seller, isSigner: false, isWritable: true },
          { pubkey: feeReceiver, isSigner: false, isWritable: true },
          { pubkey: escrow, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ];
      } else {
        keys = [
          { pubkey: adminKp.publicKey, isSigner: true, isWritable: true },
          { pubkey: initiator, isSigner: false, isWritable: true },
          { pubkey: buyer, isSigner: false, isWritable: true },
          { pubkey: feeReceiver, isSigner: false, isWritable: true },
          { pubkey: escrow, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ];
      }
    }

    const ix = new TransactionInstruction({
      programId: TRUSTLAYER_PROGRAM_ID,
      keys,
      data,
    });

    const latest = await connection.getLatestBlockhash("finalized");
    const tx = new Transaction({
      feePayer: adminKp.publicKey,
      recentBlockhash: latest.blockhash,
    }).add(ix);
    tx.sign(adminKp);

    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 5,
    });
    await connection.confirmTransaction(
      {
        signature,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      },
      "confirmed"
    );

    // Chain is authoritative from here. Always keep the signature even if DB sync fails.
    try {
      await persistSettlementSignature(
        settlement.id,
        signature,
        escrow.toBase58()
      );
    } catch (persistErr) {
      console.error("Early signature persist failed:", persistErr);
    }

    try {
      const verified = await verifyTrustLayerTerminalTransaction(
        connection,
        signature,
        {
          chainDealId,
          milestoneIndex: mIndex,
          initiator,
          escrowPda: escrow,
          expectedAction:
            body.action === "release"
              ? "admin_resolve_release"
              : "admin_resolve_refund",
        }
      );

      const onchainStatus = verified.status;
      const disputeStatus =
        body.action === "release" ? "resolved_release" : "resolved_refund";

      await syncSettlementTerminalState({
        settlementId: settlement.id,
        dealId: deal.id,
        signature,
        escrowPda: escrow.toBase58(),
        status: onchainStatus,
        eventType:
          verified.action === "admin_resolve_release"
            ? "admin_onchain_resolve_release"
            : "admin_onchain_resolve_refund",
        actorUserId: user.id,
        actorType: "admin",
        milestoneIndex: mIndex,
        chainDealId,
        metadata: {
          dispute_id: disputeId,
          notes,
          executed: true,
        },
      });

      const { data: remaining, error: remainingError } = await admin
        .from("deal_disputes")
        .select("id")
        .eq("deal_id", deal.id)
        .eq("status", "open")
        .neq("id", disputeId);
      if (remainingError) throw new Error(remainingError.message);

      const { data: all, error: allError } = await admin
        .from("crypto_settlements")
        .select("onchain_status")
        .eq("deal_id", deal.id);
      if (allError) throw new Error(allError.message);

      const allTerminal =
        (all?.length ?? 0) > 0 &&
        all!.every((r) =>
          ["released", "cancelled", "refunded"].includes(
            String(r.onchain_status)
          )
        );

      const allSettledOrFunded =
        (all?.length ?? 0) > 0 &&
        all!.every((r) =>
          ["funded", "released", "cancelled", "refunded"].includes(
            String(r.onchain_status)
          )
        );

      const { error: disputeUpdateError } = await admin
        .from("deal_disputes")
        .update({
          status: disputeStatus,
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
          resolution_notes: notes,
        })
        .eq("id", disputeId)
        .eq("status", "open");
      if (disputeUpdateError) throw new Error(disputeUpdateError.message);

      const nextDealStatus = allTerminal
        ? body.action === "release"
          ? "completed"
          : "refunded"
        : (remaining?.length ?? 0) > 0
          ? "disputed"
          : allSettledOrFunded
            ? "funded"
            : "awaiting_payment";

      const { error: dealUpdateError } = await admin
        .from("deals")
        .update({ status: nextDealStatus })
        .eq("id", deal.id);
      if (dealUpdateError) throw new Error(dealUpdateError.message);

      if (deal.agent_transaction_id && allTerminal) {
        const terminalState = all!.every((r) => String(r.onchain_status) === "released")
          ? "released"
          : all!.every((r) => String(r.onchain_status) === "refunded")
            ? "refunded" : null;
        if (terminalState) {
          const { error: agentSyncError } = await admin.rpc("tl_agent_sync_verified_deal", {
            p_deal_id: deal.id, p_chain_state: terminalState, p_signature: signature,
          });
          if (agentSyncError) console.error("Agent dispute-resolution sync failed:", agentSyncError.message);
        }
      }

      return NextResponse.json({
        ok: true,
        signature,
        action: body.action,
        milestoneIndex: mIndex,
        dealFullyTerminal: allTerminal,
        dbSynced: true,
      });
    } catch (dbErr) {
      console.error("On-chain OK; DB reconciliation failed:", dbErr);
      return NextResponse.json({
        ok: true,
        signature,
        action: body.action,
        milestoneIndex: mIndex,
        dbSynced: false,
        warning:
          "On-chain resolution succeeded, but database sync failed. Use Recover confirmed transaction with this signature — do not send another transaction.",
        error:
          dbErr instanceof Error ? dbErr.message : "Database sync failed.",
      });
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to resolve dispute on-chain.",
      },
      { status: 500 }
    );
  }
}
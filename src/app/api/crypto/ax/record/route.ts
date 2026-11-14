/**
 * POST /api/crypto/ax/record
 *
 * Two-row model: crypto_settlements per (deal_id, milestone_index, ax_leg_index).
 * - create: seed leg 0 (and optionally leg 1 shell) without metadata column
 * - fund: upsert the matching ax_leg_index row with that leg's asset/fee
 * - release/cancel/dispute: update ALL leg rows for the deal
 */

import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import {
  deriveAxPda,
  DEVNET_RPC_URL,
  TRUSTLAYER_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  assetMeta,
  type CryptoAssetCode,
} from "@/lib/crypto/solana";
import { decodeAxSwapAccount } from "@/lib/crypto/ax-accounts";
import { isAxAdapter } from "@/lib/domain/settlement";
import { assertAxWalletsBound } from "@/lib/domain/ax-legs";

type AxRecordAction =
  | "create"
  | "fund"
  | "release"
  | "cancel"
  | "reclaim"
  | "open_dispute"
  | "cancel_unfunded";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const dealId = String(body.dealId || "");
    const action = String(body.action || "") as AxRecordAction;
    const signature = String(body.signature || "").trim();
    const leg = body.leg === 1 || body.leg === "1" ? 1 : 0;

    if (!dealId || !action || !signature) {
      return NextResponse.json(
        { error: "dealId, action, and signature required" },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const admin = createSupabaseAdminClient();
    const { data: deal, error: dealErr } = await admin
      .from("deals")
      .select(
        "id, buyer_id, seller_id, settlement_adapter, chain, rail, fee_mode, asset_code, amount, ax_release_authority, creator_checklist, agent_transaction_id"
      )
      .eq("id", dealId)
      .single();

    if (dealErr || !deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }
    const dealRow = deal;
    if (dealRow.creator_checklist?.agent_transaction_id && !dealRow.agent_transaction_id) {
      return NextResponse.json({ error: "This agent-originated Ax deal is not linked yet. Complete the agent-to-deal bridge before recording funding." }, { status: 409 });
    }
    if (!isAxAdapter(dealRow.settlement_adapter)) {
      return NextResponse.json(
        { error: "Deal is not solana_ax" },
        { status: 400 }
      );
    }

    const signerWallet = String(
      body.signerWallet || body.wallet || ""
    ).trim();

    let isAdmin = false;
    if (user) {
      try {
        const { data } = await (admin.rpc as any)("is_trustlayer_admin", {
          p_user_id: user.id,
        });
        isAdmin = data === true;
      } catch {
        isAdmin = false;
      }
    }

    const isParty = Boolean(
      user &&
        (user.id === dealRow.buyer_id || user.id === dealRow.seller_id)
    );

    const cl = (dealRow as { creator_checklist?: Record<string, unknown> })
      .creator_checklist;
    const mode = String(
      (cl && cl.releaseAuthorityMode) ||
        (dealRow.ax_release_authority ? "custom" : "admin")
    ).toLowerCase();
    let settlePk = "";
    try {
      const { TRUSTLAYER_ADMIN } = await import("@/lib/crypto/solana");
      const custom = String(
        dealRow.ax_release_authority ||
          (cl && (cl.releaseAuthorityPubkey || cl.release_authority_pubkey)) ||
          ""
      ).trim();
      settlePk =
        mode === "custom" && custom.length >= 32
          ? custom
          : TRUSTLAYER_ADMIN.toBase58();
    } catch {
      settlePk = String(dealRow.ax_release_authority || "").trim();
    }

    const signerIsAuthority =
      signerWallet.length >= 32 &&
      settlePk.length >= 32 &&
      signerWallet === settlePk;

    let isAxAuthority = signerIsAuthority;
    if (user && settlePk.length >= 32 && !isAxAuthority) {
      const { data: w } = await admin
        .from("wallets")
        .select("address")
        .eq("user_id", user.id)
        .eq("address", settlePk)
        .limit(1);
      isAxAuthority = (w || []).length > 0;
    }

    const settleAction =
      action === "release" || action === "cancel" || action === "cancel_unfunded";

    if (settleAction) {
      if (!isParty && !isAdmin && !isAxAuthority) {
        return NextResponse.json(
          {
            error:
              "Only the settle authority wallet or a deal party can record release/cancel.",
          },
          { status: 403 }
        );
      }
    } else {
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (!isParty && !isAdmin) {
        return NextResponse.json({ error: "Not a party" }, { status: 403 });
      }
    }

    let partyAWallet = String(body.partyAWallet || body.buyerWallet || "").trim();
    let partyBWallet = String(body.partyBWallet || body.sellerWallet || "").trim();
    if (!partyAWallet || !partyBWallet) {
      const ids = [dealRow.buyer_id, dealRow.seller_id].filter(Boolean) as string[];
      const { data: wallets } = await admin
        .from("wallets")
        .select("user_id, address")
        .in("user_id", ids);
      const byUser = new Map(
        (wallets || []).map((w) => [w.user_id, String(w.address)])
      );
      if (!partyAWallet && dealRow.buyer_id)
        partyAWallet = byUser.get(dealRow.buyer_id) || "";
      if (!partyBWallet && dealRow.seller_id)
        partyBWallet = byUser.get(dealRow.seller_id) || "";
    }
    const bound = assertAxWalletsBound({ partyAWallet, partyBWallet });

    // Existing rows (0, 1, or null)
    const { data: existingRows } = await admin
      .from("crypto_settlements")
      .select("*")
      .eq("deal_id", dealId)
      .eq("milestone_index", 0)
      .order("ax_leg_index", { ascending: true, nullsFirst: true });

    const byLeg = new Map<number, Record<string, unknown>>();
    for (const r of existingRows || []) {
      const idx =
        r.ax_leg_index == null ? -1 : Number(r.ax_leg_index);
      byLeg.set(idx, r as Record<string, unknown>);
    }
    const primary =
      byLeg.get(0) || byLeg.get(-1) || (existingRows || [])[0] || null;

    let chainDealId = String(
      body.chainDealId || primary?.chain_deal_id || ""
    ).trim();
    if (!chainDealId || !/^\d+$/.test(chainDealId)) {
      return NextResponse.json(
        { error: "chainDealId required" },
        { status: 400 }
      );
    }

    const [axPda] = deriveAxPda(
      chainDealId,
      new PublicKey(bound.partyAWallet),
      new PublicKey(bound.partyBWallet)
    );

    const connection = new Connection(
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL || DEVNET_RPC_URL,
      "confirmed"
    );

    const sigStatus = (await connection.getSignatureStatuses([signature]))
      .value[0];
    if (!sigStatus || sigStatus.err) {
      return NextResponse.json(
        {
          error: "Transaction was not confirmed successfully on-chain.",
          signature,
        },
        { status: 409 }
      );
    }

    let fundedA = false;
    let fundedB = false;
    let onchainStatus = "created_unfunded";
    let totalLocked = "0";
    try {
      const info = await connection.getAccountInfo(axPda, "confirmed");
      if (info?.data) {
        const decoded = decodeAxSwapAccount(Buffer.from(info.data));
        fundedA = !!decoded.fundedA;
        fundedB = !!decoded.fundedB;
        totalLocked = (
          BigInt(decoded.lockedA || 0) + BigInt(decoded.lockedB || 0)
        ).toString();
        if (decoded.status === "released") onchainStatus = "released";
        else if (decoded.status === "cancelled") onchainStatus = "cancelled";
        else if (decoded.status === "refunded") onchainStatus = "refunded";
        else if (decoded.status === "disputed") onchainStatus = "disputed";
        else if (fundedA && fundedB) onchainStatus = "funded";
        else onchainStatus = "created_unfunded";
      } else if (action === "create") {
        onchainStatus = "created_unfunded";
      }
    } catch (e) {
      console.warn("[ax/record] decode failed:", e);
    }

    if (action === "create") onchainStatus = "created_unfunded";
    if (action === "fund" && fundedA && fundedB) onchainStatus = "funded";
    if (action === "release") onchainStatus = "released";
    if (action === "cancel" || action === "cancel_unfunded")
      onchainStatus = "cancelled";
    if (action === "reclaim") onchainStatus = "refunded";
    if (action === "open_dispute") onchainStatus = "disputed";

    const { data: legRows } = await admin
      .from("deal_settlement_legs")
      .select("*")
      .eq("deal_id", dealId)
      .order("leg_index", { ascending: true });

    const legDef = (legRows || []).find(
      (r) => Number(r.leg_index) === leg
    ) || (legRows || [])[leg] || (legRows || [])[0];

    function rowForLeg(
      legIndex: number,
      opts: { fundSig?: string; createSig?: string }
    ): Record<string, unknown> {
      const def =
        (legRows || []).find((r) => Number(r.leg_index) === legIndex) ||
        legDef;
      const code = String(
        def?.asset_code || dealRow.asset_code || "SOL"
      ).toUpperCase();
      const isSol = code === "SOL";
      let mint: string | null = null;
      let decimals = Number(def?.decimals ?? (isSol ? 9 : 6));
      if (!isSol && code !== "NFT") {
        try {
          mint = assetMeta(code as CryptoAssetCode).mint.toBase58();
          decimals = assetMeta(code as CryptoAssetCode).decimals;
        } catch {
          mint = def?.mint ? String(def.mint) : null;
        }
      } else if (code === "NFT" && def?.mint) {
        mint = String(def.mint);
        decimals = 0;
      }
      const feeAmt = String(def?.fee_amount ?? 0);
      const amountBase = String(def?.amount_base_units ?? "0");
      const prev = byLeg.get(legIndex) || byLeg.get(-1);

      const row: Record<string, unknown> = {
        deal_id: dealId,
        network: process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet",
        asset_code: code,
        asset_type:
          code === "NFT" ? "nft" : isSol ? "native_sol" : "spl",
        mint,
        decimals: isSol ? 9 : decimals,
        token_program:
          isSol || code === "NFT" ? null : TOKEN_PROGRAM_ID.toBase58(),
        program_id: TRUSTLAYER_PROGRAM_ID.toBase58(),
        chain_deal_id: chainDealId,
        escrow_pda: axPda.toBase58(),
        initiator_wallet: bound.partyAWallet,
        buyer_wallet: bound.partyAWallet,
        seller_wallet: bound.partyBWallet,
        amount_base_units: amountBase,
        settlement_fee_bps: Number(def?.fee_bps ?? 125),
        settlement_fee_amount: feeAmt,
        refund_fee_bps: 50,
        cancellation_fee_bps: 0,
        total_locked: totalLocked,
        funded:
          legIndex === 0
            ? fundedA
            : legIndex === 1
              ? fundedB
              : fundedA && fundedB,
        onchain_status: onchainStatus,
        last_tx_signature: signature,
        last_verified_at: new Date().toISOString(),
        milestone_index: 0,
        milestone_count: 1,
        settlement_kind: "ax",
        ax_leg_index: legIndex,
        fee_payer: "funder",
      };

      if (opts.createSig) row.create_tx_signature = opts.createSig;
      else if (prev?.create_tx_signature)
        row.create_tx_signature = prev.create_tx_signature;

      if (opts.fundSig) row.fund_tx_signature = opts.fundSig;
      else if (prev?.fund_tx_signature)
        row.fund_tx_signature = prev.fund_tx_signature;

      if (action === "release") row.release_tx_signature = signature;
      if (action === "cancel" || action === "cancel_unfunded")
        row.cancel_tx_signature = signature;
      if (action === "reclaim") row.refund_tx_signature = signature;

      return row;
    }

    if (action === "create") {
      // Expression unique index (COALESCE ax_leg_index) — no PostgREST onConflict.
      // Always update-by-id or insert.
      const row0 = rowForLeg(0, { createSig: signature });
      const existing = byLeg.get(0) || byLeg.get(-1);
      if (existing?.id) {
        const { error } = await admin
          .from("crypto_settlements")
          .update(row0)
          .eq("id", existing.id);
        if (error) {
          console.error("[ax/record] create update", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      } else {
        const { error } = await admin.from("crypto_settlements").insert(row0);
        if (error) {
          console.error("[ax/record] create insert", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }
    } else if (action === "fund") {
      const row = rowForLeg(leg, { fundSig: signature });
      const existing = byLeg.get(leg);
      if (existing?.id) {
        const { error } = await admin
          .from("crypto_settlements")
          .update(row)
          .eq("id", existing.id);
        if (error) {
          console.error("[ax/record] fund update", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      } else {
        const { error } = await admin.from("crypto_settlements").insert(row);
        if (error) {
          console.error("[ax/record] fund insert", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }
      // Propagate shared create sig / aggregate status onto the other leg if present
      const other = byLeg.get(leg === 0 ? 1 : 0);
      if (other?.id) {
        await admin
          .from("crypto_settlements")
          .update({
            onchain_status: onchainStatus,
            total_locked: totalLocked,
            last_verified_at: new Date().toISOString(),
            funded: leg === 0 ? fundedB : fundedA,
          })
          .eq("id", other.id);
      }
    } else {
      // Terminal / dispute: update every row for this deal+milestone
      const rows = existingRows || [];
      if (rows.length === 0) {
        const row0 = rowForLeg(0, {});
        await admin.from("crypto_settlements").insert(row0);
      } else {
        for (const r of rows) {
          const patch: Record<string, unknown> = {
            onchain_status: onchainStatus,
            total_locked: totalLocked,
            last_tx_signature: signature,
            last_verified_at: new Date().toISOString(),
            funded: fundedA && fundedB,
          };
          if (action === "release") patch.release_tx_signature = signature;
          if (action === "cancel" || action === "cancel_unfunded")
            patch.cancel_tx_signature = signature;
          if (action === "reclaim") patch.refund_tx_signature = signature;
          await admin
            .from("crypto_settlements")
            .update(patch)
            .eq("id", r.id);
        }
      }
    }

    if (action === "release") {
      await admin
        .from("deals")
        .update({ status: "completed" })
        .eq("id", dealId)
        .in("status", [
          "funded",
          "awaiting_delivery",
          "accepted",
          "awaiting_payment",
          "disputed",
        ]);
    } else if (action === "fund" && fundedA && fundedB) {
      await admin
        .from("deals")
        .update({ status: "funded" })
        .eq("id", dealId)
        .in("status", ["accepted", "awaiting_payment"]);
    } else if (action === "open_dispute") {
      await admin.from("deals").update({ status: "disputed" }).eq("id", dealId);
      try {
        const reason =
          String(body.reason || "").trim() ||
          "Ax on-chain dispute opened by funded party.";
        await (admin.rpc as any)("record_onchain_deal_dispute", {
          p_deal_id: dealId,
          p_milestone_index: 0,
          p_actor_user_id: user?.id ?? null,
          p_reason: reason,
          p_signature: signature,
        });
      } catch (e) {
        console.warn("[ax/record] dispute:", e);
      }
    } else if (action === "cancel" || action === "cancel_unfunded") {
      await admin.from("deals").update({ status: "cancelled" }).eq("id", dealId);
    }

    const fundA =
      (byLeg.get(0)?.fund_tx_signature as string | undefined) ||
      (action === "fund" && leg === 0 ? signature : null);
    const fundB =
      (byLeg.get(1)?.fund_tx_signature as string | undefined) ||
      (action === "fund" && leg === 1 ? signature : null);

    await admin.from("deal_events").insert({
      deal_id: dealId,
      actor_user_id: user?.id ?? null,
      actor_type: isAdmin ? "admin" : isAxAuthority ? "authority" : "user",
      event_type: `ax_${action}_recorded`,
      metadata: {
        signature,
        ax_pda: axPda.toBase58(),
        chain_deal_id: chainDealId,
        leg: action === "fund" ? leg : null,
        funded_a: fundedA,
        funded_b: fundedB,
        onchain_status: onchainStatus,
        fund_a_tx: fundA,
        fund_b_tx: fundB,
      },
    });

    const verifiedAgentState =
      onchainStatus === "funded" ? "funded" :
      onchainStatus === "released" ? "released" :
      onchainStatus === "disputed" ? "disputed" :
      onchainStatus === "cancelled" ? "cancelled" :
      onchainStatus === "refunded" ? "refunded" : null;
    if (verifiedAgentState) {
      const { error: agentSyncError } = await admin.rpc("tl_agent_sync_verified_deal", {
        p_deal_id: dealId, p_chain_state: verifiedAgentState, p_signature: signature,
      });
      if (agentSyncError) console.error("Agent Ax state sync failed:", agentSyncError.message);
    }

    return NextResponse.json({
      ok: true,
      action,
      signature,
      axPda: axPda.toBase58(),
      chainDealId,
      onchainStatus,
      fundedA,
      fundedB,
      bothFunded: fundedA && fundedB,
      fund_a_tx: fundA,
      fund_b_tx: fundB,
      ax_leg_index: action === "fund" ? leg : null,
    });
  } catch (e) {
    console.error("[ax/record]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ax record failed" },
      { status: 500 }
    );
  }
}

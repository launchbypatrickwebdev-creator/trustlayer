/**
 * POST /api/crypto/ax/reconcile
 *
 * Recovery when chain is terminal but DB lags (e.g. release succeeded, record 403).
 * Body: { dealId, signature, action?: "release"|"cancel"|..., signerWallet?: string }
 * Does NOT submit a transaction.
 */

import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import {
  deriveAxPda,
  DEVNET_RPC_URL,
  TRUSTLAYER_ADMIN,
} from "@/lib/crypto/solana";
import {
  verifyAxTerminalTransaction,
  syncAxSettlementTerminalState,
  type AxTerminalAction,
} from "@/lib/crypto/reconcile-from-signature";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const dealId = String(body.dealId || "");
    const signature = String(body.signature || "").trim();
    const signerWallet = String(body.signerWallet || body.wallet || "").trim();
    const expectedAction = body.action
      ? (String(body.action) as AxTerminalAction)
      : undefined;

    if (!dealId || !signature) {
      return NextResponse.json(
        { error: "dealId and signature required" },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const admin = createSupabaseAdminClient();
    const { data: deal } = await admin
      .from("deals")
      .select("id, buyer_id, seller_id, ax_release_authority, creator_checklist, agent_transaction_id")
      .eq("id", dealId)
      .maybeSingle();

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }
    if (deal.creator_checklist?.agent_transaction_id && !deal.agent_transaction_id) {
      return NextResponse.json({ error: "This agent-originated Ax deal is not linked yet. Complete the agent-to-deal bridge before reconciliation." }, { status: 409 });
    }

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
        (user.id === deal.buyer_id || user.id === deal.seller_id)
    );

    const cl = (deal.creator_checklist || {}) as Record<string, unknown>;
    const mode = String(
      cl.releaseAuthorityMode ||
        (deal.ax_release_authority ? "custom" : "admin")
    ).toLowerCase();
    const custom = String(
      deal.ax_release_authority ||
        cl.releaseAuthorityPubkey ||
        cl.release_authority_pubkey ||
        ""
    ).trim();
    const settlePk =
      mode === "custom" && custom.length >= 32
        ? custom
        : TRUSTLAYER_ADMIN.toBase58();
    const isAuthority =
      signerWallet.length >= 32 && signerWallet === settlePk;

    if (!isParty && !isAdmin && !isAuthority) {
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Two-row model: pick any row with chain_deal_id
    const { data: rows } = await admin
      .from("crypto_settlements")
      .select("*")
      .eq("deal_id", dealId)
      .order("ax_leg_index", { ascending: true, nullsFirst: true });

    const settlement =
      (rows || []).find((r) => r.chain_deal_id) || (rows || [])[0] || null;

    if (!settlement?.chain_deal_id) {
      return NextResponse.json(
        { error: "No Ax settlement / chain_deal_id on this deal." },
        { status: 404 }
      );
    }

    const chainDealId = String(settlement.chain_deal_id);
    const partyA = String(
      settlement.buyer_wallet || settlement.initiator_wallet || ""
    );
    const partyB = String(settlement.seller_wallet || "");
    if (!partyA || !partyB) {
      return NextResponse.json(
        { error: "Settlement is missing party wallets for PDA derivation." },
        { status: 409 }
      );
    }

    const [axPda] = deriveAxPda(
      chainDealId,
      new PublicKey(partyA),
      new PublicKey(partyB)
    );

    const connection = new Connection(
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL || DEVNET_RPC_URL,
      "confirmed"
    );

    let verified: Awaited<ReturnType<typeof verifyAxTerminalTransaction>> | null =
      null;
    try {
      verified = await verifyAxTerminalTransaction(connection, signature, {
        chainDealId,
        axPda,
        expectedAction,
      });
    } catch (e) {
      // Signature may still be a successful release that closed the PDA —
      // fall back to PDA absence + confirmed signature status
      const st = (await connection.getSignatureStatuses([signature])).value[0];
      if (!st || st.err) {
        return NextResponse.json(
          {
            error:
              e instanceof Error
                ? e.message
                : "Could not verify Ax terminal transaction.",
          },
          { status: 409 }
        );
      }
      const info = await connection.getAccountInfo(axPda, "confirmed");
      if (info) {
        return NextResponse.json(
          {
            error:
              e instanceof Error
                ? e.message
                : "Ax PDA still open; signature was not a completed terminal ix.",
          },
          { status: 409 }
        );
      }
      // PDA closed + confirmed sig → treat as release unless action says cancel
      const act = (expectedAction || "release") as AxTerminalAction;
      verified = {
        signature,
        action: act,
        status:
          act === "cancel" || act === "cancel_unfunded"
            ? "cancelled"
            : act === "reclaim"
              ? "refunded"
              : "released",
        chainDealId,
        axPda: axPda.toBase58(),
        pdaClosed: true,
        logs: [],
      } as any;
    }

    // Sync every settlement row for this deal
    const warnings: string[] = [];
    let dealSynced = false;
    for (const row of rows || [settlement]) {
      const sync = await syncAxSettlementTerminalState({
        settlementId: row.id,
        dealId,
        userId: user?.id || null,
        signature,
        axPda: axPda.toBase58(),
        chainDealId,
        status: verified!.status,
        action: verified!.action,
      });
      warnings.push(...(sync.warnings || []));
      if (sync.dealSynced) dealSynced = true;
    }

    // Force deal status if helper skipped
    if (verified!.status === "released") {
      await admin
        .from("deals")
        .update({ status: "completed" })
        .eq("id", dealId)
        .in("status", [
          "funded",
          "awaiting_payment",
          "awaiting_delivery",
          "accepted",
          "disputed",
        ]);
      await admin
        .from("crypto_settlements")
        .update({
          onchain_status: "released",
          release_tx_signature: signature,
          last_tx_signature: signature,
        })
        .eq("deal_id", dealId);
      dealSynced = true;
    } else if (
      verified!.status === "cancelled" ||
      verified!.action === "cancel"
    ) {
      await admin
        .from("deals")
        .update({ status: "cancelled" })
        .eq("id", dealId);
      await admin
        .from("crypto_settlements")
        .update({
          onchain_status: "cancelled",
          cancel_tx_signature: signature,
          last_tx_signature: signature,
        })
        .eq("deal_id", dealId);
      dealSynced = true;
    }

    const agentState = verified!.status === "released" ? "released"
      : verified!.status === "cancelled" ? "cancelled"
      : verified!.status === "refunded" ? "refunded"
      : verified!.status === "disputed" ? "disputed" : null;
    if (agentState) {
      const { error: agentSyncError } = await admin.rpc("tl_agent_sync_verified_deal", {
        p_deal_id: dealId, p_chain_state: agentState, p_signature: signature,
      });
      if (agentSyncError) console.error("Agent Ax reconcile sync failed:", agentSyncError.message);
    }

    return NextResponse.json({
      ok: true,
      reconciled: true,
      verified,
      dealSynced,
      warnings,
    });
  } catch (e) {
    console.error("[ax/reconcile]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ax reconcile failed" },
      { status: 500 }
    );
  }
}

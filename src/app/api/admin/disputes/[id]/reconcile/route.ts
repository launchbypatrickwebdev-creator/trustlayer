
import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { requireAdminUser } from "@/lib/domain/admin";
import { DEVNET_RPC_URL, deriveEscrowPda } from "@/lib/crypto/solana";
import {
  syncSettlementTerminalState,
  verifyTrustLayerTerminalTransaction,
} from "@/lib/crypto/reconcile-from-signature";

function validSignature(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(value);
}

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
    const body = (await request.json()) as { signature?: string; notes?: string };
    if (!body.signature || !validSignature(body.signature)) {
      return NextResponse.json({ error: "A valid transaction signature is required." }, { status: 400 });
    }

    const { user } = await requireAdminUser();
    const admin = createSupabaseAdminClient();
    const { data: dispute, error: disputeError } = await admin
      .from("deal_disputes")
      .select("*")
      .eq("id", disputeId)
      .maybeSingle();
    if (disputeError || !dispute) return NextResponse.json({ error: "Dispute not found." }, { status: 404 });

    const allowedStatuses = ["open", "resolved_release", "resolved_refund"];
    if (!allowedStatuses.includes(String(dispute.status))) {
      return NextResponse.json({ error: "This dispute cannot be reconciled." }, { status: 409 });
    }

    const mIndex = Number(dispute.milestone_index);
    // Ax may have two rows; maybeSingle fails when both exist.
    const { data: settlementRows, error: settlementError } = await admin
      .from("crypto_settlements")
      .select("*")
      .eq("deal_id", dispute.deal_id)
      .eq("milestone_index", mIndex)
      .order("ax_leg_index", { ascending: true });
    const settlementList = settlementRows || [];
    const settlement =
      settlementList.find(
        (r: any) => r.ax_leg_index === 0 || r.ax_leg_index === "0"
      ) || settlementList[0] || null;
    if (settlementError || !settlement?.chain_deal_id) {
      return NextResponse.json({ error: "No crypto settlement exists for the disputed milestone." }, { status: 409 });
    }

    let initiator: PublicKey;
    try {
      initiator = new PublicKey(String(settlement.initiator_wallet));
    } catch {
      return NextResponse.json({ error: "Invalid settlement initiator wallet." }, { status: 409 });
    }
    const [escrowPda] = deriveEscrowPda(initiator, String(settlement.chain_deal_id), mIndex);

    const verified = await verifyTrustLayerTerminalTransaction(
      new Connection(DEVNET_RPC_URL, "confirmed"),
      body.signature,
      {
        chainDealId: String(settlement.chain_deal_id),
        milestoneIndex: mIndex,
        initiator,
        escrowPda,
      }
    );

    // TerminalAction is 1-leg; Ax actions compared as string so TS accepts both paths.
    const verifiedAction = String(verified.action);
    const acceptedActions = new Set([
      "admin_resolve_release",
      "admin_resolve_refund",
      "admin_resolve_release_ax",
      "admin_resolve_refund_ax",
      "release_ax",
      "cancel_ax",
    ]);
    if (!acceptedActions.has(verifiedAction)) {
      return NextResponse.json(
        { error: "The supplied transaction is not an admin on-chain resolution." },
        { status: 409 }
      );
    }

    const expectedDisputeStatus = verified.status === "released" ? "resolved_release" : "resolved_refund";
    if (dispute.status !== "open" && dispute.status !== expectedDisputeStatus) {
      return NextResponse.json({ error: "Dispute resolution action does not match the existing dispute state." }, { status: 409 });
    }

    await syncSettlementTerminalState({
      settlementId: settlement.id,
      dealId: dispute.deal_id,
      signature: body.signature,
      escrowPda: verified.escrowPda,
      status: verified.status,
      eventType: verified.action === "admin_resolve_release"
        ? "admin_onchain_resolve_release"
        : "admin_onchain_resolve_refund",
      actorUserId: user.id,
      actorType: "admin",
      milestoneIndex: mIndex,
      chainDealId: String(settlement.chain_deal_id),
      metadata: {
        dispute_id: disputeId,
        notes: String(body.notes ?? dispute.resolution_notes ?? "").trim() || null,
        reconciled: true,
      },
    });

    const now = new Date().toISOString();
    if (dispute.status === "open") {
      const { error } = await admin
        .from("deal_disputes")
        .update({
          status: expectedDisputeStatus,
          resolved_at: now,
          resolved_by: user.id,
          resolution_notes: String(body.notes ?? "").trim() || dispute.resolution_notes || null,
        })
        .eq("id", disputeId)
        .eq("status", "open");
      if (error) throw new Error(error.message);
    }

    const { data: remaining, error: remainingError } = await admin
      .from("deal_disputes")
      .select("id")
      .eq("deal_id", dispute.deal_id)
      .eq("status", "open")
      .neq("id", disputeId);
    if (remainingError) throw new Error(remainingError.message);

    const { data: all, error: allError } = await admin
      .from("crypto_settlements")
      .select("onchain_status")
      .eq("deal_id", dispute.deal_id);
    if (allError) throw new Error(allError.message);

    const allTerminal = (all?.length ?? 0) > 0 && all!.every((r) =>
      ["released", "cancelled", "refunded"].includes(String(r.onchain_status))
    );
    const allSettledOrFunded = (all?.length ?? 0) > 0 && all!.every((r) =>
      ["funded", "released", "cancelled", "refunded"].includes(String(r.onchain_status))
    );

    if (!allTerminal) {
      const nextStatus = (remaining?.length ?? 0) > 0
        ? "disputed"
        : allSettledOrFunded
          ? "funded"
          : "awaiting_payment";
      const { error } = await admin.from("deals").update({ status: nextStatus }).eq("id", dispute.deal_id);
      if (error) throw new Error(error.message);
    } else {
      const { data: linkedDeal } = await admin.from("deals").select("agent_transaction_id").eq("id", dispute.deal_id).maybeSingle();
      const terminalState = all!.every((r) => String(r.onchain_status) === "released")
        ? "released"
        : all!.every((r) => String(r.onchain_status) === "refunded")
          ? "refunded" : null;
      if (linkedDeal?.agent_transaction_id && terminalState) {
        const { error: agentSyncError } = await admin.rpc("tl_agent_sync_verified_deal", {
          p_deal_id: dispute.deal_id, p_chain_state: terminalState, p_signature: body.signature,
        });
        if (agentSyncError) console.error("Agent admin resolution reconciliation failed:", agentSyncError.message);
      }
    }

    return NextResponse.json({
      ok: true,
      reconciled: true,
      signature: body.signature,
      action: verified.action,
      status: verified.status,
      milestoneIndex: mIndex,
      escrowPda: verified.escrowPda,
    });
  } catch (error) {
    console.error("Admin dispute reconciliation failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to reconcile admin resolution." },
      { status: 409 }
    );
  }
}

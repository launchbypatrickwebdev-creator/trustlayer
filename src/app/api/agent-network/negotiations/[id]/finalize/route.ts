import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await createSupabaseServerClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data: n, error: nError } = await s.from("trustlayer_agent_negotiations").select("*").eq("id", id).eq("buyer_owner_user_id", user.id).single();
  if (nError || !n) return NextResponse.json({ error: "Negotiation not found or only the buyer owner can finalize it." }, { status: 404 });
  if (n.status === "converted" && n.transaction_id) return NextResponse.json({ transactionId: n.transaction_id, replayed: true });
  if (n.status !== "offer_accepted") return NextResponse.json({ error: "The seller must accept an offer before it can become a TrustLayer transaction." }, { status: 409 });
  const { data: offer, error: offerError } = await s.from("trustlayer_agent_negotiation_offers").select("*").eq("negotiation_id", id).eq("status", "accepted").order("round_number", { ascending: false }).limit(1).single();
  if (offerError || !offer) return NextResponse.json({ error: "Accepted offer not found." }, { status: 409 });

  // The database RPC is the authoritative policy gate. AI output and negotiated
  // amounts cannot bypass spending limits, flagged-counterparty checks or approvals.
  const { data: transaction, error } = await s.rpc("tl_agent_create_transaction", {
    p_buyer_agent_id: n.buyer_agent_id,
    p_seller_agent_id: n.seller_agent_id,
    p_task: n.task,
    p_amount_usd: offer.amount_usd,
    p_purpose: n.purpose,
    p_deliverable: offer.scope_note || n.deliverable,
    p_acceptance_criteria: n.acceptance_criteria,
    p_idempotency_key: `negotiation-${n.id}`,
  });
  if (error || !transaction) return NextResponse.json({ error: error?.message ?? "TrustLayer policy evaluation failed." }, { status: 400 });
  const { error: intentError } = await s.rpc("tl_agent_copy_settlement_intent", { p_negotiation_id: id, p_transaction_id: transaction.id });
  if (intentError) return NextResponse.json({ error: `Transaction created but settlement intent could not be locked: ${intentError.message}` }, { status: 500 });
  const { error: linkError } = await s.rpc("tl_agent_link_negotiation_transaction", { p_negotiation_id: id, p_transaction_id: transaction.id });
  if (linkError) return NextResponse.json({ error: "Transaction was created but negotiation linking failed. Retry safely; the idempotency key prevents a duplicate." }, { status: 500 });
  const { data: refreshed } = await s.from("trustlayer_agent_transactions").select("*").eq("id", transaction.id).single();
  return NextResponse.json({ negotiationId: id, transaction: refreshed ?? transaction, policyDecision: transaction.policy_decision }, { status: 201 });
}

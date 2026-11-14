import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { quoteAgentSwap } from "@/lib/near-intents/client";
export const dynamic = "force-dynamic";

/**
 * Read-only NEAR Intents quote endpoint for an accepted agent transaction.
 * This endpoint cannot execute a swap, create a TrustLayer deal or mark funds paid.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await createSupabaseServerClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data: tx, error } = await s.from("trustlayer_agent_transactions")
    .select("id,owner_user_id,status,policy_decision,amount_usd,agreement_hash,deal_id")
    .eq("id", id).single();
  if (error || !tx) return NextResponse.json({ error: "Agent transaction not found." }, { status: 404 });
  if (tx.owner_user_id !== user.id) return NextResponse.json({ error: "Only buyer owner can request an execution quote." }, { status: 403 });
  if (tx.status !== "agreed" || tx.policy_decision === "blocked") return NextResponse.json({ error: "An allowed, seller-accepted agent transaction is required." }, { status: 409 });
  if (tx.policy_decision === "approval_required") {
    const { data: approval } = await s.from("trustlayer_agent_transaction_events").select("id")
      .eq("transaction_id", id).eq("actor_user_id", user.id).eq("event_type", "human_approved").limit(1).maybeSingle();
    if (!approval) return NextResponse.json({ error: "Buyer owner policy approval is required before requesting an execution quote." }, { status: 403 });
  }
  if (!tx.deal_id) return NextResponse.json({ error: "Promote the accepted agent transaction into a TrustLayer deal before requesting an execution quote." }, { status: 409 });
  try {
    const b = await req.json() as Record<string, unknown>;
    const quote = await quoteAgentSwap({
      agentId: String(b.agentId ?? ""),
      originAsset: String(b.originAsset ?? ""),
      destinationAsset: String(b.destinationAsset ?? ""),
      amount: String(b.amount ?? ""),
    });
    return NextResponse.json({
      quote, mode: "dry_quote",
      dealId: tx.deal_id,
      agreementHash: tx.agreement_hash,
      executionAllowed: false,
      message: "Quote only. A TrustLayer deal, owner execution grant, wallet authorization and verified chain record are still required before any funds move.",
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "NEAR Intents quote unavailable." }, { status: 503 });
  }
}

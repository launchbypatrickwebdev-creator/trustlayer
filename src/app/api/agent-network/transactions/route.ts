import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data, error } = await supabase.from("trustlayer_agent_transactions")
    .select("*,buyer_agent:trustlayer_agents!trustlayer_agent_transactions_buyer_agent_id_fkey(display_name,public_handle),seller_agent:trustlayer_agents!trustlayer_agent_transactions_seller_agent_id_fkey(display_name,public_handle)")
    .order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as Array<Record<string, any> & { id: string; owner_user_id: string }>;
  const ids = rows.map((row) => row.id);
  const { data: approvals } = ids.length
    ? await supabase.from("trustlayer_agent_transaction_events")
        .select("transaction_id,event_type,details").in("transaction_id", ids)
        .eq("actor_user_id", user.id).in("event_type", ["execution_grant_owner_approved", "procurement_threshold_approved"])
    : { data: [] as { transaction_id: string; details: Record<string, unknown> | null }[] };
  const approvedByTransaction = new Map<string, string[]>();
  const procurementApprovedTransactions = new Set<string>();
  for (const event of (approvals ?? []) as Array<{ transaction_id: string; event_type?: string; details: Record<string, unknown> | null }>) {
    if (event.event_type === "procurement_threshold_approved") { procurementApprovedTransactions.add(event.transaction_id); continue; }
    const grantId = String(event.details?.grant_id ?? "");
    if (!grantId) continue;
    const current = approvedByTransaction.get(event.transaction_id) ?? [];
    current.push(grantId);
    approvedByTransaction.set(event.transaction_id, current);
  }
  return NextResponse.json({ transactions: rows.map((row) => ({
    ...row, viewerRole: row.owner_user_id === user.id ? "buyer" : "seller",
    executionApprovedGrantIds: approvedByTransaction.get(row.id) ?? [],
    procurementThresholdApproved: procurementApprovedTransactions.has(row.id),
  })) });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const body = await req.json() as Record<string, unknown>;
    const task = String(body.task ?? "").trim();
    const purpose = String(body.purpose ?? "").trim();
    const deliverable = String(body.deliverable ?? "").trim();
    const acceptanceCriteria = String(body.acceptanceCriteria ?? "").trim();
    const amount = Number(body.amountUsd);
    const buyerAgentId = String(body.buyerAgentId ?? "");
    const sellerAgentId = String(body.sellerAgentId ?? "");
    const idempotencyKey = String(body.idempotencyKey ?? "");
    if (!task || !purpose || !deliverable || !acceptanceCriteria || !buyerAgentId || !sellerAgentId || !Number.isFinite(amount) || amount <= 0 || idempotencyKey.length < 8) return NextResponse.json({ error: "Buyer and seller agents, task, positive amount, purpose, deliverable, acceptance criteria and idempotency key are required." }, { status: 400 });
    const { data, error } = await supabase.rpc("tl_agent_create_transaction", { p_buyer_agent_id: buyerAgentId, p_seller_agent_id: sellerAgentId, p_task: task, p_amount_usd: amount, p_purpose: purpose, p_deliverable: deliverable, p_acceptance_criteria: acceptanceCriteria, p_idempotency_key: idempotencyKey });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ transaction: data }, { status: 201 });
  } catch { return NextResponse.json({ error: "Invalid transaction proposal." }, { status: 400 }); }
}

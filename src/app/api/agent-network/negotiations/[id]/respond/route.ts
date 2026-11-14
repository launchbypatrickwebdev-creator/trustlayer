import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await createSupabaseServerClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const b = await req.json() as Record<string, unknown>;
    const action = String(b.action ?? "");
    const amount = b.amountUsd === undefined ? null : Number(b.amountUsd);
    const scope = b.scopeNote === undefined ? null : String(b.scopeNote).trim();
    const rationale = String(b.rationale ?? b.reason ?? "").trim().slice(0, 1000);
    const idempotencyKey = String(b.idempotencyKey ?? req.headers.get("Idempotency-Key") ?? "");
    if (action === "counter" && (!Number.isFinite(amount) || !scope || scope.length < 3 || scope.length > 2000)) {
      return NextResponse.json({ error: "Provide a valid counteroffer and scope note." }, { status: 400 });
    }
    const { data, error } = await s.rpc("tl_agent_respond_negotiation_idempotent", {
      p_negotiation_id: id,
      p_action: action,
      p_amount_usd: amount,
      p_scope_note: scope,
      p_rationale: rationale,
      p_idempotency_key: idempotencyKey,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data ?? { state: "updated" }, { status: action === "counter" ? 201 : 200 });
  } catch {
    return NextResponse.json({ error: "Invalid negotiation response." }, { status: 400 });
  }
}

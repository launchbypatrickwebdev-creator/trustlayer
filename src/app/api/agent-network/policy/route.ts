import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
export const dynamic = "force-dynamic";
export async function GET() {
  const s = await createSupabaseServerClient(); const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data, error } = await s.rpc("tl_agent_ensure_policy");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ policy: data });
}
export async function PATCH(req: Request) {
  const s = await createSupabaseServerClient(); const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const b = await req.json() as Record<string, unknown>;
    const max = Number(b.maxTransactionUsd); const auto = Number(b.autonomousLimitUsd); const daily = Number(b.dailyLimitUsd);
    if (![max,auto,daily].every(Number.isFinite) || max <= 0 || auto < 0 || daily <= 0 || auto > max) return NextResponse.json({ error: "Policy limits are invalid. Autonomous limit must not exceed the transaction limit." }, { status: 400 });
    const { data, error } = await s.rpc("tl_agent_update_policy", { p_max_transaction_usd: max, p_autonomous_limit_usd: auto, p_daily_limit_usd: daily });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ policy: data });
  } catch { return NextResponse.json({ error: "Invalid policy request." }, { status: 400 }); }
}

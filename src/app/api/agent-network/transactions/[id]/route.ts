import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data: transaction, error } = await supabase.from("trustlayer_agent_transactions").select("*").eq("id", id).single();
  if (error || !transaction) return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
  const [events, evidence] = await Promise.all([supabase.from("trustlayer_agent_transaction_events").select("*").eq("transaction_id", id).order("created_at"), supabase.from("trustlayer_agent_evidence").select("*").eq("transaction_id", id).order("created_at")]);
  if (events.error || evidence.error) return NextResponse.json({ error: "Unable to load transaction history." }, { status: 500 });
  return NextResponse.json({ transaction, events: events.data ?? [], evidence: evidence.data ?? [] });
}

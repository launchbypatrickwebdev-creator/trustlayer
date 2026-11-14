import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await createSupabaseServerClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data, error } = await s.from("trustlayer_agent_seller_authorities")
    .select("*,agent:trustlayer_agents!trustlayer_agent_seller_authorities_agent_id_fkey(id,display_name,public_handle,agent_type,status)")
    .eq("owner_user_id", user.id).order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Unable to load seller authority. Apply migration 202611130003_agent_seller_authority.sql first." }, { status: 500 });
  const { data: agents, error: agentsError } = await s.from("trustlayer_agents")
    .select("id,display_name,public_handle,agent_type,status").eq("owner_user_id", user.id).in("agent_type", ["seller", "general"]).order("created_at", { ascending: false });
  if (agentsError) return NextResponse.json({ error: "Unable to load your seller agents." }, { status: 500 });
  return NextResponse.json({ authorities: data ?? [], agents: agents ?? [] });
}

export async function POST(req: Request) {
  const s = await createSupabaseServerClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const b = await req.json() as Record<string, unknown>;
    const agentId = String(b.agentId ?? "");
    const min = Number(b.minPriceUsd);
    const preferred = Number(b.preferredPriceUsd);
    const rounds = Number(b.maxNegotiationRounds ?? 5);
    const validUntil = b.validUntil ? new Date(String(b.validUntil)).toISOString() : null;
    if (!agentId || !Number.isFinite(min) || !Number.isFinite(preferred) || min <= 0 || preferred < min || !Number.isInteger(rounds) || rounds < 1 || rounds > 10) {
      return NextResponse.json({ error: "Choose a seller agent, enter a positive minimum price, a preferred price at least as high, and 1–10 negotiation rounds." }, { status: 400 });
    }
    const { data, error } = await s.rpc("tl_agent_set_seller_authority", {
      p_agent_id: agentId,
      p_min_price_usd: min,
      p_preferred_price_usd: preferred,
      p_allow_auto_counter: b.allowAutoCounter === true,
      p_allow_auto_accept: b.allowAutoAccept === true,
      p_max_negotiation_rounds: rounds,
      p_authority_active: b.authorityActive !== false,
      p_valid_until: validUntil,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ authority: data }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Invalid seller authority settings. Check the expiry date and values." }, { status: 400 });
  }
}

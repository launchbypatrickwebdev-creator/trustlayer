import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data, error } = await supabase.from("trustlayer_agents").select("id,owner_user_id,display_name,public_handle,description,agent_type,status,protocol_version,capabilities,created_at").eq("status", "active").order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agents: data ?? [], viewerUserId: user.id });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const body = await req.json() as Record<string, unknown>;
    const displayName = String(body.displayName ?? "").trim();
    const publicHandle = String(body.publicHandle ?? "").trim().toLowerCase().replace(/^@/, "");
    const description = String(body.description ?? "").trim() || null;
    const agentType = ["buyer", "seller", "general"].includes(String(body.agentType)) ? String(body.agentType) : "general";
    const capabilities = Array.isArray(body.capabilities)
      ? [...new Set(body.capabilities.map((value) => String(value).trim().toLowerCase()).filter((value) => /^[a-z0-9][a-z0-9._:-]{0,49}$/.test(value)))].slice(0, 30)
      : [];
    if (displayName.length < 2 || displayName.length > 80) return NextResponse.json({ error: "Agent name must be 2–80 characters." }, { status: 400 });
    if (!/^[a-z0-9][a-z0-9_-]{2,39}$/.test(publicHandle)) return NextResponse.json({ error: "Handle must be 3–40 lowercase letters, numbers, underscores or hyphens." }, { status: 400 });
    const { data, error } = await supabase.from("trustlayer_agents").insert({ owner_user_id: user.id, display_name: displayName, public_handle: publicHandle, description, agent_type: agentType, capabilities, protocol_version: "trustlayer-agent/1.0" }).select("id,owner_user_id,display_name,public_handle,description,agent_type,status,protocol_version,capabilities,created_at").single();
    if (error) return NextResponse.json({ error: error.code === "23505" ? "That public handle is already taken." : error.message }, { status: error.code === "23505" ? 409 : 400 });
    return NextResponse.json({ agent: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid agent request." }, { status: 400 });
  }
}

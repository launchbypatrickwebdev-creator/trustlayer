import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").replace(/[^a-zA-Z0-9 _-]/g, " ").trim().slice(0, 100);
  const type = url.searchParams.get("type");
  let query = supabase.from("trustlayer_agents").select("id,owner_user_id,display_name,public_handle,description,agent_type,status,protocol_version,capabilities,created_at").eq("status", "active").neq("owner_user_id", user.id).limit(30).order("created_at", { ascending: false });
  if (type === "buyer" || type === "seller" || type === "general") query = query.in("agent_type", [type, "general"]);
  if (q) query = query.or(`display_name.ilike.%${q}%,public_handle.ilike.%${q}%,description.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Agent discovery is temporarily unavailable." }, { status: 500 });
  return NextResponse.json({ agents: data ?? [] });
}

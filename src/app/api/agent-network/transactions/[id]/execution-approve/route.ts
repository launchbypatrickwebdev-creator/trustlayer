import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await createSupabaseServerClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const body = await req.json() as { grantId?: unknown };
    const grantId = String(body.grantId ?? "");
    if (!grantId) return NextResponse.json({ error: "Execution grant ID is required." }, { status: 400 });
    const { data, error } = await s.rpc("tl_agent_approve_execution_grant", {
      p_transaction_id: id, p_grant_id: grantId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ approval: data });
  } catch {
    return NextResponse.json({ error: "Invalid execution approval request." }, { status: 400 });
  }
}

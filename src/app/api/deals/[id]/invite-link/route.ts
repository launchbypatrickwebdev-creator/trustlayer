import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";

/**
 * Creator-only: return the real deal_invitations.token invite URL.
 * Use when an old link used a client UUID that never matched the DB.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: dealId } = await context.params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();
    const { data: deal } = await admin
      .from("deals")
      .select("id, created_by, deal_code")
      .eq("id", dealId)
      .maybeSingle();

    if (!deal || deal.created_by !== user.id) {
      return NextResponse.json({ error: "Deal not found." }, { status: 404 });
    }

    const { data: inv } = await admin
      .from("deal_invitations")
      .select("token, status, expires_at")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!inv?.token) {
      return NextResponse.json(
        { error: "No invitation token for this deal." },
        { status: 404 }
      );
    }

    const origin =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      "http://localhost:3000";
    const inviteUrl = `${origin}/login?invite=${encodeURIComponent(String(inv.token))}`;

    return NextResponse.json({
      dealId,
      dealCode: deal.deal_code,
      token: inv.token,
      status: inv.status,
      expiresAt: inv.expires_at,
      inviteUrl,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unable to load invite link." },
      { status: 500 }
    );
  }
}

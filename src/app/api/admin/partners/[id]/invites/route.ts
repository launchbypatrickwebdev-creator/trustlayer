import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createPartnerInvite } from "@/lib/domain/partner-api/create-partner-invite";

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createSupabaseAdminClient();
  try {
    const { data: isAdmin } = await (admin.rpc as any)("is_trustlayer_admin", {
      p_user_id: user.id,
    });
    return isAdmin === true ? user : null;
  } catch {
    return null;
  }
}

/** POST { email?, role?, partner_only?, expires_in_days? } — returns invite_url once */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: partnerId } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    new URL(request.url).origin;

  try {
    const invite = await createPartnerInvite({
      partnerId,
      email: body.email || null,
      role: body.role || "developer",
      partnerOnly: body.partner_only !== false,
      invitedBy: user.id,
      expiresInDays: body.expires_in_days ?? 14,
      siteOrigin: origin,
    });
    return NextResponse.json({ data: invite }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 }
    );
  }
}

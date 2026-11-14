import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";

export async function getPartnerSession(request: Request, partnerId: string, allowedRoles: string[] = ["owner", "developer", "viewer"]) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const admin = createSupabaseAdminClient();
  const { data: member } = await admin.from("partner_members")
    .select("role, partner_id, api_partners(id, name, status)")
    .eq("user_id", user.id).eq("partner_id", partnerId).maybeSingle();
  if (!member) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  if (!allowedRoles.includes(String(member.role))) return { error: NextResponse.json({ error: "Insufficient workspace permissions" }, { status: 403 }) } as const;
  const partner = Array.isArray((member as any).api_partners) ? (member as any).api_partners[0] : (member as any).api_partners;
  if (!partner || partner.status !== "active") return { error: NextResponse.json({ error: "Partner workspace is not active" }, { status: 403 }) } as const;
  // Browser mutations are same-origin cookie-authenticated operations. Reject cross-origin posts.
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    if (!origin) return { error: NextResponse.json({ error: "Origin header required for browser mutation" }, { status: 403 }) } as const;
    try { if (new URL(origin).origin !== new URL(request.url).origin) return { error: NextResponse.json({ error: "Invalid request origin" }, { status: 403 }) } as const; }
    catch { return { error: NextResponse.json({ error: "Invalid request origin" }, { status: 403 }) } as const; }
  }
  return { user, admin, member, partner } as const;
}

export async function writePartnerAuditEvent(input: {
  partnerId: string; actorUserId: string; action: string; targetType?: string;
  targetId?: string | null; metadata?: Record<string, unknown>;
}) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("partner_audit_events").insert({
    partner_id: input.partnerId, actor_user_id: input.actorUserId,
    action: input.action, target_type: input.targetType || null,
    target_id: input.targetId || null, metadata: input.metadata || {},
  });
  if (error) throw new Error(`Audit event could not be written: ${error.message}`);
}

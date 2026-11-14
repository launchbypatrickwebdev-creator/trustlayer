import { NextResponse } from "next/server";
import { getPartnerSession, writePartnerAuditEvent } from "@/lib/domain/partner-api/partner-session";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const partnerId = String(body.partner_id || "");
  if (!partnerId || !id) return NextResponse.json({ error: "partner_id and key id are required" }, { status: 400 });
  const session = await getPartnerSession(request, partnerId, ["owner"]);
  if ("error" in session) return session.error;
  const { data, error } = await session.admin.from("api_credentials").update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", id).eq("partner_id", partnerId).eq("status", "active")
    .select("id, status, revoked_at").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not revoke key" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Active key not found" }, { status: 404 });
  try { await writePartnerAuditEvent({ partnerId, actorUserId: session.user.id, action: "api_key.revoked", targetType: "api_credential", targetId: id }); }
  catch { return NextResponse.json({ error: "Key was revoked but audit logging failed; contact support" }, { status: 500 }); }
  return NextResponse.json({ data });
}

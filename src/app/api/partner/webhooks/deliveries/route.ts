import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { writePartnerAuditEvent } from "@/lib/domain/partner-api/partner-session";

/** Re-queue a failed delivery after membership, environment and endpoint checks. */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return NextResponse.json({ error: "Origin header required" }, { status: 403 });
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  } catch { return NextResponse.json({ error: "Invalid request origin" }, { status: 403 }); }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
  const deliveryId = String(body.delivery_id || "");
  if (!deliveryId || body.action !== "retry") return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: delivery } = await admin.from("webhook_deliveries")
    .select("id, partner_id, status, environment, endpoint_id")
    .eq("id", deliveryId).maybeSingle();
  if (!delivery) return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
  if (!["failed", "dead"].includes(String(delivery.status))) return NextResponse.json({ error: "Only failed or dead deliveries can be retried" }, { status: 409 });

  if (delivery.endpoint_id) {
    const { data: endpoint } = await admin.from("webhook_endpoints").select("status,environment")
      .eq("id", delivery.endpoint_id).eq("partner_id", delivery.partner_id).maybeSingle();
    if (!endpoint || endpoint.status !== "active" || endpoint.environment !== delivery.environment) {
      return NextResponse.json({ error: "Enable the matching endpoint before replaying this delivery" }, { status: 409 });
    }
  }

  const { data: member } = await admin.from("partner_members").select("id,role")
    .eq("partner_id", delivery.partner_id).eq("user_id", user.id).maybeSingle();
  let allowed = !!member && ["owner", "developer"].includes(String(member.role));
  if (delivery.environment === "live" && member?.role !== "owner") allowed = false;
  if (!allowed) {
    try {
      const { data: isAdmin } = await (admin.rpc as any)("is_trustlayer_admin", {
        p_user_id: user.id,
      });
      allowed = isAdmin === true;
    } catch {
      allowed = false;
    }
  }
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: retried, error } = await admin.from("webhook_deliveries").update({
    status: "pending", attempts: 0, last_status_code: null, last_error: null,
    processing_started_at: null, next_attempt_at: new Date().toISOString(),
  }).eq("id", deliveryId).in("status", ["failed", "dead"]).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not re-queue webhook delivery" }, { status: 500 });
  if (!retried) return NextResponse.json({ error: "Delivery status changed; refresh and retry if it is still failed" }, { status: 409 });

  try {
    await writePartnerAuditEvent({ partnerId: String(delivery.partner_id), actorUserId: user.id, action: "webhook_delivery.retried", targetType: "webhook_delivery", targetId: deliveryId, metadata: { previous_status: delivery.status, environment: delivery.environment } });
  } catch {
    return NextResponse.json({ error: "Delivery was re-queued but audit logging failed; contact support" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

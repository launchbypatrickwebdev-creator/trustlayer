import { NextResponse } from "next/server";
import { assertSafeWebhookUrl } from "@/lib/api/webhook-url";
import { encryptWebhookSecret } from "@/lib/api/webhook-secrets";
import { hashWebhookSecret, newWebhookSecret } from "@/lib/api/webhooks-dispatch";
import { getPartnerSession, writePartnerAuditEvent } from "@/lib/domain/partner-api/partner-session";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
  const partnerId = String(body.partner_id || "");
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });
  const session = await getPartnerSession(request, partnerId, ["owner", "developer"]);
  if ("error" in session) return session.error;
  const environment = body.environment === "live" ? "live" : "test";
  if (environment === "live" && session.member.role !== "owner") return NextResponse.json({ error: "Only owners can register live endpoints" }, { status: 403 });
  const url = String(body.url || "").trim();
  if (!url || url.length > 2048) return NextResponse.json({ error: "A webhook URL of at most 2048 characters is required" }, { status: 400 });
  try { assertSafeWebhookUrl(url); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unsafe URL" }, { status: 400 }); }
  const { data: priorEndpoint } = await session.admin.from("webhook_endpoints").select("id")
    .eq("partner_id", partnerId).eq("url", url).eq("environment", environment).maybeSingle();
  const secret = newWebhookSecret();
  let encrypted: ReturnType<typeof encryptWebhookSecret>;
  try { encrypted = encryptWebhookSecret(secret); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Webhook secret encryption is not configured" }, { status: 500 }); }
  const { data: endpoint, error } = await session.admin.from("webhook_endpoints").upsert({
    partner_id: partnerId, url, environment, secret_hash: hashWebhookSecret(secret),
    description: String(body.description || "").trim().slice(0, 120) || null, status: "active", updated_at: new Date().toISOString(),
  }, { onConflict: "partner_id,url,environment" }).select("id, url, environment, status, description, created_at").single();
  if (error || !endpoint) return NextResponse.json({ error: "Could not register endpoint" }, { status: 500 });
  const { error: secretError } = await session.admin.from("webhook_endpoint_signing_secrets").upsert({
    endpoint_id: endpoint.id, ciphertext: encrypted.ciphertext, iv: encrypted.iv, tag: encrypted.tag, updated_at: new Date().toISOString(),
  }, { onConflict: "endpoint_id" });
  if (secretError) { await session.admin.from("webhook_endpoints").update({ status: "inactive" }).eq("id", endpoint.id); return NextResponse.json({ error: "Could not securely store endpoint secret" }, { status: 500 }); }
  try { await writePartnerAuditEvent({ partnerId, actorUserId: session.user.id, action: priorEndpoint ? "webhook_endpoint.secret_rotated" : "webhook_endpoint.registered", targetType: "webhook_endpoint", targetId: endpoint.id, metadata: { environment, url } }); }
  catch {
    await session.admin.from("webhook_endpoints").update({ status: "inactive" }).eq("id", endpoint.id);
    await session.admin.from("webhook_endpoint_signing_secrets").delete().eq("endpoint_id", endpoint.id);
    return NextResponse.json({ error: "Audit logging failed; the endpoint was disabled. Register it again after resolving the issue." }, { status: 500 });
  }
  return NextResponse.json({ data: { ...endpoint, signing_secret: secret, note: "Copy the signing secret now. It will not be shown again." } }, { status: 201 });
}

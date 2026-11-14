import { NextResponse } from "next/server";
import { authenticatePartner } from "@/lib/api/auth-partner";
import { fromCaught, PartnerApiError } from "@/lib/api/errors";
import { newRequestId } from "@/lib/api/request-id";
import { logPartnerRequest } from "@/lib/api/request-log";
import {
  hashWebhookSecret,
  newWebhookSecret,
} from "@/lib/api/webhooks-dispatch";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { assertSafeWebhookUrl } from "@/lib/api/webhook-url";
import { encryptWebhookSecret } from "@/lib/api/webhook-secrets";

/** GET — list endpoints (no secrets) */
export async function GET(request: Request) {
  const requestId = newRequestId();
  let logPartnerId: string | undefined;
  let logEnvironment: string | undefined;
  try {
    const ctx = await authenticatePartner(request, ["webhooks:manage"]);
    logPartnerId = ctx.partnerId; logEnvironment = ctx.environment;
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("webhook_endpoints")
      .select("id, url, environment, status, description, created_at, updated_at")
      .eq("partner_id", ctx.partnerId)
      .eq("environment", ctx.environment)
      .order("created_at", { ascending: false });
    if (error) throw new PartnerApiError("INTERNAL", "Unable to load webhook endpoints.", 500);
    logPartnerRequest({ partnerId: ctx.partnerId, requestId, method: "GET", path: "/v1/webhooks", status: 200, environment: ctx.environment });
    return NextResponse.json({
      data: data || [],
      request_id: requestId,
    });
  } catch (error) {
    logPartnerRequest({ partnerId: logPartnerId, requestId, method: "GET", path: "/v1/webhooks", status: error instanceof PartnerApiError ? error.status : 500, environment: logEnvironment });
    return fromCaught(error, requestId);
  }
}

/**
 * POST — register/update webhook URL. Returns signing secret once.
 * Body: { url, description? }
 */
export async function POST(request: Request) {
  const requestId = newRequestId();
  let logPartnerId: string | undefined;
  let logEnvironment: string | undefined;
  try {
    const ctx = await authenticatePartner(request, ["webhooks:manage"]);
    logPartnerId = ctx.partnerId; logEnvironment = ctx.environment;
    const parsedBody = await request.json().catch(() => { throw new PartnerApiError("INVALID_REQUEST", "Request body must be valid JSON.", 400); });
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) throw new PartnerApiError("INVALID_REQUEST", "Request body must be a JSON object.", 400);
    const body = parsedBody as { url?: string; description?: string };
    if (!body.url || body.url.length > 2048 || !/^https:\/\//i.test(body.url)) {
      throw new PartnerApiError(
        "INVALID_REQUEST",
        "url must be an https:// endpoint."
      );
    }
    if (body.description && (typeof body.description !== "string" || body.description.length > 120)) {
      throw new PartnerApiError("INVALID_REQUEST", "description must be at most 120 characters.");
    }
    try {
      assertSafeWebhookUrl(body.url);
    } catch (e) {
      throw new PartnerApiError(
        "INVALID_REQUEST",
        e instanceof Error ? e.message : "Webhook URL is not allowed."
      );
    }

    const secret = newWebhookSecret();
    const secretHash = hashWebhookSecret(secret);
    let encryptedSecret: ReturnType<typeof encryptWebhookSecret>;
    try {
      encryptedSecret = encryptWebhookSecret(secret);
    } catch (e) {
      throw new PartnerApiError(
        "CONFIGURATION_ERROR",
        "Webhook secret encryption is not configured.",
        500
      );
    }
    const admin = createSupabaseAdminClient();
    const { data: priorEndpoint } = await admin.from("webhook_endpoints").select("id")
      .eq("partner_id", ctx.partnerId).eq("url", body.url).eq("environment", ctx.environment).maybeSingle();

    const { data: endpoint, error } = await admin
      .from("webhook_endpoints")
      .upsert(
        {
          partner_id: ctx.partnerId,
          url: body.url,
          environment: ctx.environment,
          secret_hash: secretHash,
          status: "active",
          description: body.description || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "partner_id,url,environment" }
      )
      .select("id, url, environment, status, description, created_at")
      .single();
    if (error) throw new PartnerApiError("CONFLICT", "Webhook endpoint conflicts with an existing registration.", 409);

    const { error: secretStoreError } = await admin
      .from("webhook_endpoint_signing_secrets")
      .upsert({
        endpoint_id: endpoint.id,
        ciphertext: encryptedSecret.ciphertext,
        iv: encryptedSecret.iv,
        tag: encryptedSecret.tag,
        updated_at: new Date().toISOString(),
      }, { onConflict: "endpoint_id" });
    if (secretStoreError) {
      await admin.from("webhook_endpoints").update({ status: "inactive" }).eq("id", endpoint.id);
      throw new PartnerApiError("INTERNAL", "Unable to securely store endpoint signing secret.", 500);
    }



    const { error: auditError } = await admin.from("partner_audit_events").insert({
      partner_id: ctx.partnerId, actor_user_id: null, action: priorEndpoint ? "webhook_endpoint.secret_rotated" : "webhook_endpoint.registered",
      target_type: "webhook_endpoint", target_id: endpoint.id,
      metadata: { environment: ctx.environment, url: body.url, credential_id: ctx.credentialId },
    });
    if (auditError) {
      await admin.from("webhook_endpoints").update({ status: "inactive" }).eq("id", endpoint.id);
      await admin.from("webhook_endpoint_signing_secrets").delete().eq("endpoint_id", endpoint.id);
      logPartnerRequest({ partnerId: ctx.partnerId, requestId, method: "POST", path: "/v1/webhooks", status: 500, environment: ctx.environment });
      return NextResponse.json({ error: { code: "INTERNAL", message: "Endpoint was disabled because audit logging failed.", request_id: requestId } }, { status: 500 });
    }

    logPartnerRequest({ partnerId: ctx.partnerId, requestId, method: "POST", path: "/v1/webhooks", status: 201, environment: ctx.environment });
    return NextResponse.json(
      { data: { id: endpoint.id, url: endpoint.url, environment: endpoint.environment, status: endpoint.status, description: endpoint.description, created_at: endpoint.created_at, signing_secret: secret, note: "Store signing_secret now — it is not shown again." }, request_id: requestId },
      { status: 201 }
    );
  } catch (error) {
    logPartnerRequest({ partnerId: logPartnerId, requestId, method: "POST", path: "/v1/webhooks", status: error instanceof PartnerApiError ? error.status : 500, environment: logEnvironment });
    return fromCaught(error, requestId);
  }
}

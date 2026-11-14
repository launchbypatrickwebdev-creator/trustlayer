import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { mapPartnerEventType, sanitizePartnerEventData } from "@/lib/domain/partner-api/events";
import { assertSafeWebhookUrl, postWebhookPinned } from "@/lib/api/webhook-url";
import { decryptWebhookSecret, encryptWebhookSecret } from "@/lib/api/webhook-secrets";

export function hashWebhookSecret(raw: string) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function signWebhookBody(secret: string, body: string) {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

export function verifyWebhookSignature(
  secret: string,
  body: string,
  signatureHex: string
) {
  const expected = signWebhookBody(secret, body);
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(signatureHex.replace(/^sha256=/, ""), "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function newWebhookSecret() {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

/** Move legacy plaintext partner-level secrets into endpoint-specific encrypted storage. */
async function migrateLegacyWebhookEndpoint(
  admin: ReturnType<typeof createSupabaseAdminClient>, partnerId: string
) {
  const [{ data: partner }, { data: legacy }] = await Promise.all([
    admin.from("api_partners").select("id,webhook_url").eq("id", partnerId).maybeSingle(),
    admin.from("webhook_signing_secrets").select("secret").eq("partner_id", partnerId).maybeSingle(),
  ]);
  const url = String(partner?.webhook_url || "");
  const secret = String(legacy?.secret || "");
  if (!url || !secret) return;
  try { assertSafeWebhookUrl(url); }
  catch {
    await admin.from("webhook_deliveries").update({ status: "dead", last_error: "Legacy webhook URL is unsafe and was disabled", processing_started_at: null }).eq("partner_id", partnerId).is("endpoint_id", null);
    await admin.from("webhook_signing_secrets").delete().eq("partner_id", partnerId);
    await admin.from("api_partners").update({ webhook_url: null }).eq("id", partnerId);
    return;
  }
  const { data: existing } = await admin.from("webhook_endpoints").select("id")
    .eq("partner_id", partnerId).eq("url", url).eq("environment", "test").maybeSingle();
  let endpointId = existing?.id as string | undefined;
  if (!endpointId) {
    const { data: endpoint, error } = await admin.from("webhook_endpoints").insert({
      partner_id: partnerId, url, environment: "test", secret_hash: hashWebhookSecret(secret),
      status: "active", description: "Migrated legacy webhook endpoint",
    }).select("id").single();
    if (error || !endpoint) {
      const { data: raced } = await admin.from("webhook_endpoints").select("id")
        .eq("partner_id", partnerId).eq("url", url).eq("environment", "test").maybeSingle();
      if (!raced) throw new Error("Could not migrate legacy webhook endpoint");
      endpointId = raced.id as string;
    } else endpointId = endpoint.id as string;
  }
  const { data: storedSecret } = await admin.from("webhook_endpoint_signing_secrets")
    .select("endpoint_id").eq("endpoint_id", endpointId).maybeSingle();
  if (!storedSecret) {
    const encrypted = encryptWebhookSecret(secret);
    const { error } = await admin.from("webhook_endpoint_signing_secrets").upsert({
      endpoint_id: endpointId, ciphertext: encrypted.ciphertext, iv: encrypted.iv,
      tag: encrypted.tag, updated_at: new Date().toISOString(),
    }, { onConflict: "endpoint_id" });
    if (error) throw new Error("Could not encrypt legacy webhook secret");
    await admin.from("webhook_endpoints").update({ secret_hash: hashWebhookSecret(secret), status: "active" }).eq("id", endpointId);
  }
  // Attach existing queued legacy deliveries before deleting the plaintext source.
  await admin.from("webhook_deliveries").update({ endpoint_id: endpointId, environment: "test" })
    .eq("partner_id", partnerId).is("endpoint_id", null);
  await admin.from("webhook_signing_secrets").delete().eq("partner_id", partnerId);
  await admin.from("api_partners").update({ webhook_url: null }).eq("id", partnerId);
}

export type OutboundWebhookEvent = {
  id: string;
  type: string;
  deal_id: string;
  external_id: string | null;
  occurred_at: string;
  data: Record<string, unknown>;
};

export async function enqueueWebhookDeliveries(opts: {
  partnerId: string;
  event: OutboundWebhookEvent;
}) {
  const admin = createSupabaseAdminClient();
  if (opts.event.deal_id) await migrateLegacyWebhookEndpoint(admin, opts.partnerId);
  const { data: link } = await admin.from("partner_deals")
    .select("environment").eq("partner_id", opts.partnerId).eq("deal_id", opts.event.deal_id).maybeSingle();
  const environment = link?.environment === "live" ? "live" : "test";
  const { data: endpoints } = await admin
    .from("webhook_endpoints")
    .select("id, url, environment")
    .eq("partner_id", opts.partnerId)
    .eq("environment", environment)
    .eq("status", "active");
  const targets = new Map<string, string>();
  for (const endpoint of endpoints || []) {
    if (endpoint.url) targets.set(String(endpoint.url), String(endpoint.id));
  }
  if (targets.size === 0) return { enqueued: 0 };

  let enqueued = 0;
  for (const [url, endpointId] of targets) {
    const { error } = await admin.from("webhook_deliveries").insert({
      partner_id: opts.partnerId,
      endpoint_id: endpointId,
      // Current schema uniquely constrains (partner_id, event_id), so use a
      // per-destination storage key while keeping the public event id in payload.
      event_id: `${opts.event.id}:${createHash("sha256").update(url).digest("hex").slice(0, 12)}`,
      event_type: opts.event.type,
      payload: { ...opts.event, delivery_url: url },
      status: "pending",
      environment,
      attempts: 0,
    });
    if (!error) enqueued += 1;
    else if (error.code !== "23505") throw new Error("Unable to enqueue webhook delivery");
  }
  return { enqueued };
}

export async function enqueueFromDealEvent(opts: {
  partnerId: string;
  dealId: string;
  externalId: string | null;
  dealEventId: string;
  eventType: string;
  occurredAt: string;
  metadata?: Record<string, unknown>;
  actorType?: string;
}) {
  return enqueueWebhookDeliveries({
    partnerId: opts.partnerId,
    event: {
      id: `evt_${opts.dealEventId}`,
      type: mapPartnerEventType(opts.eventType),
      deal_id: opts.dealId,
      external_id: opts.externalId,
      occurred_at: opts.occurredAt,
      data: sanitizePartnerEventData(opts.metadata, opts.actorType, opts.eventType),
    },
  });
}

async function resolveSigningSecret(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  partnerId: string,
  endpointId: string | null
): Promise<string | null> {
  if (endpointId) {
    const { data: sec } = await admin
      .from("webhook_endpoint_signing_secrets")
      .select("ciphertext, iv, tag")
      .eq("endpoint_id", endpointId)
      .maybeSingle();
    if (!sec) return null;
    try {
      return decryptWebhookSecret({
        ciphertext: String(sec.ciphertext),
        iv: String(sec.iv),
        tag: String(sec.tag),
      });
    } catch {
      return null;
    }
  }

  // Legacy api_partners.webhook_url has no endpoint row, so it uses its own legacy secret.
  const { data: sec } = await admin
    .from("webhook_signing_secrets")
    .select("secret")
    .eq("partner_id", partnerId)
    .maybeSingle();
  if (sec?.secret) return String(sec.secret);
  try {
    const map = JSON.parse(process.env.TRUSTLAYER_WEBHOOK_SECRETS_JSON || "{}") as Record<string, string>;
    return map[partnerId] || null;
  } catch {
    return null;
  }
}

export async function dispatchPendingWebhooks(limit = 20) {
  const admin = createSupabaseAdminClient();
  const { data: legacySecrets } = await admin.from("webhook_signing_secrets").select("partner_id");
  for (const legacy of legacySecrets || []) {
    const partnerId = String(legacy.partner_id);
    const { data: partner } = await admin.from("api_partners").select("webhook_url").eq("id", partnerId).maybeSingle();
    if (partner?.webhook_url) await migrateLegacyWebhookEndpoint(admin, partnerId);
    else await admin.from("webhook_signing_secrets").delete().eq("partner_id", partnerId);
  }
  const nowIso = new Date().toISOString();
  // Recover rows abandoned by a crashed worker after the 10-minute delivery lease.
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await admin
    .from("webhook_deliveries")
    .update({
      status: "pending",
      processing_started_at: null,
      next_attempt_at: nowIso,
      last_error: "Recovered stale processing lease",
    })
    .eq("status", "processing")
    .or(`processing_started_at.is.null,processing_started_at.lt.${staleBefore}`);
  // Prefer rows due for attempt; columns next_attempt_at may be null on older rows
  const { data: rows, error } = await admin
    .from("webhook_deliveries")
    .select("*")
    .in("status", ["pending", "failed"])
    .lt("attempts", 8)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    // Fallback if next_attempt_at column missing
    const fb = await admin
      .from("webhook_deliveries")
      .select("*")
      .in("status", ["pending", "failed"])
      .lt("attempts", 8)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (fb.error) throw new Error(fb.error.message);
    return dispatchRows(admin, fb.data || []);
  }

  return dispatchRows(admin, rows || []);
}

async function dispatchRows(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  rows: any[]
) {
  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const row of rows) {
    // Claim row to reduce double-send under concurrent workers
    const claimAttempts = (row.attempts || 0) + 1;
    const { data: claimed } = await admin
      .from("webhook_deliveries")
      .update({
        status: "processing",
        attempts: claimAttempts,
        processing_started_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .in("status", ["pending", "failed"])
      .select("id")
      .maybeSingle();
    if (!claimed) {
      results.push({ id: row.id, ok: false, error: "skipped_claim" });
      continue;
    }
    const attemptStarted = Date.now();
    const { data: lastAttempt } = await admin.from("webhook_delivery_attempts").select("attempt_number")
      .eq("delivery_id", row.id).order("attempt_number", { ascending: false }).limit(1).maybeSingle();
    const historyAttemptNumber = Number(lastAttempt?.attempt_number || 0) + 1;
    const { data: attemptRow, error: attemptInsertError } = await admin.from("webhook_delivery_attempts").insert({
      delivery_id: row.id, attempt_number: historyAttemptNumber, started_at: new Date(attemptStarted).toISOString(),
    }).select("id").single();
    if (attemptInsertError || !attemptRow) {
      await admin.from("webhook_deliveries").update({ status: "failed", processing_started_at: null, last_error: "Attempt history could not be recorded; delivery was not sent", next_attempt_at: new Date(Date.now() + 30_000).toISOString() }).eq("id", row.id);
      results.push({ id: row.id, ok: false, error: "attempt_history_unavailable" });
      continue;
    }
    const finishAttempt = async (fields: { response_status?: number | null; error?: string | null }) => {
      await admin.from("webhook_delivery_attempts").update({
        ...fields, completed_at: new Date().toISOString(), duration_ms: Math.max(0, Date.now() - attemptStarted),
      }).eq("id", attemptRow.id);
    };

    if (row.endpoint_id) {
      const { data: endpoint } = await admin.from("webhook_endpoints")
        .select("id,status,environment").eq("id", row.endpoint_id).eq("partner_id", row.partner_id).maybeSingle();
      if (!endpoint || endpoint.status !== "active" || endpoint.environment !== (row.environment || "test")) {
        await finishAttempt({ error: "Endpoint is disabled or no longer matches the delivery environment" });
        await admin.from("webhook_deliveries").update({ status: "dead", processing_started_at: null, last_error: "Endpoint is disabled or no longer matches the delivery environment" }).eq("id", row.id);
        results.push({ id: row.id, ok: false, error: "endpoint_disabled_or_environment_mismatch" });
        continue;
      }
    }

    const payload = row.payload as OutboundWebhookEvent & {
      delivery_url?: string;
    };
    let url = payload.delivery_url;
    if (!url) {
      const { data: p } = await admin
        .from("api_partners")
        .select("webhook_url")
        .eq("id", row.partner_id)
        .maybeSingle();
      url = p?.webhook_url || undefined;
    }
    if (!url) {
      await finishAttempt({ error: "No webhook URL" });
      await admin
        .from("webhook_deliveries")
        .update({
          status: "failed",
          attempts: claimAttempts,
          processing_started_at: null,
          next_attempt_at: new Date(Date.now() + Math.min(60 * 60 * 1000, 5_000 * (2 ** (claimAttempts - 1)))).toISOString(),
          last_error: "No webhook URL",
        })
        .eq("id", row.id);
      results.push({ id: row.id, ok: false, error: "no url" });
      continue;
    }

    try {
      assertSafeWebhookUrl(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unsafe webhook URL";
      await finishAttempt({ error: msg });
      await admin
        .from("webhook_deliveries")
        .update({
          status: "dead",
          attempts: claimAttempts,
          processing_started_at: null,
          last_error: msg,
        })
        .eq("id", row.id);
      results.push({ id: row.id, ok: false, error: msg });
      continue;
    }

    const secret = await resolveSigningSecret(
      admin,
      String(row.partner_id),
      row.endpoint_id ? String(row.endpoint_id) : null
    );
    if (!secret) {
      const msg = "No signing secret is available for this webhook destination; rotate/re-register the endpoint.";
      await finishAttempt({ error: msg });
      await admin.from("webhook_deliveries").update({
        status: "dead",
        processing_started_at: null,
        attempts: claimAttempts,
        last_error: msg,
      }).eq("id", row.id);
      results.push({ id: row.id, ok: false, error: msg });
      continue;
    }
    const bodyObj = {
      id: payload.id || row.event_id,
      type: row.event_type,
      deal_id: payload.deal_id,
      external_id: payload.external_id ?? null,
      occurred_at: payload.occurred_at,
      data: payload.data || {},
    };
    const body = JSON.stringify(bodyObj);
    const signature = signWebhookBody(secret, body);

    try {
      const response = await postWebhookPinned(url, body, {
        "Content-Type": "application/json",
        "X-TrustLayer-Event-Id": String(bodyObj.id),
        "X-TrustLayer-Signature": `sha256=${signature}`,
        "User-Agent": "TrustLayer-Webhooks/1.0",
      }, 10_000);
      if (response.ok) {
        await finishAttempt({ response_status: response.status, error: null });
        await admin.from("webhook_deliveries").update({
          status: "delivered", attempts: claimAttempts, processing_started_at: null,
          delivered_at: new Date().toISOString(), last_status_code: response.status, last_error: null,
        }).eq("id", row.id);
        results.push({ id: row.id, ok: true });
      } else {
        await finishAttempt({ response_status: response.status, error: `HTTP ${response.status}` });
        await admin.from("webhook_deliveries").update({
          status: claimAttempts >= 8 ? "dead" : "failed", attempts: claimAttempts,
          processing_started_at: null,
          next_attempt_at: new Date(Date.now() + Math.min(60 * 60 * 1000, 5_000 * (2 ** (claimAttempts - 1)))).toISOString(),
          last_status_code: response.status, last_error: `HTTP ${response.status}`,
        }).eq("id", row.id);
        results.push({ id: row.id, ok: false, error: `HTTP ${response.status}` });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Webhook request failed";
      await finishAttempt({ error: msg });
      await admin
        .from("webhook_deliveries")
        .update({
          status: claimAttempts >= 8 ? "dead" : "failed",
          attempts: claimAttempts,
          processing_started_at: null,
          next_attempt_at: new Date(Date.now() + Math.min(60 * 60 * 1000, 5_000 * (2 ** (claimAttempts - 1)))).toISOString(),
          last_error: msg,
        })
        .eq("id", row.id);
      results.push({ id: row.id, ok: false, error: msg });
    }
  }
  return results;
}

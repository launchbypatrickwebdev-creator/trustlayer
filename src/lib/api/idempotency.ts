import { createHash, randomUUID } from "crypto";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { PartnerApiError } from "@/lib/api/errors";
import { assertIdempotencyEncryptionConfigured, decryptIdempotencyResponse, encryptIdempotencyResponse } from "@/lib/api/idempotency-crypto";

type IdempotencyOptions = { method: string; path: string; requestHash: string };
type IdempotencyResult =
  | { kind: "reserved"; claimToken: string }
  | { kind: "replay"; status: number; body: unknown }
  | null;

/**
 * Atomically claims a partner/key tuple before side effects. A completed request
 * is replayed; an in-progress request returns 409. A stale lease can be recovered
 * by replacing its claim token, so the former worker cannot finalize the new claim.
 */
export async function readIdempotentResponse(partnerId: string, key: string | null, opts?: IdempotencyOptions): Promise<IdempotencyResult> {
  if (!key) return null;
  if (key.length < 8 || key.length > 200) throw new PartnerApiError("INVALID_REQUEST", "Idempotency-Key must be between 8 and 200 characters.", 400);
  if (!opts) throw new PartnerApiError("INTERNAL", "Idempotency method, path, and request hash are required.", 500);
  try { assertIdempotencyEncryptionConfigured(); }
  catch { throw new PartnerApiError("CONFIGURATION_ERROR", "Idempotency response encryption is not configured.", 500); }
  const admin = createSupabaseAdminClient();
  const claimToken = randomUUID();
  const inserted = await admin.from("api_idempotency_keys").insert({
    partner_id: partnerId, idempotency_key: key, method: opts.method, path: opts.path,
    request_hash: opts.requestHash, state: "pending", claimed_at: new Date().toISOString(),
    claim_token: claimToken, response_status: null, response_body: null,
  }).select("id,claim_token").maybeSingle();
  if (!inserted.error && inserted.data) return { kind: "reserved", claimToken: String(inserted.data.claim_token) };
  if (inserted.error && inserted.error.code !== "23505") throw new PartnerApiError("INTERNAL", "Unable to reserve idempotency key.", 500);
  const { data, error } = await admin.from("api_idempotency_keys")
    .select("id,response_status,response_body,response_ciphertext,response_iv,response_tag,method,path,request_hash,state,claimed_at,claim_token")
    .eq("partner_id", partnerId).eq("idempotency_key", key).maybeSingle();
  if (error || !data) throw new PartnerApiError("INTERNAL", "Unable to read idempotency record.", 500);
  if (data.method !== opts.method || data.path !== opts.path || data.request_hash !== opts.requestHash) {
    throw new PartnerApiError("IDEMPOTENCY_MISMATCH", "Idempotency-Key was already used with a different method, path, or request body.", 409);
  }
  if (data.state === "completed" && data.response_status != null) {
    if (data.response_ciphertext && data.response_iv && data.response_tag) {
      try { return { kind: "replay", status: Number(data.response_status), body: decryptIdempotencyResponse(data.response_ciphertext, data.response_iv, data.response_tag) }; }
      catch { throw new PartnerApiError("INTERNAL", "Unable to decrypt the stored idempotent response.", 500); }
    }
    // Migrate old plaintext response bodies lazily. Existing capability URLs are short-lived.
    if (data.response_body != null) {
      try {
        const encrypted = encryptIdempotencyResponse(data.response_body);
        const { error: migrationError } = await admin.from("api_idempotency_keys").update({ ...encrypted, response_body: null })
          .eq("id", data.id).is("response_ciphertext", null);
        if (migrationError) throw migrationError;
        return { kind: "replay", status: Number(data.response_status), body: data.response_body };
      } catch { throw new PartnerApiError("INTERNAL", "Unable to protect the stored idempotent response.", 500); }
    }
  }
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const claimedAt = data.claimed_at ? new Date(data.claimed_at).getTime() : 0;
  if (data.state === "pending" && claimedAt < Date.now() - 5 * 60 * 1000) {
    const newToken = randomUUID();
    const { data: recovered } = await admin.from("api_idempotency_keys").update({ claimed_at: new Date().toISOString(), claim_token: newToken })
      .eq("id", data.id).eq("state", "pending").eq("claim_token", data.claim_token).lt("claimed_at", staleBefore)
      .select("claim_token").maybeSingle();
    if (recovered) return { kind: "reserved", claimToken: String(recovered.claim_token) };
  }
  throw new PartnerApiError("IDEMPOTENCY_CONFLICT", "A request with this Idempotency-Key is already in progress. Retry shortly.", 409);
}

export async function storeIdempotentResponse(opts: { partnerId: string; key: string; claimToken: string; method: string; path: string; requestHash: string; status: number; body: unknown }) {
  let encrypted: ReturnType<typeof encryptIdempotencyResponse>;
  try { encrypted = encryptIdempotencyResponse(opts.body); }
  catch { throw new PartnerApiError("CONFIGURATION_ERROR", "Idempotency response encryption is not configured.", 500); }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("api_idempotency_keys").update({
    response_status: opts.status, response_body: null, ...encrypted, state: "completed", claimed_at: null,
  }).eq("partner_id", opts.partnerId).eq("idempotency_key", opts.key).eq("method", opts.method)
    .eq("path", opts.path).eq("request_hash", opts.requestHash).eq("claim_token", opts.claimToken).eq("state", "pending")
    .select("id").maybeSingle();
  if (error || !data) throw new PartnerApiError("IDEMPOTENCY_CONFLICT", "Unable to finalize this idempotent response; retry with the same key.", 409);
}

export function hashRequestBody(body: unknown) { return createHash("sha256").update(JSON.stringify(body ?? null)).digest("hex"); }

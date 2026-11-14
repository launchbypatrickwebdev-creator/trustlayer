import { createHash, timingSafeEqual } from "crypto";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { PartnerApiError } from "@/lib/api/errors";
import { partnerRateLimitAsync } from "@/lib/api/rate-limit";

export type PartnerScope =
  | "deals:read"
  | "deals:create"
  | "events:read"
  | "webhooks:manage"
  | "users:link"
  | "deals:finalize"
  | "funding:initiate"
  | "transactions:cancel"
  | "settlement:execute";

export type PartnerContext = {
  partnerId: string;
  partnerName: string;
  credentialId: string;
  environment: "test" | "live";
  scopes: string[];
};

function hashSecret(raw: string) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function safeEqualHex(a: string, b: string) {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * Accepts:
 *   Authorization: Bearer tl_test_xxx.yyy   (prefix.secret)
 *   or Authorization: Bearer tl_live_xxx.yyy
 *
 * key_prefix stored in DB is the part before the last dot segment.
 * Full token format: {key_prefix}.{secret}
 */
export async function authenticatePartner(
  request: Request,
  requiredScopes: PartnerScope[] = [],
  options: { skipRateLimit?: boolean } = {}
): Promise<PartnerContext> {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new PartnerApiError("UNAUTHORIZED", "Missing Bearer token.", 401);
  }

  const token = match[1].trim();
  const dot = token.lastIndexOf(".");
  if (dot <= 0) {
    throw new PartnerApiError("UNAUTHORIZED", "Invalid API key format.", 401);
  }
  const keyPrefix = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  if (!keyPrefix.startsWith("tl_test_") && !keyPrefix.startsWith("tl_live_")) {
    throw new PartnerApiError("UNAUTHORIZED", "Invalid API key prefix.", 401);
  }

  const admin = createSupabaseAdminClient();
  const { data: cred, error } = await admin
    .from("api_credentials")
    .select(
      "id, partner_id, secret_hash, environment, scopes, status, api_partners(id, name, status)"
    )
    .eq("key_prefix", keyPrefix)
    .maybeSingle();

  if (error || !cred) {
    throw new PartnerApiError("UNAUTHORIZED", "Invalid API key.", 401);
  }
  if ((keyPrefix.startsWith("tl_test_") ? "test" : "live") !== String(cred.environment)) {
    throw new PartnerApiError("UNAUTHORIZED", "API key environment mismatch.", 401);
  }
  if (cred.status !== "active") {
    throw new PartnerApiError("UNAUTHORIZED", "API key revoked.", 401);
  }

  const partner = (cred as any).api_partners;
  if (!partner || partner.status !== "active") {
    throw new PartnerApiError("FORBIDDEN", "Partner account is not active.", 403);
  }

  const incomingHash = hashSecret(secret);
  if (!safeEqualHex(incomingHash, String(cred.secret_hash))) {
    throw new PartnerApiError("UNAUTHORIZED", "Invalid API key.", 401);
  }

  const scopes: string[] = Array.isArray(cred.scopes) ? cred.scopes : [];
  for (const s of requiredScopes) {
    if (!scopes.includes(s)) {
      throw new PartnerApiError(
        "FORBIDDEN",
        `Missing scope: ${s}`,
        403,
        { required: s }
      );
    }
  }

  if (!options.skipRateLimit) {
    try {
      const rate = await partnerRateLimitAsync({ partnerId: partner.id, environment: cred.environment as "test" | "live" });
      if (!rate.allowed) {
        throw new PartnerApiError("RATE_LIMITED", "Too many requests. Wait for the rate-limit window to reset.", 429, {
          limit: rate.limit, remaining: rate.remaining, reset_at: Math.ceil(rate.resetAt / 1000),
        });
      }
    } catch (error) {
      if (error instanceof PartnerApiError) throw error;
      throw new PartnerApiError("INTERNAL", "Rate-limit service is temporarily unavailable.", 500);
    }
  }

  void admin
    .from("api_credentials")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", cred.id);

  return {
    partnerId: partner.id,
    partnerName: partner.name,
    credentialId: cred.id,
    environment: cred.environment as "test" | "live",
    scopes,
  };
}

export function hashApiSecret(rawSecret: string) {
  return hashSecret(rawSecret);
}

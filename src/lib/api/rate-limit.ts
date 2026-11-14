import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

/** Uses a single Postgres UPSERT/RPC so concurrent app instances share one counter. */
export async function partnerRateLimitAsync(opts: {
  partnerId: string;
  environment: "test" | "live";
  windowMs?: number;
  max?: number;
}): Promise<RateLimitResult> {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? (opts.environment === "test" ? 120 : 300);
  const key = `${opts.environment}:${opts.partnerId}`;
  const now = Date.now();
  const windowStartMs = now - (now % windowMs);
  const windowStart = new Date(windowStartMs).toISOString();
  const resetAt = windowStartMs + windowMs;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("consume_partner_rate_limit", {
    p_bucket_key: key,
    p_window_start: windowStart,
  });
  if (error) {
    // Never silently fall back to per-instance memory in production: that would
    // let callers bypass a shared limit by spreading requests across instances.
    throw new Error(`Partner rate-limit store unavailable: ${error.message}`);
  }

  const count = Number(data);
  if (!Number.isFinite(count) || count < 1) {
    throw new Error("Partner rate-limit store returned an invalid counter.");
  }
  return {
    allowed: count <= max,
    limit: max,
    remaining: Math.max(0, max - count),
    resetAt,
  };
}

export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(r.limit),
    "X-RateLimit-Remaining": String(r.remaining),
    "X-RateLimit-Reset": String(Math.ceil(r.resetAt / 1000)),
    ...(r.allowed ? {} : { "Retry-After": String(Math.max(1, Math.ceil((r.resetAt - Date.now()) / 1000))) }),
  };
}

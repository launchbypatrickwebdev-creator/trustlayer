import { createHash, randomBytes } from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";

const CRYPTO_SESSION_TTL_SECONDS = 15 * 60;

export interface CryptoPaymentSession {
  id: string;
  deal_id: string;
  user_id: string;
  role: "buyer" | "seller";
  action: "review" | "create" | "fund" | "release" | "refund" | "cancel";
  milestone_index: number;
  expires_at: string;
}

function createCapabilityToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashCapabilityToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function assertUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("Invalid deal id.");
  }
}

export async function createCryptoPaymentSession(
  dealId: string,
  milestoneIndex: number
): Promise<{ session: CryptoPaymentSession; capability: string }> {
  assertUuid(dealId);
  if (!Number.isInteger(milestoneIndex) || milestoneIndex < 0 || milestoneIndex > 9) {
    throw new Error("Invalid milestone index.");
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Authentication required.");

  const capability = createCapabilityToken();
  const capabilityHash = hashCapabilityToken(capability);
  const expiresAt = new Date(Date.now() + CRYPTO_SESSION_TTL_SECONDS * 1000).toISOString();

  const admin = createSupabaseAdminClient();
  const { data, error } = await (admin.rpc as any)("create_crypto_payment_session", {
    p_deal_id: dealId,
    p_actor_user_id: user.id,
    p_capability_hash: capabilityHash,
    p_expires_at: expiresAt,
    p_milestone_index: milestoneIndex,
  });

  if (error || !data) {
    console.error("Crypto payment session creation failed:", error);
    throw new Error(error?.message || "Unable to authorize the crypto payment flow.");
  }

  return { session: data as CryptoPaymentSession, capability };
}

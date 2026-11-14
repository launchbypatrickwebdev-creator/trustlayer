import { createHash, randomBytes } from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";

const CRYPTO_ACTION_SESSION_TTL_SECONDS = 15 * 60;
export type CryptoAction =
  | "release"
  | "cancel"
  | "cancel_unfunded"
  | "reclaim"
  | "open_dispute"
  | "create_ax"
  | "fund_ax"
  | "release_ax"
  | "cancel_ax"
  | "open_dispute_ax"
  | "admin_resolve";

function createCapabilityToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashCapabilityToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function createCryptoActionSession(
  dealId: string,
  action: CryptoAction,
  milestoneIndex: number
) {
  if (!Number.isInteger(milestoneIndex) || milestoneIndex < 0 || milestoneIndex > 9) {
    throw new Error("Invalid milestone index.");
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Authentication required.");

  const capability = createCapabilityToken();
  const capabilityHash = hashCapabilityToken(capability);
  const expiresAt = new Date(
    Date.now() + CRYPTO_ACTION_SESSION_TTL_SECONDS * 1000
  ).toISOString();

  const admin = createSupabaseAdminClient();
  const { data, error } = await (admin.rpc as any)(
    "create_crypto_action_session",
    {
      p_deal_id: dealId,
      p_actor_user_id: user.id,
      p_action: action,
      p_capability_hash: capabilityHash,
      p_expires_at: expiresAt,
      p_milestone_index: milestoneIndex,
    }
  );

  if (error || !data) {
    console.error("Crypto action session creation failed:", error);
    throw new Error(error?.message || "Unable to authorize this crypto action.");
  }

  return { capability, expiresAt, milestoneIndex };
}

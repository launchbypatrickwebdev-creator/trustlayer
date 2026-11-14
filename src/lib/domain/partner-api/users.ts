import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { PartnerApiError } from "@/lib/api/errors";

export async function tryResolveExternalUser(
  partnerId: string,
  externalUserId: string
): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("partner_user_links")
    .select("user_id")
    .eq("partner_id", partnerId)
    .eq("external_user_id", externalUserId)
    .maybeSingle();
  if (error) throw new PartnerApiError("INTERNAL", "Unable to link partner user.", 500);
  return data ? (data.user_id as string) : null;
}

export async function resolveExternalUser(
  partnerId: string,
  externalUserId: string
): Promise<string> {
  const id = await tryResolveExternalUser(partnerId, externalUserId);
  if (!id) {
    throw new PartnerApiError(
      "LINK_USER_REQUIRED",
      `No TrustLayer user linked for external_user_id="${externalUserId}". Call POST /v1/users/link first, or create a deal to receive claim_url.`,
      409,
      { external_user_id: externalUserId }
    );
  }
  return id;
}

export async function linkExternalUser(opts: {
  partnerId: string;
  externalUserId: string;
  trustlayerUserId: string;
}) {
  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("id", opts.trustlayerUserId)
    .maybeSingle();
  if (!profile) {
    throw new PartnerApiError("NOT_FOUND", "TrustLayer user not found.", 404);
  }
  const externalUserId = opts.externalUserId.trim();
  const { data: existing, error: lookupError } = await admin.from("partner_user_links")
    .select("id,external_user_id,user_id,created_at")
    .eq("partner_id", opts.partnerId).eq("external_user_id", externalUserId).maybeSingle();
  if (lookupError) throw new PartnerApiError("INTERNAL", "Unable to check existing user link.", 500);
  if (existing) {
    if (existing.user_id !== opts.trustlayerUserId) throw new PartnerApiError("CONFLICT", "External user ID is already linked to a different TrustLayer user.", 409);
    return existing;
  }
  const { data, error } = await admin.from("partner_user_links").insert({
    partner_id: opts.partnerId, external_user_id: externalUserId, user_id: opts.trustlayerUserId,
  }).select("id, external_user_id, user_id, created_at").single();
  if (error) {
    if (error.code === "23505") {
      const { data: raced } = await admin.from("partner_user_links").select("id,external_user_id,user_id,created_at")
        .eq("partner_id", opts.partnerId).eq("external_user_id", externalUserId).maybeSingle();
      if (raced?.user_id === opts.trustlayerUserId) return raced;
      throw new PartnerApiError("CONFLICT", "External user ID is already linked to a different TrustLayer user.", 409);
    }
    throw new PartnerApiError("INTERNAL", "Unable to create user link.", 500);
  }
  return data;
}

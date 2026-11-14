import { createHash, randomBytes } from "crypto";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";

export function hashPartnerInviteToken(raw: string) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export async function createPartnerInvite(opts: {
  partnerId: string;
  role?: "owner" | "developer" | "viewer" | "operator";
  email?: string | null;
  partnerOnly?: boolean;
  invitedBy?: string | null;
  expiresInDays?: number;
  siteOrigin: string;
}) {
  const raw = randomBytes(32).toString("base64url");
  const tokenHash = hashPartnerInviteToken(raw);
  const days = opts.expiresInDays ?? 14;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("partner_invites")
    .insert({
      partner_id: opts.partnerId,
      token_hash: tokenHash,
      email: opts.email?.trim().toLowerCase() || null,
      role: opts.role || "developer",
      partner_only: opts.partnerOnly !== false,
      invited_by: opts.invitedBy || null,
      expires_at: expiresAt,
    })
    .select("id, expires_at, role, partner_only, email")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to create invite");
  }

  const inviteUrl = `${opts.siteOrigin.replace(/\/$/, "")}/login?partner_invite=${encodeURIComponent(raw)}&next=${encodeURIComponent("/partner")}`;

  return {
    id: data.id,
    expires_at: data.expires_at,
    role: data.role,
    partner_only: data.partner_only,
    email: data.email,
    /** Show once — raw token is not stored */
    invite_url: inviteUrl,
    token: raw,
  };
}

import { createHash } from "crypto";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";

export function hashPartnerInviteToken(raw: string) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export type ClaimPartnerInviteResult = {
  partnerId: string;
  role: string;
  partnerOnly: boolean;
};

/**
 * Consume a one-time partner console invite and upsert partner_members.
 */
export async function claimPartnerInvite(
  rawToken: string,
  userId: string,
  userEmail?: string | null
): Promise<ClaimPartnerInviteResult> {
  const admin = createSupabaseAdminClient();
  const tokenHash = hashPartnerInviteToken(rawToken.trim());

  const { data: invite, error } = await admin
    .from("partner_invites")
    .select(
      "id, partner_id, email, role, partner_only, expires_at, used_at"
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !invite) {
    throw new Error("Invalid or expired partner invite.");
  }
  if (invite.used_at) {
    throw new Error("This partner invite was already used.");
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    throw new Error("This partner invite has expired.");
  }
  if (invite.email) {
    const expected = String(invite.email).trim().toLowerCase();
    const got = String(userEmail || "").trim().toLowerCase();
    if (!got || got !== expected) {
      throw new Error(
        `This invite is locked to ${invite.email}. Sign in with that email.`
      );
    }
  }

  const role = invite.role || "developer";
  const partnerOnly = invite.partner_only !== false;

  const { error: memErr } = await admin.from("partner_members").upsert(
    {
      partner_id: invite.partner_id,
      user_id: userId,
      role,
      partner_only: partnerOnly,
    },
    { onConflict: "partner_id,user_id" }
  );
  if (memErr) {
    throw new Error(memErr.message || "Could not add partner membership.");
  }

  const { data: marked, error: markErr } = await admin
    .from("partner_invites")
    .update({
      used_at: new Date().toISOString(),
      used_by: userId,
    })
    .eq("id", invite.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();

  if (markErr || !marked) {
    // Membership may already exist from a race; still OK if used_at set by other request
  }

  return {
    partnerId: invite.partner_id,
    role,
    partnerOnly,
  };
}

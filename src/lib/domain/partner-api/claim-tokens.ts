import crypto from "crypto";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { PartnerApiError } from "@/lib/api/errors";
import { linkExternalUser } from "@/lib/domain/partner-api/users";

const SYNTHETIC_EMAIL_RE =
  /@(bot\.trustlayer\.local|telegram\.trustlayer\.local|users\.trustlayer\.internal)$/i;

function siteUrl() {
  const raw = String(process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (!raw) throw new PartnerApiError("CONFIGURATION_ERROR", "Public site URL is not configured.", 500);
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new PartnerApiError("CONFIGURATION_ERROR", "Public site URL is invalid.", 500); }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new PartnerApiError("CONFIGURATION_ERROR", "Public site URL must be an origin without credentials, query or fragment.", 500);
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") throw new PartnerApiError("CONFIGURATION_ERROR", "Production public site URL must use HTTPS.", 500);
  return parsed.origin;
}

export function hashPartnerClaimToken(raw: string) {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

function generateRawToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export async function ensurePartnerProvisionalUser(opts: {
  partnerId: string;
  externalUserId: string;
  role: "buyer" | "seller";
}): Promise<string> {
  const admin = createSupabaseAdminClient();
  const slug = crypto
    .createHash("sha256")
    .update(`${opts.partnerId}:${opts.externalUserId}`)
    .digest("hex")
    .slice(0, 12);
  const syntheticEmail = `partner_${slug}@users.trustlayer.internal`;

  const { data: created, error: authErr } = await (
    admin as any
  ).auth.admin.createUser({
    email: syntheticEmail,
    email_confirm: true,
    user_metadata: {
      source: "partner_claim_provisional",
      partner_id: opts.partnerId,
      external_user_id: opts.externalUserId,
      role: opts.role,
    },
  });

  if (authErr || !created?.user?.id) {
    const fallbackEmail = `partner_${slug}_${crypto.randomBytes(2).toString("hex")}@users.trustlayer.internal`;
    const { data: created2, error: authErr2 } = await (
      admin as any
    ).auth.admin.createUser({
      email: fallbackEmail,
      email_confirm: true,
      user_metadata: {
        source: "partner_claim_provisional",
        partner_id: opts.partnerId,
        external_user_id: opts.externalUserId,
        role: opts.role,
      },
    });
    if (authErr2 || !created2?.user?.id) {
      throw new PartnerApiError(
        "INTERNAL",
        "Unable to reserve party seat.",
        500
      );
    }
    const userId = created2.user.id as string;
    await admin.from("profiles").upsert(
      { id: userId, display_name: `Partner ${opts.role} (${opts.externalUserId})` },
      { onConflict: "id" }
    );
    return userId;
  }

  const userId = created.user.id as string;
  await admin.from("profiles").upsert(
    { id: userId, display_name: `Partner ${opts.role} (${opts.externalUserId})` },
    { onConflict: "id" }
  );
  return userId;
}

export async function mintPartnerClaimToken(opts: {
  partnerId: string;
  dealId: string;
  externalUserId: string;
  role: "buyer" | "seller";
  provisionalUserId: string;
  expiresAt: Date;
}): Promise<{ raw: string; claim_url: string }> {
  const baseUrl = siteUrl();
  const admin = createSupabaseAdminClient();
  const raw = generateRawToken();
  const token_hash = hashPartnerClaimToken(raw);
  const { error } = await admin.from("partner_claim_tokens").insert({
    partner_id: opts.partnerId,
    deal_id: opts.dealId,
    external_user_id: opts.externalUserId,
    role: opts.role,
    token_hash,
    provisional_user_id: opts.provisionalUserId,
    expires_at: opts.expiresAt.toISOString(),
  });
  if (error) {
    throw new PartnerApiError("INTERNAL", "Unable to mint claim token.", 500);
  }
  const next = encodeURIComponent(`/deals/${opts.dealId}`);
  const claim_url = `${baseUrl}/login?partner_claim=${encodeURIComponent(raw)}&next=${next}`;
  return { raw, claim_url };
}

export async function claimPartnerToken(rawToken: string, realUserId: string) {
  const admin = createSupabaseAdminClient();
  const clean = String(rawToken || "").trim();
  if (!clean) throw new Error("Missing partner claim token.");
  const token_hash = hashPartnerClaimToken(clean);
  const { data: row, error } = await admin
    .from("partner_claim_tokens")
    .select("id, partner_id, deal_id, external_user_id, role, provisional_user_id, expires_at, claimed_at, claimed_by")
    .eq("token_hash", token_hash)
    .maybeSingle();
  if (error) throw new Error(error.message || "Unable to load claim token.");
  if (!row) throw new Error("This partner claim link is invalid.");
  if (row.claimed_at) {
    if (row.claimed_by === realUserId) {
      return { alreadyClaimed: true, dealId: row.deal_id as string, role: row.role as "buyer" | "seller" };
    }
    throw new Error("This partner claim link was already used.");
  }
  if (new Date(row.expires_at as string).getTime() < Date.now()) {
    throw new Error("This partner claim link has expired.");
  }
  const dealId = row.deal_id as string;
  const role = row.role as "buyer" | "seller";
  const provisionalId = row.provisional_user_id as string | null;

  // Atomic claim: only one winner may set claimed_at
  const claimedAt = new Date().toISOString();
  const { data: won, error: claimRaceErr } = await admin
    .from("partner_claim_tokens")
    .update({ claimed_at: claimedAt, claimed_by: realUserId })
    .eq("id", row.id)
    .is("claimed_at", null)
    .select("id")
    .maybeSingle();
  if (claimRaceErr) throw new Error(claimRaceErr.message || "Unable to claim token.");
  if (!won) {
    const { data: again } = await admin
      .from("partner_claim_tokens")
      .select("claimed_by")
      .eq("id", row.id)
      .maybeSingle();
    if (again?.claimed_by === realUserId) {
      return { alreadyClaimed: true, dealId, role };
    }
    throw new Error("This partner claim link was already used.");
  }

  const { data: deal, error: dealErr } = await admin
    .from("deals")
    .select("id, buyer_id, seller_id, created_by, status")
    .eq("id", dealId)
    .single();
  if (dealErr || !deal) throw new Error("Deal not found for this claim link.");

  if ((role === "buyer" && deal.buyer_id === realUserId) || (role === "seller" && deal.seller_id === realUserId)) {
    try {
      await linkExternalUser({ partnerId: row.partner_id as string, externalUserId: row.external_user_id as string, trustlayerUserId: realUserId });
    } catch { /* ignore */ }
    return { alreadyClaimed: true, dealId, role };
  }

  const seatField = role === "buyer" ? "buyer_id" : "seller_id";
  const currentSeat = (role === "buyer" ? deal.buyer_id : deal.seller_id) as string | null;
  if (currentSeat && provisionalId && currentSeat !== provisionalId && currentSeat !== realUserId) {
    let provisional = true;
    try {
      const { data: authUser } = await (admin as any).auth.admin.getUserById(currentSeat);
      const email = (authUser?.user?.email || "") as string;
      provisional = !email || SYNTHETIC_EMAIL_RE.test(email);
    } catch { provisional = true; }
    if (!provisional) throw new Error("This deal seat is already linked to another TrustLayer account.");
  }

  const patch: Record<string, string> = { [seatField]: realUserId };
  if (deal.created_by === provisionalId || deal.created_by === currentSeat) patch.created_by = realUserId;
  const { error: upErr } = await admin.from("deals").update(patch).eq("id", dealId);
  if (upErr) throw new Error(upErr.message || "Unable to attach you to this deal.");

  try {
    await linkExternalUser({ partnerId: row.partner_id as string, externalUserId: row.external_user_id as string, trustlayerUserId: realUserId });
  } catch (e) {
    console.warn("[claimPartnerToken] link:", e instanceof Error ? e.message : e);
  }

  await admin.from("deal_events").insert({
    deal_id: dealId,
    actor_user_id: realUserId,
    actor_type: "user",
    event_type: "partner_claim_claimed",
    metadata: { role, external_user_id: row.external_user_id, partner_id: row.partner_id },
  });

  if (provisionalId && provisionalId !== realUserId) {
    try {
      const { data: pendingAuth } = await (admin as any).auth.admin.getUserById(provisionalId);
      const email = (pendingAuth?.user?.email || "") as string;
      if (SYNTHETIC_EMAIL_RE.test(email)) await (admin as any).auth.admin.deleteUser(provisionalId);
    } catch { /* non-fatal */ }
  }
  return { alreadyClaimed: false, dealId, role };
}

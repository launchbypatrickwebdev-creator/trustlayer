import { createHash, randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { PartnerApiError } from "@/lib/api/errors";
import { partnerGetDealByRef } from "@/lib/domain/partner-api/deals";
import {
  isAxAdapter,
  isPartnerAxFundSessionEnabled,
} from "@/lib/domain/settlement";

const SESSION_TTL_SECONDS = 15 * 60;

/** 1-leg: deposit | release | cancel | cancel_unfunded
 *  Ax: fund (requires leg_index) | cancel_unfunded | open_dispute
 *  Party Ax release/cancel_ax is NOT offered — authority/admin only.
 */
export type PartnerCryptoAction =
  | "deposit"
  | "release"
  | "cancel"
  | "cancel_unfunded"
  | "fund"
  | "open_dispute";

function capabilityToken() {
  return randomBytes(32).toString("base64url");
}
function hashCapability(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function partnerCreateCryptoSession(opts: {
  partnerId: string;
  dealRef: string;
  action: PartnerCryptoAction;
  milestoneIndex: number;
  legIndex?: number | null;
  actorExternalId?: string;
  environment?: "test" | "live";
}) {
  const { partnerId, dealRef, action, milestoneIndex } = opts;

  if (
    !Number.isInteger(milestoneIndex) ||
    milestoneIndex < 0 ||
    milestoneIndex > 9
  ) {
    throw new PartnerApiError(
      "INVALID_REQUEST",
      "milestone_index must be an integer 0–9."
    );
  }

  const allowed: PartnerCryptoAction[] = [
    "deposit",
    "release",
    "cancel",
    "cancel_unfunded",
    "fund",
    "open_dispute",
  ];
  if (!allowed.includes(action)) {
    throw new PartnerApiError(
      "INVALID_REQUEST",
      "action must be deposit, release, cancel, cancel_unfunded, fund, or open_dispute."
    );
  }

  const admin = createSupabaseAdminClient();
  const publicDeal = await partnerGetDealByRef(
    partnerId,
    dealRef,
    opts.environment
  );
  const dealId = String(publicDeal.id);

  const { data: deal, error: dealErr } = await admin
    .from("deals")
    .select("id, status, rail, buyer_id, seller_id, settlement_adapter")
    .eq("id", dealId)
    .single();
  if (dealErr || !deal) {
    throw new PartnerApiError("NOT_FOUND", "Deal not found.", 404);
  }
  if (String(deal.rail) !== "crypto") {
    throw new PartnerApiError(
      "INVALID_STATE",
      "Crypto sessions are only available for crypto-rail deals.",
      400
    );
  }

  const status = String(deal.status || "");
  if (status === "draft") {
    throw new PartnerApiError(
      "INVALID_STATE",
      "Deal must be finalized before creating a crypto session.",
      400
    );
  }

  const isAx = isAxAdapter(String(deal.settlement_adapter || ""));

  if (isAx) {
    if (action === "deposit") {
      throw new PartnerApiError(
        "INVALID_REQUEST",
        "Ax deals use action=fund with leg_index 0|1 (not deposit).",
        400
      );
    }
    if (action === "release" || action === "cancel") {
      throw new PartnerApiError(
        "FORBIDDEN",
        "Ax release and cancel_ax are authority/admin only. Parties may open_dispute or cancel_unfunded when applicable.",
        403
      );
    }
    if (action === "fund" && !isPartnerAxFundSessionEnabled()) {
      throw new PartnerApiError(
        "UNSUPPORTED_RAIL",
        "Ax fund sessions are not enabled on Partner API yet.",
        422
      );
    }
  } else {
    if (action === "fund") {
      throw new PartnerApiError(
        "INVALID_REQUEST",
        "action=fund is only for solana_ax deals. Use deposit for one-leg escrow.",
        400
      );
    }
  }

  let roleNeeded: "buyer" | "seller" = "buyer";
  let legIndex: number | null =
    opts.legIndex === 0 || opts.legIndex === 1 ? opts.legIndex : null;

  if (action === "fund") {
    if (legIndex !== 0 && legIndex !== 1) {
      throw new PartnerApiError(
        "INVALID_REQUEST",
        "fund requires leg_index 0 (buyer) or 1 (seller).",
        400
      );
    }
    roleNeeded = legIndex === 0 ? "buyer" : "seller";
  } else if (action === "cancel" || action === "cancel_unfunded") {
    // 1-leg cancel: seller; cancel_unfunded: either party — prefer seller if actor not set
    roleNeeded = "seller";
    if (opts.actorExternalId) {
      // resolve below against either party for cancel_unfunded
    }
  } else if (action === "open_dispute") {
    roleNeeded = "buyer"; // either party allowed — refined by actor_external_id
  } else if (action === "release" || action === "deposit") {
    roleNeeded = "buyer";
  }

  let actorUserId =
    roleNeeded === "buyer"
      ? (deal.buyer_id as string)
      : (deal.seller_id as string);

  // cancel_unfunded / open_dispute: allow either party when actor_external_id provided
  if (
    (action === "cancel_unfunded" || action === "open_dispute") &&
    opts.actorExternalId
  ) {
    const { data: link } = await admin
      .from("partner_user_links")
      .select("user_id")
      .eq("partner_id", partnerId)
      .eq("external_user_id", opts.actorExternalId)
      .maybeSingle();
    if (
      link?.user_id &&
      (link.user_id === deal.buyer_id || link.user_id === deal.seller_id)
    ) {
      actorUserId = link.user_id as string;
      roleNeeded =
        link.user_id === deal.buyer_id ? "buyer" : "seller";
    }
  }

  if (!actorUserId) {
    throw new PartnerApiError(
      "INVALID_STATE",
      `Deal has no ${roleNeeded} assigned.`,
      400
    );
  }

  if (opts.actorExternalId && action !== "cancel_unfunded" && action !== "open_dispute") {
    const { data: link } = await admin
      .from("partner_user_links")
      .select("user_id")
      .eq("partner_id", partnerId)
      .eq("external_user_id", opts.actorExternalId)
      .maybeSingle();
    if (!link || link.user_id !== actorUserId) {
      throw new PartnerApiError(
        "FORBIDDEN",
        `actor_external_id does not match the deal ${roleNeeded}.`,
        403
      );
    }
  }

  const capability = capabilityToken();
  const capabilityHash = hashCapability(capability);
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_SECONDS * 1000
  ).toISOString();

  const siteRaw = String(process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (!siteRaw)
    throw new PartnerApiError(
      "CONFIGURATION_ERROR",
      "NEXT_PUBLIC_SITE_URL is not configured.",
      500
    );
  let siteUrl: URL;
  try {
    siteUrl = new URL(siteRaw);
  } catch {
    throw new PartnerApiError(
      "CONFIGURATION_ERROR",
      "NEXT_PUBLIC_SITE_URL is invalid.",
      500
    );
  }
  if (siteUrl.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new PartnerApiError(
      "CONFIGURATION_ERROR",
      "Production NEXT_PUBLIC_SITE_URL must use HTTPS.",
      500
    );
  }

  if (action === "deposit") {
    const { data, error } = await (admin.rpc as any)(
      "create_crypto_payment_session",
      {
        p_deal_id: dealId,
        p_actor_user_id: actorUserId,
        p_capability_hash: capabilityHash,
        p_expires_at: expiresAt,
        p_milestone_index: milestoneIndex,
      }
    );
    if (error || !data) {
      throw new PartnerApiError(
        "INVALID_STATE",
        "Unable to create deposit session.",
        400
      );
    }
    const url = new URL("/crypto/deposit", siteUrl);
    url.searchParams.set("session", capability);
    url.searchParams.set("milestoneIndex", String(milestoneIndex));
    return {
      session_id: (data as any).id ?? null,
      action: "deposit" as const,
      deal_id: dealId,
      milestone_index: milestoneIndex,
      role: "buyer" as const,
      expires_at: expiresAt,
      url: url.toString(),
    };
  }

  if (action === "fund") {
    // Ax fund — party opens TrustLayer Ax fund session page
    const url = new URL(`/deals/${dealId}/ax`, siteUrl);
    url.searchParams.set("action", "fund");
    url.searchParams.set("leg", String(legIndex));
    return {
      session_id: null,
      action: "fund" as const,
      deal_id: dealId,
      milestone_index: milestoneIndex,
      leg_index: legIndex,
      role: roleNeeded,
      expires_at: expiresAt,
      url: url.toString(),
    };
  }

  // release | cancel | cancel_unfunded | open_dispute → action session when RPC supports it
  const onChainAction =
    action === "release"
      ? "release"
      : action === "cancel_unfunded"
        ? "cancel_unfunded"
        : action === "open_dispute"
          ? "open_dispute"
          : "cancel";

  const { data, error } = await (admin.rpc as any)(
    "create_crypto_action_session",
    {
      p_deal_id: dealId,
      p_actor_user_id: actorUserId,
      p_action: onChainAction,
      p_capability_hash: capabilityHash,
      p_expires_at: expiresAt,
      p_milestone_index: milestoneIndex,
    }
  );
  if (error || !data) {
    throw new PartnerApiError(
      "INVALID_STATE",
      error?.message || `Unable to create ${action} session.`,
      400
    );
  }

  const url = new URL(`/deals/${dealId}`, siteUrl);
  url.searchParams.set("session", capability);
  url.searchParams.set("action", onChainAction);
  url.searchParams.set("milestoneIndex", String(milestoneIndex));

  return {
    session_id: (data as any).id ?? null,
    action,
    deal_id: dealId,
    milestone_index: milestoneIndex,
    role: roleNeeded,
    expires_at: expiresAt,
    url: url.toString(),
  };
}

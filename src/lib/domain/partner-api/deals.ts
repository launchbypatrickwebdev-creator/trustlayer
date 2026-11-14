import crypto from "crypto";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { PartnerApiError } from "@/lib/api/errors";
import { tryResolveExternalUser } from "@/lib/domain/partner-api/users";
import {
  ensurePartnerProvisionalUser,
  mintPartnerClaimToken,
} from "@/lib/domain/partner-api/claim-tokens";
import { serializePartnerDeal } from "@/lib/api/serialize-deal";
import {
  normalizeMilestones,
  type EscrowType,
} from "@/lib/domain/milestone";
import { enqueueFromDealEvent } from "@/lib/api/webhooks-dispatch";
import {
  resolveSettlementAdapter,
  isSettlementImplemented,
  assertPartnerSettlementSupported,
} from "@/lib/domain/settlement";
import {
  resolveAxLegs,
  legsToDbRows,
  type AxLegInput,
} from "@/lib/domain/ax-legs";

function createDealCode() {
  return `TL-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function decimalToUnits(value: unknown, decimals: number, field: string): bigint {
  const raw = String(value ?? "").trim();
  if (raw.length > 32) throw new PartnerApiError("INVALID_REQUEST", `${field} is too long.`);
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new PartnerApiError("INVALID_REQUEST", `${field} must be a positive decimal string.`);
  const [whole, fraction = ""] = raw.split(".");
  if (fraction.length > decimals) throw new PartnerApiError("INVALID_REQUEST", `${field} supports at most ${decimals} decimal places for this asset.`);
  const units = BigInt(whole) * (10n ** BigInt(decimals)) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
  if (units <= 0n) throw new PartnerApiError("INVALID_REQUEST", `${field} must be greater than zero.`);
  return units;
}
function unitsToDecimal(units: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals); const whole = units / scale; const remainder = (units % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return remainder ? `${whole}.${remainder}` : String(whole);
}

async function ensurePartnerEventAndEnqueue(opts: {
  partnerId: string; dealId: string; externalId: string | null; environment: "test" | "live";
  eventType: string; metadata: Record<string, unknown>;
}) {
  const admin = createSupabaseAdminClient();
  const { data: prior, error: lookupError } = await admin.from("deal_events")
    .select("id,event_type,created_at,metadata,actor_type")
    .eq("deal_id", opts.dealId).eq("event_type", opts.eventType)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (lookupError) throw new PartnerApiError("INTERNAL", "Unable to verify deal event history.", 500);
  let event = prior;
  if (!event) {
    const { data: inserted, error } = await admin.from("deal_events").insert({
      deal_id: opts.dealId, actor_type: "system", event_type: opts.eventType, metadata: opts.metadata,
    }).select("id,event_type,created_at,metadata,actor_type").single();
    if (error?.code === "23505") {
      const { data: raced } = await admin.from("deal_events").select("id,event_type,created_at,metadata,actor_type")
        .eq("deal_id", opts.dealId).eq("event_type", opts.eventType).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!raced) throw new PartnerApiError("INTERNAL", "Unable to recover deal event.", 500);
      event = raced;
    } else if (error || !inserted) throw new PartnerApiError("INTERNAL", "Unable to record deal event.", 500);
    else event = inserted;
  }
  try {
    await enqueueFromDealEvent({
      partnerId: opts.partnerId, dealId: opts.dealId, externalId: opts.externalId,
      dealEventId: String(event.id), eventType: opts.eventType, occurredAt: event.created_at,
      metadata: (event.metadata || opts.metadata) as Record<string, unknown>, actorType: event.actor_type,
    });
  } catch {
    throw new PartnerApiError("INTERNAL", "Deal event was recorded but webhook enqueue failed; retry the same request.", 500);
  }
}

export type PartnerCreateDealBody = {
  external_id: string;
  title: string;
  description?: string;
  amount: string;
  currency?: string;
  rail?: "crypto" | "fiat";
  asset_code?: string;
  /** solana | ethereum | … */
  chain?: string;
  /** solana_escrow | solana_ax | ethereum_escrow | fiat (dvp rejected on write) */
  settlement_adapter?: string;
  /** alias for settlement_adapter */
  settlement?: string;
  /** Required for solana_ax: exactly two legs (0=buyer, 1=seller) */
  legs?: {
    leg_index?: number;
    party_role?: "buyer" | "seller";
    asset_code: string;
    amount: string;
    mint?: string;
    valuation_usd?: string;
  }[];
  escrow_type?: "one_time" | "milestone";
  initiated_by?: "buyer" | "seller";
  buyer: { external_id: string };
  seller: { external_id: string };
  milestones?: {
    index?: number;
    title?: string;
    label?: string;
    amount: string;
  }[];
  duration_seconds?: number;
  metadata?: Record<string, unknown>;
  /** default false — preserve web lifecycle (draft until finalize) */
  auto_finalize?: boolean;
};

async function assertPartnerOwnsDeal(partnerId: string, dealId: string, environment?: "test" | "live") {
  const admin = createSupabaseAdminClient();
  let query = admin
    .from("partner_deals")
    .select("external_id, deal_id, environment")
    .eq("partner_id", partnerId)
    .eq("deal_id", dealId);
  if (environment) query = query.eq("environment", environment);
  const { data: link } = await query.maybeSingle();
  if (!link) {
    throw new PartnerApiError(
      "NOT_FOUND",
      "Deal not found for this partner.",
      404
    );
  }
  return link;
}

export async function partnerCreateDeal(
  partnerId: string,
  environment: "test" | "live",
  body: PartnerCreateDealBody
) {
  if (body.rail && body.rail !== "crypto") {
    throw new PartnerApiError(
      "UNSUPPORTED_RAIL",
      "This Partner API release supports crypto escrow only. Fiat settlement is not available.",
      422
    );
  }
  if (body.escrow_type && !["one_time", "milestone"].includes(body.escrow_type)) {
    throw new PartnerApiError("INVALID_REQUEST", "escrow_type must be one_time or milestone.");
  }
  if (body.initiated_by && !["buyer", "seller"].includes(body.initiated_by)) {
    throw new PartnerApiError("INVALID_REQUEST", "initiated_by must be buyer or seller.");
  }

  if (!body.external_id?.trim()) {
    throw new PartnerApiError("INVALID_REQUEST", "external_id is required.");
  }
  if (!body.title?.trim()) {
    throw new PartnerApiError("INVALID_REQUEST", "title is required.");
  }
  if (body.title.trim().length > 200 || String(body.external_id).trim().length > 200 || String(body.description || "").length > 10000) {
    throw new PartnerApiError("INVALID_REQUEST", "title/external_id must be at most 200 characters and description at most 10,000 characters.");
  }
  // Phase 0: resolve + validate settlement adapter BEFORE any side effects
  const railEarly = (body.rail || "crypto") as "crypto" | "fiat";
  if (String(body.settlement_adapter || body.settlement || "").toLowerCase() === "dvp") {
    throw new PartnerApiError(
      "INVALID_REQUEST",
      'settlement_adapter "dvp" is not accepted. Use "solana_ax" for atomic exchange.',
      400
    );
  }
  const resolvedEarly = resolveSettlementAdapter({
    rail: railEarly,
    chain: body.chain,
    settlementAdapter: body.settlement_adapter || body.settlement,
  });
  try {
    if (railEarly === "crypto") {
      assertPartnerSettlementSupported(resolvedEarly.settlement_adapter);
    }
  } catch (e) {
    throw new PartnerApiError(
      "UNSUPPORTED_RAIL",
      e instanceof Error ? e.message : "Unsupported settlement_adapter.",
      422
    );
  }

  const isAxRequest = resolvedEarly.settlement_adapter === "solana_ax";
  let axResolvedLegs: ReturnType<typeof resolveAxLegs> | null = null;

  if (isAxRequest) {
    if (!Array.isArray(body.legs) || body.legs.length !== 2) {
      throw new PartnerApiError(
        "INVALID_REQUEST",
        "solana_ax requires legs[] with exactly two entries (leg_index 0 and 1).",
        400
      );
    }
    if (body.escrow_type === "milestone" || (body.milestones && body.milestones.length > 0)) {
      throw new PartnerApiError(
        "INVALID_REQUEST",
        "solana_ax does not support milestones. Use one_time with two legs.",
        400
      );
    }
    const sorted = [...body.legs].sort(
      (a, b) => Number(a.leg_index ?? 0) - Number(b.leg_index ?? 0)
    );
    const legInputs: [AxLegInput, AxLegInput] = [sorted[0], sorted[1]].map((L, i) => {
      const idxL = L.leg_index != null ? Number(L.leg_index) : i;
      if (idxL !== i) {
        throw new PartnerApiError(
          "INVALID_REQUEST",
          "legs must use contiguous leg_index 0 and 1.",
          400
        );
      }
      const role = (L.party_role || (i === 0 ? "buyer" : "seller")) as "buyer" | "seller";
      if (i === 0 && role !== "buyer") {
        throw new PartnerApiError("INVALID_REQUEST", "leg 0 party_role must be buyer.", 400);
      }
      if (i === 1 && role !== "seller") {
        throw new PartnerApiError("INVALID_REQUEST", "leg 1 party_role must be seller.", 400);
      }
      return {
        legIndex: i as 0 | 1,
        partyRole: role,
        assetCode: String(L.asset_code || "").toUpperCase(),
        amount: String(L.amount || ""),
        mint: L.mint || null,
        valuationUsd: L.valuation_usd || null,
      };
    }) as [AxLegInput, AxLegInput];
    try {
      axResolvedLegs = resolveAxLegs({ legA: legInputs[0], legB: legInputs[1] });
    } catch (e) {
      throw new PartnerApiError(
        "INVALID_REQUEST",
        e instanceof Error ? e.message : "Invalid Ax legs.",
        400
      );
    }
    // Primary display amount/asset = leg 0 for legacy RPC fields
    body.amount = axResolvedLegs[0].amount;
    body.asset_code = axResolvedLegs[0].assetCode;
  } else if (Array.isArray(body.legs) && body.legs.length > 0) {
    throw new PartnerApiError(
      "INVALID_REQUEST",
      "legs[] is only valid when settlement_adapter is solana_ax.",
      400
    );
  }

  const requestedAsset = String(body.asset_code || body.currency || "SOL").toUpperCase();
  if (!["SOL", "USDC", "USDT", "EURC", "PYUSD", "USDS", "FDUSD"].includes(requestedAsset)) throw new PartnerApiError("INVALID_REQUEST", "asset_code must be SOL, USDC, USDT, EURC, PYUSD, USDS, or FDUSD for crypto rail.");
  const assetDecimals = requestedAsset === "SOL" ? 9 : 6;
  const amountUnits = decimalToUnits(body.amount, assetDecimals, "amount");
  if (amountUnits > 1_000_000_000_000n * (10n ** BigInt(assetDecimals))) throw new PartnerApiError("INVALID_REQUEST", "amount exceeds the supported maximum.");
  if (!body.buyer?.external_id?.trim() || !body.seller?.external_id?.trim()) {
    throw new PartnerApiError(
      "INVALID_REQUEST",
      "buyer.external_id and seller.external_id are required."
    );
  }
  if (String(body.buyer.external_id).trim().length > 200 || String(body.seller.external_id).trim().length > 200) throw new PartnerApiError("INVALID_REQUEST", "Party external IDs must be at most 200 characters.");
  if (body.buyer.external_id.trim() === body.seller.external_id.trim()) {
    throw new PartnerApiError(
      "INVALID_REQUEST",
      "buyer and seller must be different."
    );
  }

  if (body.milestones !== undefined && !Array.isArray(body.milestones)) throw new PartnerApiError("INVALID_REQUEST", "milestones must be an array.");
  if (body.milestones && body.milestones.length > 10) throw new PartnerApiError("INVALID_REQUEST", "A deal can have at most 10 milestones.");
  if ((body.escrow_type || "one_time") === "milestone" && (!body.milestones || body.milestones.length < 2)) throw new PartnerApiError("INVALID_REQUEST", "Milestone deals need at least 2 stages.");
  for (const [i, m] of (body.milestones || []).entries()) {
    const index = typeof m.index === "number" ? m.index : i;
    if (!Number.isInteger(index) || index !== i) throw new PartnerApiError("INVALID_REQUEST", "Milestone indexes must be contiguous from zero.");
    decimalToUnits(m.amount, assetDecimals, `milestones[${i}].amount`);
    if (String(m.title || m.label || "").length > 200) throw new PartnerApiError("INVALID_REQUEST", "Milestone labels must be at most 200 characters.");
  }
  if (body.metadata !== undefined) {
    if (!body.metadata || typeof body.metadata !== "object" || Array.isArray(body.metadata)) throw new PartnerApiError("INVALID_REQUEST", "metadata must be a JSON object.");
    if (JSON.stringify(body.metadata).length > 8192) throw new PartnerApiError("INVALID_REQUEST", "metadata must be at most 8 KiB.");
  }
  if (body.auto_finalize !== undefined && typeof body.auto_finalize !== "boolean") throw new PartnerApiError("INVALID_REQUEST", "auto_finalize must be a boolean.");
  if (body.duration_seconds !== undefined && (!Number.isInteger(body.duration_seconds) || Number(body.duration_seconds) < 60 || Number(body.duration_seconds) > 365 * 24 * 3600)) throw new PartnerApiError("INVALID_REQUEST", "duration_seconds must be an integer between 60 and 31536000.");

  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from("partner_deals")
    .select("deal_id")
    .eq("partner_id", partnerId)
    .eq("external_id", body.external_id.trim())
    .eq("environment", environment)
    .maybeSingle();
  if (existing) {
    await ensurePartnerEventAndEnqueue({ partnerId, dealId: String(existing.deal_id), externalId: body.external_id.trim(), environment, eventType: "partner_api_deal_created", metadata: { partner_id: partnerId, external_id: body.external_id.trim(), environment } });
    return partnerGetDeal(partnerId, existing.deal_id as string, environment);
  }

  const buyerExternal = body.buyer.external_id.trim();
  const sellerExternal = body.seller.external_id.trim();
  let buyerId: string | null = await tryResolveExternalUser(partnerId, buyerExternal);
  let sellerId: string | null = await tryResolveExternalUser(partnerId, sellerExternal);
  let buyerProvisional = false;
  let sellerProvisional = false;
  if (!buyerId) {
    buyerId = await ensurePartnerProvisionalUser({ partnerId, externalUserId: buyerExternal, role: "buyer" });
    buyerProvisional = true;
  }
  if (!sellerId) {
    sellerId = await ensurePartnerProvisionalUser({ partnerId, externalUserId: sellerExternal, role: "seller" });
    sellerProvisional = true;
  }
  const rail = body.rail || "crypto";
  const escrowType = (body.escrow_type || "one_time") as EscrowType;
  let amount = String(body.amount).trim();
  let currency = (body.currency || body.asset_code || "SOL").toUpperCase();
  let assetCode: string | null =
    rail === "crypto" ? (body.asset_code || currency).toUpperCase() : null;

  if (rail === "crypto") {
    if (!["SOL", "USDC", "USDT", "EURC", "PYUSD", "USDS", "FDUSD"].includes(assetCode || "")) {
      throw new PartnerApiError(
        "INVALID_REQUEST",
        "asset_code must be SOL, USDC, USDT, EURC, PYUSD, USDS, or FDUSD for crypto rail."
      );
    }
    currency = assetCode!;
  }

  const milestoneInputs = (body.milestones || []).map((m, i) => ({
    index: typeof m.index === "number" ? m.index : i,
    amount: String(m.amount),
    label: m.title || m.label || `Milestone ${i + 1}`,
  }));

  let milestones: ReturnType<typeof normalizeMilestones>;
  try { milestones = normalizeMilestones(escrowType, amount, milestoneInputs); }
  catch (error) { throw new PartnerApiError("INVALID_REQUEST", error instanceof Error ? error.message : "Invalid milestone configuration."); }
  if (escrowType === "milestone" && milestones.length) {
    const totalUnits = milestones.reduce((sum, milestone) => sum + decimalToUnits(milestone.amount, assetDecimals, "milestone amount"), 0n);
    if (totalUnits > 1_000_000_000_000n * (10n ** BigInt(assetDecimals))) throw new PartnerApiError("INVALID_REQUEST", "Total milestone amount exceeds the supported maximum.");
    amount = unitsToDecimal(totalUnits, assetDecimals);
  }

  const initiatedBy = body.initiated_by || "buyer";
  const createdBy = (initiatedBy === "buyer" ? buyerId : sellerId) as string;
  const dealCode = createDealCode();
  const duration =
    typeof body.duration_seconds === "number" && Number.isInteger(body.duration_seconds) && body.duration_seconds >= 60
      ? Math.min(body.duration_seconds, 365 * 24 * 3600)
      : 7 * 24 * 3600;
  const agreedDeadline = new Date(Date.now() + duration * 1000).toISOString();
  const invitationToken = crypto.randomUUID() + crypto.randomUUID();

  const checklist = {
    descriptionMatches: true,
    amountAssetCorrect: true,
    fundsMoveRulesUnderstood: true,
    photosAreActualItem: true,
    partnerAttested: true,
  };

  const snapshot = {
    title: body.title.trim(),
    description: (body.description || "").trim(),
    amount,
    currency,
    assetCode,
    escrowType,
    milestones,
    agreedDeadline,
    source: "partner_api",
    partner_id: partnerId,
    external_id: body.external_id.trim(),
    metadata: body.metadata || {},
  };
  const agreementSnapshotHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(snapshot))
    .digest("hex");

  const origin =
    initiatedBy === "buyer" ? "buyer_created" : "seller_created";

  const { data, error } = await (admin.rpc as any)(
    "create_deal_with_invitation_and_milestones",
    {
      p_deal_code: dealCode,
      p_created_by: createdBy,
      p_buyer_id: buyerId as string,
      p_seller_id: sellerId as string,
      p_title: body.title.trim(),
      p_description: (body.description || "").trim(),
      p_amount: amount,
      p_currency: currency,
      p_rail: rail,
      p_asset_code: assetCode,
      p_origin: origin,
      p_initiated_by: initiatedBy,
      p_duration_seconds: duration,
      p_deadline: agreedDeadline,
      p_invitee_telegram_id: null,
      p_invitee_username: null,
      p_invitation_token: invitationToken,
      p_invitation_expires_at: agreedDeadline,
      p_escrow_type: escrowType,
      p_milestone_count: milestones.length,
      p_condition_type: null,
      p_serial_or_ref: null,
      p_delivery_method: null,
      p_creator_checklist: checklist,
      p_agreement_snapshot_hash: agreementSnapshotHash,
      p_snapshot: snapshot,
      p_milestones: milestones,
    }
  );

  if (error || !data) {
    throw new PartnerApiError("INVALID_STATE", "Unable to create deal. Validate the request and retry with the same Idempotency-Key.", 400);
  }

  const dealId = (data as { id: string }).id;
  if (!dealId) {
    throw new PartnerApiError(
      "INTERNAL",
      "Deal created but id missing from RPC response.",
      500
    );
  }

  {
    const resolved = resolvedEarly;
    if (
      rail === "crypto" &&
      !isSettlementImplemented(resolved.settlement_adapter)
    ) {
      throw new PartnerApiError(
        "UNSUPPORTED_RAIL",
        `settlement_adapter "${resolved.settlement_adapter}" is not available yet. Use solana_escrow or solana_ax.`,
        422
      );
    }
    const { error: settleErr } = await admin
      .from("deals")
      .update({
        chain: resolved.chain,
        settlement_adapter: resolved.settlement_adapter,
      })
      .eq("id", dealId);
    if (settleErr) {
      console.error("partner deal chain/settlement_adapter update failed:", settleErr);
      throw new PartnerApiError(
        "INTERNAL",
        "Deal was created but settlement_adapter could not be set. Contact support with the request ID.",
        500
      );
    }

    if (axResolvedLegs && axResolvedLegs.length === 2) {
      const rows = legsToDbRows(dealId, axResolvedLegs);
      const { error: legsErr } = await admin.from("deal_settlement_legs").insert(rows);
      if (legsErr) {
        console.error("partner ax legs insert failed:", legsErr);
        throw new PartnerApiError(
          "INTERNAL",
          "Ax deal created but settlement legs could not be stored. Contact support with the request ID.",
          500
        );
      }
    }
  }

  const { error: linkError } = await admin.from("partner_deals").insert({
    partner_id: partnerId,
    deal_id: dealId,
    external_id: body.external_id.trim(),
    environment,
  });
  if (linkError) {
    // Concurrent requests with different idempotency keys may race on external_id.
    // Return the already-linked resource when possible rather than leaking the orphan's details.
    const { data: existingLink } = await admin.from("partner_deals").select("deal_id")
      .eq("partner_id", partnerId).eq("external_id", body.external_id.trim()).eq("environment", environment).maybeSingle();
    if (existingLink?.deal_id) {
      await ensurePartnerEventAndEnqueue({ partnerId, dealId: String(existingLink.deal_id), externalId: body.external_id.trim(), environment, eventType: "partner_api_deal_created", metadata: { partner_id: partnerId, external_id: body.external_id.trim(), environment } });
      return partnerGetDeal(partnerId, String(existingLink.deal_id), environment);
    }
    throw new PartnerApiError("INTERNAL", "Deal creation completed but partner linking failed. Contact support with the request ID.", 500);
  }
  const claimExpires = new Date(agreedDeadline);
  let buyerClaimUrl: string | null = null;
  let sellerClaimUrl: string | null = null;
  if (buyerProvisional) {
    buyerClaimUrl = (await mintPartnerClaimToken({
      partnerId, dealId, externalUserId: buyerExternal, role: "buyer",
      provisionalUserId: buyerId as string, expiresAt: claimExpires,
    })).claim_url;
  }
  if (sellerProvisional) {
    sellerClaimUrl = (await mintPartnerClaimToken({
      partnerId, dealId, externalUserId: sellerExternal, role: "seller",
      provisionalUserId: sellerId as string, expiresAt: claimExpires,
    })).claim_url;
  }
  await ensurePartnerEventAndEnqueue({
    partnerId, dealId, externalId: body.external_id.trim(), environment,
    eventType: "partner_api_deal_created",
    metadata: { partner_id: partnerId, external_id: body.external_id.trim(), environment, auto_finalize: Boolean(body.auto_finalize) },
  });

  // Default: preserve Web lifecycle (draft until explicit finalize).
  if (body.auto_finalize === true) {
    await partnerFinalizeDeal(partnerId, dealId, environment);
  }
  const serialized = await partnerGetDeal(partnerId, dealId, environment);
  return {
    ...serialized,
    buyer: {
      external_id: buyerExternal,
      user_id: buyerProvisional ? null : (buyerId as string),
      claim_url: buyerClaimUrl,
      claim_pending: Boolean(buyerProvisional),
    },
    seller: {
      external_id: sellerExternal,
      user_id: sellerProvisional ? null : (sellerId as string),
      claim_url: sellerClaimUrl,
      claim_pending: Boolean(sellerProvisional),
    },
  };
}

export async function partnerFinalizeDeal(partnerId: string, dealId: string, environment?: "test" | "live") {
  const admin = createSupabaseAdminClient();
  await assertPartnerOwnsDeal(partnerId, dealId, environment);

  const { data: deal, error: dealError } = await admin
    .from("deals")
    .select("*")
    .eq("id", dealId)
    .single();
  if (dealError || !deal) {
    throw new PartnerApiError("NOT_FOUND", "Deal not found.", 404);
  }

  // Already past draft — idempotent success
  const status = String(deal.status || "");
  if (status && status !== "draft") {
    if (!["cancelled", "refunded"].includes(status)) {
      const { data: linkRow } = await admin.from("partner_deals").select("external_id").eq("partner_id", partnerId).eq("deal_id", dealId).maybeSingle();
      await ensurePartnerEventAndEnqueue({ partnerId, dealId, externalId: (linkRow?.external_id as string) || null, environment: environment || "test", eventType: "partner_api_deal_finalized", metadata: { partner_id: partnerId } });
    }
    return partnerGetDeal(partnerId, dealId, environment);
  }

  const { data: milestonesRows } = await admin
    .from("deal_milestones")
    .select("milestone_index,amount,label")
    .eq("deal_id", dealId)
    .order("milestone_index", { ascending: true });

  const createdBy = deal.created_by as string;
  const snapshot = {
    title: deal.title,
    description: deal.description,
    amount: String(deal.amount),
    currency: deal.currency,
    assetCode: deal.asset_code,
    escrowType: deal.escrow_type,
    milestones: milestonesRows ?? [],
    agreedDeadline: deal.agreed_deadline || deal.deadline,
    conditionType: deal.condition_type,
    serialOrRef: deal.serial_or_ref,
    deliveryMethod: deal.delivery_method,
    creatorChecklist: deal.creator_checklist ?? {},
    evidence: [],
    source: "partner_api",
  };
  const agreementSnapshotHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(snapshot))
    .digest("hex");

  const { data, error } = await (admin.rpc as any)("finalize_deal_agreement", {
    p_deal_id: dealId,
    p_actor_user_id: createdBy,
    p_agreement_snapshot_hash: agreementSnapshotHash,
    p_snapshot: snapshot,
  });

  if (error || !data) {
    throw new PartnerApiError(
      "INVALID_STATE",
      "Unable to finalize deal agreement.",
      400
    );
  }

  const { data: linkRow } = await admin.from("partner_deals").select("external_id")
    .eq("partner_id", partnerId).eq("deal_id", dealId).maybeSingle();
  await ensurePartnerEventAndEnqueue({
    partnerId, dealId, externalId: (linkRow?.external_id as string) || null,
    environment: environment || "test", eventType: "partner_api_deal_finalized", metadata: { partner_id: partnerId },
  });

  return partnerGetDeal(partnerId, dealId, environment);
}

export async function partnerGetDeal(partnerId: string, dealId: string, environment?: "test" | "live") {
  const admin = createSupabaseAdminClient();
  const link = await assertPartnerOwnsDeal(partnerId, dealId, environment);

  const { data: deal, error } = await admin
    .from("deals")
    .select("*")
    .eq("id", dealId)
    .maybeSingle();
  if (error || !deal) {
    throw new PartnerApiError("NOT_FOUND", "Deal not found.", 404);
  }

  const [milestoneResult, settlementResult, legsResult] = await Promise.all([
    admin.from("deal_milestones").select("milestone_index, amount, label").eq("deal_id", dealId).order("milestone_index"),
    admin.from("crypto_settlements").select("milestone_index, onchain_status, funded, asset_code, last_tx_signature, escrow_pda, release_tx_signature, fund_tx_signature, ax_leg_index").eq("deal_id", dealId).order("milestone_index"),
    admin.from("deal_settlement_legs").select("leg_index, party_role, asset_code, asset_type, amount_base_units, decimals, fee_bps, mint, fee_amount").eq("deal_id", dealId).order("leg_index"),
  ]);
  if (milestoneResult.error || settlementResult.error) throw new PartnerApiError("INTERNAL", "Unable to load deal details.", 500);
  const milestones = milestoneResult.data; const settlements = settlementResult.data;
  const legs = legsResult.error ? [] : legsResult.data || [];

  return serializePartnerDeal(deal as any, {
    external_id: link.external_id,
    milestones: (milestones || []).map((m: any) => ({
      index: Number(m.milestone_index),
      amount: String(m.amount),
      title: m.label,
    })),
    settlements: settlements || [],
    legs,
  });
}

export async function partnerGetDealByRef(partnerId: string, ref: string, environment?: "test" | "live") {
  const admin = createSupabaseAdminClient();
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      ref
    );

  if (isUuid) {
    return partnerGetDeal(partnerId, ref, environment);
  }

  let linkQuery = admin.from("partner_deals").select("deal_id")
    .eq("partner_id", partnerId).eq("external_id", ref);
  if (environment) linkQuery = linkQuery.eq("environment", environment);
  const { data: link } = await linkQuery.maybeSingle();
  if (!link) {
    throw new PartnerApiError(
      "NOT_FOUND",
      "Deal not found for this partner.",
      404
    );
  }
  return partnerGetDeal(partnerId, link.deal_id as string, environment);
}

export type PartnerDealListOptions = { limit?: number; cursor?: string | null; environment?: "test" | "live"; search?: string; status?: string };
export async function partnerListDeals(partnerId: string, options: PartnerDealListOptions = {}) {
  const admin = createSupabaseAdminClient();
  const limit = Math.max(1, Math.min(Number(options.limit) || 25, 100));
  let query = admin.from("partner_deals")
    .select("id, deal_id, external_id, environment, created_at, deals!inner(*)")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (options.environment) query = query.eq("environment", options.environment);
  if (options.search?.trim()) {
    const term = options.search.trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(term);
    query = isUuid ? query.eq("deal_id", term) : query.ilike("external_id", `%${term.replace(/[%_]/g, "\\$&")}%`);
  }
  if (options.cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(options.cursor, "base64url").toString("utf8")) as { created_at: string; id: string };
      if (!decoded.created_at || !Number.isFinite(Date.parse(decoded.created_at)) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(decoded.id || "")) throw new Error("invalid cursor");
      query = query.or(`created_at.lt.${decoded.created_at},and(created_at.eq.${decoded.created_at},id.lt.${decoded.id})`);
    } catch { throw new PartnerApiError("INVALID_REQUEST", "Invalid cursor.", 400); }
  }
  if (options.status) query = query.eq("deals.status", options.status);
  const { data: rows, error } = await query;
  if (error) throw new PartnerApiError("INTERNAL", "Unable to list partner deals.", 500);
  const hasMore = (rows || []).length > limit;
  const page = (rows || []).slice(0, limit) as any[];
  if (!page.length) return { data: [], next_cursor: null, has_more: false };
  const ids = page.map(row => String(row.deal_id));
  const [milestoneResult, settlementResult, legsResult] = await Promise.all([
    admin.from("deal_milestones").select("deal_id, milestone_index, amount, label").in("deal_id", ids).order("milestone_index", { ascending: true }),
    admin.from("crypto_settlements").select("deal_id, milestone_index, onchain_status, funded, asset_code, last_tx_signature, escrow_pda, release_tx_signature, fund_tx_signature, ax_leg_index").in("deal_id", ids).order("milestone_index", { ascending: true }),
    admin.from("deal_settlement_legs").select("deal_id, leg_index, party_role, asset_code, asset_type, amount_base_units, decimals, fee_bps, mint").in("deal_id", ids).order("leg_index", { ascending: true }),
  ]);
  if (milestoneResult.error || settlementResult.error) throw new PartnerApiError("INTERNAL", "Unable to load deal milestone or settlement details.", 500);
  const milestoneRows = milestoneResult.data; const settlementRows = settlementResult.data;
  const legRows = legsResult.error ? [] : legsResult.data || [];
  const milestonesByDeal = new Map<string, any[]>();
  for (const m of milestoneRows || []) { const key = String(m.deal_id); milestonesByDeal.set(key, [...(milestonesByDeal.get(key) || []), { index: Number(m.milestone_index), amount: String(m.amount), title: m.label }]); }
  const settlementsByDeal = new Map<string, any[]>();
  for (const row of settlementRows || []) { const key = String(row.deal_id); const { deal_id: _dealId, ...settlement } = row as any; settlementsByDeal.set(key, [...(settlementsByDeal.get(key) || []), settlement]); }
  const legsByDeal = new Map<string, any[]>();
  for (const row of legRows || []) { const key = String(row.deal_id); const { deal_id: _d, ...leg } = row as any; legsByDeal.set(key, [...(legsByDeal.get(key) || []), leg]); }
  const data = page.map(row => {
    const deal = Array.isArray(row.deals) ? row.deals[0] : row.deals;
    return serializePartnerDeal(deal as any, { external_id: row.external_id, milestones: milestonesByDeal.get(String(row.deal_id)) || [], settlements: settlementsByDeal.get(String(row.deal_id)) || [], legs: legsByDeal.get(String(row.deal_id)) || [] });
  });
  const last = page[page.length - 1];
  const next_cursor = hasMore ? Buffer.from(JSON.stringify({ created_at: last.created_at, id: last.id }), "utf8").toString("base64url") : null;
  return { data, next_cursor, has_more: hasMore };
}

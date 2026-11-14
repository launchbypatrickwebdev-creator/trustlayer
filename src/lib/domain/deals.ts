import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import {
  normalizeMilestones,
  type EscrowType,
  type MilestoneInput,
} from "@/lib/domain/milestone";
import crypto from "crypto";
import {
  breakdownFee,
  normalizeFeeMode,
  type FeeMode,
} from "@/lib/domain/fee";
import { ensurePendingInviteParty } from "@/lib/domain/pending-party";
import {
  isAxAdapter,
  resolveSettlementAdapter,
  type DealChain,
  type SettlementAdapter,
} from "@/lib/domain/settlement";
import {
  buildAxSnapshotPayload,
  hashAxSnapshot,
  legsToDbRows,
  resolveAxLegs,
  type AxLegInput,
} from "@/lib/domain/ax-legs";

export type DealRail = "crypto" | "fiat";
export type DealOrigin = "buyer_created" | "seller_created";
export type DealRole = "buyer" | "seller";

export type DealStatus =
  | "draft"
  | "awaiting_counterparty"
  | "accepted"
  | "declined"
  | "awaiting_payment"
  | "funded"
  | "awaiting_delivery"
  | "completed"
  | "refund_pending"
  | "refunded"
  | "cancelled"
  | "disputed"
  | "expired";

export interface CreateDealInput {
  title: string;
  description?: string | null;
  amount: string | number;
  currency: string;
  rail: DealRail;
  assetCode?: string | null;
  origin: DealOrigin;
  initiatedBy: DealRole;
  counterpartyUserId?: string | null;
  durationSeconds?: number | null;
  inviteeTelegramId?: number | null;
  inviteeUsername?: string | null;
  escrowType?: EscrowType;
  milestones?: MilestoneInput[] | null;
  conditionType?: string | null;
  serialOrRef?: string | null;
  deliveryMethod?: string | null;
  /** booleans + Ax settler fields (releaseAuthorityMode / releaseAuthorityPubkey) */
  creatorChecklist?: Record<string, unknown> | null;
  /** on_top (default) | from_amount — Binance-style fee choice */
  feeMode?: FeeMode | string | null;
  feeBps?: number | null;
  /** Optional web invite hints (RPC still needs counterpartyUserId) */
  inviteeEmail?: string | null;
  /** Crypto L1 family; default solana. Ignored for fiat. */
  chain?: DealChain | string | null;
  /** Explicit adapter override: solana_escrow | solana_ax | dvp | ethereum_escrow | fiat */
  settlementAdapter?: SettlementAdapter | string | null;
  /**
   * Ax (2-leg) inputs. When settlementAdapter is solana_ax / dvp, both required.
   * party A = buyer leg, party B = seller leg.
   */
  axLegA?: {
    assetCode: string;
    amount: string | number;
    valuationSol?: string | null;
    mint?: string | null;
  } | null;
  axLegB?: {
    assetCode: string;
    amount: string | number;
    valuationSol?: string | null;
    mint?: string | null;
  } | null;
  /** Optional wallets at create (preferred: both linked before on-chain create) */
  partyAWallet?: string | null;
  partyBWallet?: string | null;
}

export interface Deal {
  id: string;
  deal_code: string;
  created_by: string;
  buyer_id: string | null;
  seller_id: string | null;
  title: string;
  description: string | null;
  amount: string;
  currency: string;
  rail: DealRail;
  asset_code: string | null;
  /** solana | ethereum | other; null for fiat */
  chain?: string | null;
  /** solana_escrow | ethereum_escrow | dvp | fiat | solana_ax */
  settlement_adapter?: string | null;
  /** one_leg | ax | legacy aliases */
  settlement_kind?: string | null;
  origin: DealOrigin;
  initiated_by: DealRole;
  duration_seconds: number | null;
  deadline: string | null;
  agreed_deadline?: string | null;
  admin_review_deadline?: string | null;
  escrow_type?: string | null;
  milestone_count?: number | null;
  condition_type?: string | null;
  serial_or_ref?: string | null;
  delivery_method?: string | null;
  creator_checklist?: Record<string, unknown> | null;
  creator_accepted_terms_at?: string | null;
  counterparty_accepted_evidence_at?: string | null;
  agreement_snapshot_hash?: string | null;
  status: DealStatus;
  created_at: string;
  updated_at: string;
  fee_mode?: FeeMode | string | null;
  fee_bps?: number | null;
  platform_fee_amount?: string | number | null;
  fund_amount?: string | number | null;
}

function normalizeAmount(value: string | number): string {
  const amount = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    throw new Error("Amount must be a positive decimal number.");
  }
  if (Number(amount) <= 0) {
    throw new Error("Amount must be greater than zero.");
  }
  return amount;
}

function createDealCode(): string {
  return `TL-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function validateInput(input: CreateDealInput) {
  const title = (input.title || "").trim();
  if (title.length < 3) throw new Error("Title must be at least 3 characters.");
  const amount = normalizeAmount(input.amount);
  const currency = (input.currency || "").trim().toUpperCase();
  if (!currency) throw new Error("Currency is required.");
  let durationSeconds = input.durationSeconds ?? null;
  if (durationSeconds != null) {
    durationSeconds = Number(durationSeconds);
    if (!Number.isFinite(durationSeconds) || durationSeconds < 60) {
      throw new Error("Agreed deadline must be at least 60 seconds.");
    }
  }
  return {
    title,
    description: input.description?.trim() || null,
    amount,
    currency,
    durationSeconds,
  };
}

export async function createDeal(input: CreateDealInput): Promise<Deal> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Authentication required.");

  const normalized = validateInput(input);

  // Registered = client already resolved profiles.id via lookup.
  // Invite path may still resolve an existing user inside ensurePendingInviteParty.
  let counterpartyUserId = (input.counterpartyUserId || "").trim() || null;
  let counterpartyRegistered = Boolean(counterpartyUserId);
  let counterpartyProvisional = false;

  if (!counterpartyUserId) {
    const uname = (input.inviteeUsername || "").replace(/^@/, "").trim();
    const em = (input.inviteeEmail || "").trim();
    if (!uname && !em) {
      throw new Error(
        "Counterparty required: registered user, or invite by @username / email."
      );
    }
    const pending = await ensurePendingInviteParty({
      username: uname || null,
      email: em || null,
    });
    counterpartyUserId = pending.id;
    counterpartyProvisional = Boolean(pending.provisional);
    counterpartyRegistered = !pending.provisional;
  }

  if (counterpartyUserId === user.id) {
    throw new Error("You cannot create a deal with yourself.");
  }

  // Shareable login?invite= only when the seat is a provisional shell.
  const inviteRequired = counterpartyProvisional && !counterpartyRegistered;

  const escrowType: EscrowType = input.escrowType || "one_time";
  const milestones = normalizeMilestones(
    escrowType,
    normalized.amount,
    input.milestones
  );
  const milestoneCount = milestones.length;
  const totalFromMilestones = milestones.reduce(
    (s, m) => s + Number(m.amount),
    0
  );
  if (escrowType === "milestone") {
    const t = Number(normalized.amount);
    if (Math.abs(totalFromMilestones - t) > 0.000001 && t > 0) {
      // prefer sum of milestones as deal amount
      normalized.amount = String(totalFromMilestones);
    }
  }

  // Financial eligibility is a TrustLayer policy layer. Crypto keeps its
  // existing wallet/blockchain controls; fiat is checked after milestone
  // normalization so the full deal amount is what counts toward exposure.
  const { enforceFinancialEligibility } = await import("@/lib/domain/financial-eligibility");
  await enforceFinancialEligibility(normalized.amount, normalized.currency, input.rail);

  const checklist = input.creatorChecklist || {};
  if (
    !checklist.descriptionMatches ||
    !checklist.amountAssetCorrect ||
    !checklist.fundsMoveRulesUnderstood ||
    !checklist.photosAreActualItem
  ) {
    throw new Error("All agreement checklist items must be confirmed.");
  }

  const buyerId =
    input.initiatedBy === "buyer" ? user.id : counterpartyUserId!;
  const sellerId =
    input.initiatedBy === "seller" ? user.id : counterpartyUserId!;

  const dealCode = createDealCode();
  const agreedDeadline =
    normalized.durationSeconds != null
      ? new Date(Date.now() + normalized.durationSeconds * 1000).toISOString()
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  // URL-safe token (matches style of RPC tokens; never UUID — avoids dual-row confusion)
  const invitationToken = crypto.randomBytes(32).toString("base64url");
  const admin = createSupabaseAdminClient();

  const assetCode =
    input.rail === "crypto"
      ? (input.assetCode || normalized.currency || "SOL").toUpperCase()
      : null;

  if (input.rail === "crypto") {
    if (!["SOL", "USDC", "USDT", "EURC", "PYUSD", "USDS", "FDUSD"].includes(assetCode || "")) {
      throw new Error("Crypto asset must be SOL, USDC, USDT, EURC, PYUSD, USDS, or FDUSD.");
    }
    // currency mirrors asset for crypto
    normalized.currency = assetCode!;
  }

  const snapshot = {
    title: normalized.title,
    description: normalized.description,
    amount: normalized.amount,
    currency: normalized.currency,
    assetCode,
    escrowType,
    milestones,
    agreedDeadline,
    conditionType: input.conditionType || null,
    serialOrRef: input.serialOrRef || null,
    deliveryMethod: input.deliveryMethod || null,
    checklist,
  };
  const agreementSnapshotHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(snapshot))
    .digest("hex");

  // Atomic agreement creation: deal + immutable milestone definitions.
  // The invitation is intentionally finalized only after all supplied
  // agreement evidence uploads succeed.
  const { data, error } = await (admin.rpc as any)(
    "create_deal_with_invitation_and_milestones",
    {
      p_deal_code: dealCode,
      p_created_by: user.id,
      p_buyer_id: buyerId,
      p_seller_id: sellerId,
      p_title: normalized.title,
      p_description: normalized.description,
      p_amount: normalized.amount,
      p_currency: normalized.currency,
      p_rail: input.rail,
      p_asset_code: assetCode,
      p_origin: input.origin,
      p_initiated_by: input.initiatedBy,
      p_duration_seconds: normalized.durationSeconds,
      p_deadline: agreedDeadline,
      p_invitee_telegram_id: input.inviteeTelegramId ?? null,
      p_invitee_username: input.inviteeUsername ?? null,
      p_invitation_token: invitationToken,
      p_invitation_expires_at: agreedDeadline,
      p_escrow_type: escrowType,
      p_milestone_count: milestoneCount,
      p_condition_type: input.conditionType || null,
      p_serial_or_ref: input.serialOrRef || null,
      p_delivery_method: input.deliveryMethod || null,
      p_creator_checklist: checklist,
      p_agreement_snapshot_hash: agreementSnapshotHash,
      p_snapshot: snapshot,
      p_milestones: milestones,
    }
  );

  if (error || !data) {
    console.error("Atomic agreement creation failed:", error);
    throw new Error(error?.message || "Unable to create deal.");
  }

  const dealId = (data as Deal).id;

  // Chain + settlement adapter (multi-rail direction). RPC may not accept these yet.
  {
    const resolved = resolveSettlementAdapter({
      rail: input.rail,
      chain: input.chain,
      settlementAdapter: input.settlementAdapter,
    });
    const cl = (input.creatorChecklist || {}) as Record<string, unknown>;
    const authMode = String(cl.releaseAuthorityMode || "admin").toLowerCase();
    const authPk =
      authMode === "custom"
        ? String(cl.releaseAuthorityPubkey || "").trim()
        : null;
    const { error: settleErr } = await admin
      .from("deals")
      .update({
        chain: resolved.chain,
        settlement_adapter: resolved.settlement_adapter,
        ax_release_authority:
          authPk && authPk.length >= 32 ? authPk : null,
      })
      .eq("id", dealId);
    if (settleErr) {
      console.error("deal chain/settlement_adapter update failed:", settleErr);
      // Non-fatal if columns not migrated yet; core deal still created.
    }
  }

  if (input.rail === "crypto") {
    // Agreement definitions are already created atomically by the RPC.
    // Do not create fake settlement rows before an on-chain PDA exists.
  }

  // Ax: persist immutable legs + snapshot when adapter is solana_ax (or legacy dvp).
  {
    const resolved = resolveSettlementAdapter({
      rail: input.rail,
      chain: input.chain,
      settlementAdapter: input.settlementAdapter,
    });
    if (isAxAdapter(resolved.settlement_adapter) && input.axLegA && input.axLegB) {
      try {
        const legs = resolveAxLegs({
          legA: {
            assetCode: String(input.axLegA.assetCode),
            amount: String(input.axLegA.amount ?? "1"),
            valuationSol: input.axLegA.valuationSol ?? null,
            mint: input.axLegA.mint ?? null,
          },
          legB: {
            assetCode: String(input.axLegB.assetCode),
            amount: String(input.axLegB.amount ?? "1"),
            valuationSol: input.axLegB.valuationSol ?? null,
            mint: input.axLegB.mint ?? null,
          },
          feeMode: normalizeFeeMode(input.feeMode),
        });
        const rows = legsToDbRows(dealId, legs);
        const { error: legsErr } = await admin
          .from("deal_settlement_legs")
          .insert(rows);
        if (legsErr) {
          console.error("[createDeal] ax legs insert:", legsErr.message);
        } else {
          const payload = buildAxSnapshotPayload({
            dealId,
            legs,
            partyAWallet: String(input.partyAWallet || ""),
            partyBWallet: String(input.partyBWallet || ""),
            expiryTimestamp: agreedDeadline
              ? Math.floor(new Date(agreedDeadline).getTime() / 1000)
              : Math.floor(Date.now() / 1000) +
                Math.max(Number(normalized.durationSeconds) || 3600, 60),
            earliestSettlementTimestamp: Math.floor(Date.now() / 1000),
            feeMode: normalizeFeeMode(input.feeMode),
            releaseMode: "parties",
          });
          const snapHash = hashAxSnapshot(payload);
          const { error: snapErr } = await admin
            .from("deal_settlement_snapshots")
            .insert({
              deal_id: dealId,
              snapshot_hash: snapHash,
              payload,
              locked_by: user.id,
            });
          if (snapErr) {
            console.error("[createDeal] ax snapshot insert:", snapErr.message);
          }
          // Display amount = leg A primary for deal header compatibility
          await admin
            .from("deals")
            .update({
              amount: legs[0].amount,
              asset_code: legs[0].assetCode,
              currency: legs[0].assetCode,
              agreement_snapshot_hash: snapHash,
              settlement_legs: payload.legs,
            })
            .eq("id", dealId);
        }
      } catch (axErr) {
        console.error("[createDeal] ax leg resolve failed:", axErr);
        throw axErr instanceof Error
          ? axErr
          : new Error("Invalid Ax leg configuration.");
      }
    }
  }

  // Upload supplied agreement evidence before the invitation becomes actionable.
  // The API route enforces the same participant and image limits.
  // This function itself cannot receive File objects, so callers that need
  // uploads should use finalizeDealAgreement after uploading.

  // Fee mode (does not change RPC). Default on_top matches existing prepare/fund.
  const fee = breakdownFee({
    amount: normalized.amount,
    feeMode: normalizeFeeMode(input.feeMode),
    feeBps: input.feeBps,
  });
  {
    const { error: feeErr } = await admin
      .from("deals")
      .update({
        fee_mode: fee.feeMode,
        fee_bps: fee.feeBps,
        platform_fee_amount: fee.platformFee,
        fund_amount: fee.fundAmount,
      })
      .eq("id", dealId);
    if (feeErr) {
      console.warn(
        "fee columns update skipped (run fee_mode migration?):",
        feeErr.message
      );
    }
  }

  // Optional invite email on invitation row (counterparty UUID still required by RPC)
  if (input.inviteeEmail) {
    try {
      await admin
        .from("deal_invitations")
        .update({ invitee_email: String(input.inviteeEmail).trim().toLowerCase() })
        .eq("deal_id", dealId);
    } catch {
      /* column optional until migration */
    }
  }

  await admin
    .from("deal_events")
    .insert({
      deal_id: dealId,
      actor_user_id: user.id,
      actor_type: "user",
      event_type: "agreement_created",
      metadata: {
        agreement_snapshot_hash: agreementSnapshotHash,
        fee_mode: fee.feeMode,
        fund_amount: fee.fundAmount,
        platform_fee: fee.platformFee,
      },
    });

  // Finalization is performed by the create API after evidence upload.
  // The returned deal is still draft until finalizeDealAgreement is called.

  const { data: full } = await admin
    .from("deals")
    .select("*")
    .eq("id", dealId)
    .single();

  // ---------------------------------------------------------------------------
  // Invite link MUST equal deal_invitations.token (unique). Normalize to ONE row
  // with our invitationToken so the share URL always claims successfully.
  // ---------------------------------------------------------------------------
  {
    const { data: invRows, error: invReadErr } = await admin
      .from("deal_invitations")
      .select("id, token, created_at")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false });

    if (invReadErr) {
      console.warn("[createDeal] read invitations:", invReadErr.message);
    }

    const rows = (invRows || []) as Array<{ id: string; token: string }>;

    if (rows.length === 0) {
      const { error: insErr } = await admin.from("deal_invitations").insert({
        deal_id: dealId,
        inviter_id: user.id,
        invitee_user_id: counterpartyUserId,
        invitee_username: input.inviteeUsername ?? null,
        invitee_email: input.inviteeEmail
          ? String(input.inviteeEmail).trim().toLowerCase()
          : null,
        token: invitationToken,
        status: "pending",
        expires_at: agreedDeadline,
      });
      if (insErr) {
        console.error("[createDeal] invitation insert failed:", insErr.message);
        throw new Error(
          "Deal created but invitation could not be stored (" + dealCode + ")."
        );
      }
    } else {
      const keepId = rows[0].id;
      // Point the kept row at the token we will put in the invite URL
      const { error: upErr } = await admin
        .from("deal_invitations")
        .update({ token: invitationToken })
        .eq("id", keepId);
      if (upErr) {
        // Unique collision: token already used — keep existing token from that row
        console.warn(
          "[createDeal] could not set invitation token, using DB value:",
          upErr.message
        );
        const existing = rows.find((r) => r.id === keepId)?.token;
        if (existing) {
          // fall through with DB token
          return {
            ...((full || data) as Deal),
            invitation_token: String(existing),
          } as Deal & { invitation_token?: string };
        }
        throw new Error("Unable to normalize invitation token.");
      }
      // Drop any other rows for this deal (duplicate UUID/RPC pairs)
      const dropIds = rows.slice(1).map((r) => r.id);
      if (dropIds.length) {
        await admin.from("deal_invitations").delete().in("id", dropIds);
      }
    }
  }

  return {
    ...((full || data) as Deal),
    // Always store invitation for Accept/Decline RPC; only surface token when needed.
    invitation_token: invitationToken,
    invite_required: inviteRequired,
    counterparty_registered: counterpartyRegistered,
  } as Deal & {
    invitation_token?: string;
    invite_required?: boolean;
    counterparty_registered?: boolean;
  };
}

/**
 * Idempotently ensure an existing domain-created Ax deal has both persisted
 * settlement legs and its immutable snapshot. This repairs retries after the
 * deal row was created but a secondary Ax insert failed; it never creates a
 * deal or executes a transaction.
 */
export async function ensureAxDealSettlementLegs(input: {
  dealId: string;
  legA: { assetCode: string; amount: string | number; valuationSol?: string | null; mint?: string | null };
  legB: { assetCode: string; amount: string | number; valuationSol?: string | null; mint?: string | null };
  partyAWallet: string;
  partyBWallet: string;
  lockedByUserId: string;
  feeMode?: FeeMode | string | null;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data: deal, error: dealError } = await admin.from("deals")
    .select("id,deadline,agreed_deadline,settlement_adapter")
    .eq("id", input.dealId).single();
  if (dealError || !deal || deal.settlement_adapter !== "solana_ax") {
    throw new Error(dealError?.message || "Ax deal not found or adapter mismatch.");
  }

  const feeMode = normalizeFeeMode(input.feeMode);
  const legs = resolveAxLegs({
    legA: { assetCode: String(input.legA.assetCode), amount: String(input.legA.amount), valuationSol: input.legA.valuationSol ?? null, mint: input.legA.mint ?? null },
    legB: { assetCode: String(input.legB.assetCode), amount: String(input.legB.amount), valuationSol: input.legB.valuationSol ?? null, mint: input.legB.mint ?? null },
    feeMode,
  });
  const expectedRows = legsToDbRows(input.dealId, legs);
  const { data: existingRows, error: rowsError } = await admin.from("deal_settlement_legs")
    .select("leg_index,party_role,asset_code,amount_base_units,decimals,mint,fee_amount,fee_asset_code,fee_bps,fee_payer")
    .eq("deal_id", input.dealId);
  if (rowsError) throw new Error(`Unable to inspect Ax settlement legs: ${rowsError.message}`);
  const rows = (existingRows ?? []) as Array<{
    leg_index: number; party_role: string; asset_code: string; amount_base_units: string;
    decimals: number; mint: string | null; fee_amount: string; fee_asset_code: string;
    fee_bps: number; fee_payer: string;
  }>;
  if (rows.length > 2 || rows.some((row) => ![0, 1].includes(Number(row.leg_index))) ||
      new Set(rows.map((row) => Number(row.leg_index))).size !== rows.length) {
    throw new Error("Ax deal contains invalid or duplicate settlement leg indexes.");
  }
  for (const expected of expectedRows) {
    const current = rows.find((row) => Number(row.leg_index) === Number(expected.leg_index));
    if (current) {
      if (String(current.asset_code).toUpperCase() !== String(expected.asset_code).toUpperCase() ||
          String(current.amount_base_units) !== String(expected.amount_base_units) ||
          Number(current.decimals) !== Number(expected.decimals) ||
          String(current.party_role) !== String(expected.party_role) ||
          String(current.mint ?? "") !== String(expected.mint ?? "") ||
          String(current.fee_amount) !== String(expected.fee_amount) ||
          String(current.fee_asset_code).toUpperCase() !== String(expected.fee_asset_code).toUpperCase() ||
          Number(current.fee_bps) !== Number(expected.fee_bps) ||
          String(current.fee_payer) !== String(expected.fee_payer)) {
        throw new Error(`Persisted Ax leg ${expected.leg_index} does not match the accepted agent settlement intent and fee terms.`);
      }
    } else {
      const { error: insertError } = await admin.from("deal_settlement_legs").insert(expected);
      if (insertError) throw new Error(`Unable to persist Ax leg ${expected.leg_index}: ${insertError.message}`);
    }
  }

  const { data: snapshot, error: snapshotError } = await admin.from("deal_settlement_snapshots")
    .select("snapshot_hash,payload").eq("deal_id", input.dealId).maybeSingle();
  if (snapshotError) throw new Error(`Unable to inspect Ax settlement snapshot: ${snapshotError.message}`);
  let payload = snapshot?.payload as Record<string, unknown> | undefined;
  let snapshotHash = String(snapshot?.snapshot_hash ?? "");
  if (payload) {
    const snapshotLegs = Array.isArray(payload.legs) ? payload.legs as Array<Record<string, unknown>> : [];
    if (snapshotLegs.length !== 2 || payload.settlement_adapter !== "solana_ax" ||
        String(payload.fee_mode ?? "") !== feeMode ||
        String(payload.party_a_wallet ?? "") !== input.partyAWallet ||
        String(payload.party_b_wallet ?? "") !== input.partyBWallet ||
        snapshotLegs.some((row, index) => String(row.asset_code).toUpperCase() !== legs[index].assetCode ||
          String(row.amount_base_units) !== legs[index].amountBaseUnits ||
          Number(row.decimals) !== legs[index].decimals ||
          String(row.party_role) !== legs[index].partyRole ||
          String(row.fee_amount_base_units) !== legs[index].feeAmountBaseUnits ||
          String(row.fee_asset_code).toUpperCase() !== legs[index].feeAssetCode ||
          Number(row.fee_bps) !== legs[index].feeBps ||
          String(row.fee_payer) !== legs[index].feePayer)) {
      throw new Error("Existing Ax snapshot does not match the accepted agent settlement intent and linked party wallets.");
    }
  } else {
    payload = buildAxSnapshotPayload({
      dealId: input.dealId, legs, partyAWallet: input.partyAWallet, partyBWallet: input.partyBWallet,
      expiryTimestamp: deal.agreed_deadline || deal.deadline
        ? Math.floor(new Date(deal.agreed_deadline || deal.deadline).getTime() / 1000)
        : Math.floor(Date.now() / 1000) + 3600,
      earliestSettlementTimestamp: Math.floor(Date.now() / 1000), feeMode, releaseMode: "parties",
    });
    snapshotHash = hashAxSnapshot(payload);
    const { error: insertSnapshotError } = await admin.from("deal_settlement_snapshots").insert({
      deal_id: input.dealId, snapshot_hash: snapshotHash, payload, locked_by: input.lockedByUserId,
    });
    if (insertSnapshotError) throw new Error(`Unable to persist Ax settlement snapshot: ${insertSnapshotError.message}`);
  }
  const { error: updateError } = await admin.from("deals").update({
    amount: legs[0].amount, asset_code: legs[0].assetCode, currency: legs[0].assetCode,
    agreement_snapshot_hash: snapshotHash, settlement_legs: payload.legs,
  }).eq("id", input.dealId);
  if (updateError) throw new Error(`Unable to finalize Ax deal settlement terms: ${updateError.message}`);
}

export async function finalizeDealAgreement(dealId: string): Promise<Deal> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Authentication required.");
  const admin = createSupabaseAdminClient();
  const { data: deal, error: dealError } = await admin.from("deals").select("*").eq("id", dealId).single();
  if (dealError || !deal) throw new Error(dealError?.message || "Deal not found.");
  const { data: milestones } = await admin.from("deal_milestones").select("milestone_index,amount,label").eq("deal_id", dealId).order("milestone_index", { ascending: true });
  const { data: attachments } = await admin.from("deal_attachments").select("id,file_name,caption,sort_order,mime_type,watermarked,storage_path").eq("deal_id", dealId).order("sort_order", { ascending: true });
  const snapshot = {
    title: deal.title, description: deal.description, amount: String(deal.amount), currency: deal.currency, assetCode: deal.asset_code,
    escrowType: deal.escrow_type, milestones: milestones ?? [], agreedDeadline: deal.agreed_deadline || deal.deadline,
    conditionType: deal.condition_type, serialOrRef: deal.serial_or_ref, deliveryMethod: deal.delivery_method,
    creatorChecklist: deal.creator_checklist ?? {},
    evidence: (attachments ?? []).map(a => ({ id:a.id, file_name:a.file_name, caption:a.caption, sort_order:a.sort_order, mime_type:a.mime_type, watermarked:a.watermarked, storage_path:a.storage_path })),
  };
  const agreementSnapshotHash = crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  const { data, error } = await (admin.rpc as any)("finalize_deal_agreement", {
    p_deal_id: dealId, p_actor_user_id: user.id, p_agreement_snapshot_hash: agreementSnapshotHash, p_snapshot: snapshot,
  });
  if (error || !data) throw new Error(error?.message || error?.details || "Unable to finalize deal agreement.");
  return data as Deal;
}

export async function getDealById(dealId: string): Promise<Deal | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Authentication required.");

  // Participant path (RLS)
  const { data, error } = await supabase
    .from("deals")
    .select("*")
    .eq("id", dealId)
    .maybeSingle();

  if (!error && data) return data as Deal;

  // Admin path: platform operators can inspect any deal
  const { createSupabaseAdminClient } = await import("@/lib/db/supabase-admin");
  const admin = createSupabaseAdminClient();
  const { data: isAdmin } = await (admin.rpc as any)("is_trustlayer_admin", {
    p_user_id: user.id,
  });
  if (isAdmin !== true) {
    if (error) throw new Error("Unable to load deal.");
    return null;
  }

  const { data: adminRow, error: adminErr } = await admin
    .from("deals")
    .select("*")
    .eq("id", dealId)
    .maybeSingle();

  if (adminErr) throw new Error("Unable to load deal.");
  return adminRow as Deal | null;
}

export async function listMyDeals(): Promise<Deal[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Authentication required.");

  const { data, error } = await supabase
    .from("deals")
    .select("*")
    .or(
      `created_by.eq.${user.id},buyer_id.eq.${user.id},seller_id.eq.${user.id}`
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listMyDeals Supabase error:", error);
    throw new Error(
      `Unable to load deals: ${error.message}${
        error.details ? ` — ${error.details}` : ""
      }`
    );
  }

  return (data ?? []) as Deal[];
}

export type CounterpartyAction = "accept" | "decline";

export async function respondToDealInvitation(
  dealId: string,
  action: CounterpartyAction,
  counterpartyChecklist?: Record<string, boolean>
): Promise<Deal> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Authentication required.");

  if (
    !dealId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      dealId
    )
  ) {
    throw new Error("Invalid deal id.");
  }

  if (action !== "accept" && action !== "decline") {
    throw new Error("Invalid invitation action.");
  }

  const admin = createSupabaseAdminClient();

  // Option A: Ax counterparty must have a linked Solana wallet before accept
  // so initiator can Create Ax with both party pubkeys.
  // wallets table has no is_active column — do not select or filter it.
  if (action === "accept") {
    const { data: dealRow } = await admin
      .from("deals")
      // settlement_kind is on crypto_settlements only — never select on deals
      .select("id, settlement_adapter, rail")
      .eq("id", dealId)
      .maybeSingle();

    const adapter = String(
      (dealRow as { settlement_adapter?: string } | null)?.settlement_adapter ||
        ""
    ).toLowerCase();

    let forceAx =
      adapter.includes("ax") ||
      adapter.includes("dvp") ||
      adapter === "solana_ax";

    if (!forceAx) {
      const { count } = await admin
        .from("deal_settlement_legs")
        .select("id", { count: "exact", head: true })
        .eq("deal_id", dealId);
      forceAx = (count ?? 0) >= 2;
    }

    if (forceAx) {
      const { data: wallets, error: walletErr } = await admin
        .from("wallets")
        .select("id, address, user_id")
        .eq("user_id", user.id)
        .limit(20);

      if (walletErr) {
        console.error("[accept] wallets lookup:", walletErr.message, {
          userId: user.id,
        });
      }

      const hasWallet = (wallets || []).some(
        (w) => String(w.address || "").trim().length >= 32
      );

      console.info("[accept] ax wallet gate", {
        userId: user.id,
        rowCount: wallets?.length ?? 0,
        hasWallet,
        sample: (wallets || []).slice(0, 3).map((w) =>
          String(w.address || "").slice(0, 12)
        ),
      });

      if (!hasWallet) {
        throw new Error(
          "Link a Solana wallet on your TrustLayer profile before accepting this atomic exchange. The initiator needs both party wallets to create the on-chain Ax settlement."
        );
      }
    }
  }

  const { data, error } = await (admin.rpc as any)(
    "respond_to_deal_invitation",
    {
      p_deal_id: dealId,
      p_actor_user_id: user.id,
      p_action: action,
      p_counterparty_checklist: counterpartyChecklist || {},
    }
  );

  if (error || !data) {
    throw new Error(error?.message || "Unable to update the deal invitation.");
  }

  return data as Deal;
}

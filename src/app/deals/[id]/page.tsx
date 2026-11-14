
import TokenIcon from "@/components/TokenIcon";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import CryptoDepositButton from "@/components/crypto/CryptoDepositButton";
import ReleaseEscrowButton from "@/components/crypto/ReleaseEscrowButton";
import SolanaAxActions from "@/components/crypto/SolanaAxActions";
import AxDealPanel from "@/components/crypto/AxDealPanel";
import AcceptNftValuation from "@/components/deals/AcceptNftValuation";
import { isAxAdapter } from "@/lib/domain/settlement";
import { formatLegAmountLabel } from "@/lib/domain/deal-display";
import DisputeButton from "@/components/deals/DisputeButton";
import SellerCancelButton from "@/components/deals/SellerCancelButton";
import DealAttachments from "@/components/deals/DealAttachments";
import DisputeChat from "@/components/disputes/DisputeChat";
import LiveDealSync from "@/components/realtime/LiveDealSync";
import InvitationResponse from "@/components/deals/InvitationResponse";
import AuthenticatedShell from "@/components/layout/AuthenticatedShell";

import { getDealById, type Deal } from "@/lib/domain/deals";

interface DealPageProps {
  params: Promise<{ id: string }>;
}

function formatDuration(seconds: number | null) {
  if (!seconds) return "No deadline";

  const units = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ] as const;

  let remaining = seconds;
  const parts: string[] = [];

  for (const [label, size] of units) {
    if (remaining >= size) {
      const value = Math.floor(remaining / size);
      remaining %= size;
      parts.push(`${value} ${label}${value === 1 ? "" : "s"}`);
    }
  }

  return parts.join(", ") || "< 1 minute";
}

function roleForDeal(deal: Deal, userId: string): "buyer" | "seller" | null {
  if (deal.buyer_id === userId) return "buyer";
  if (deal.seller_id === userId) return "seller";
  return null;
}

async function isPlatformAdmin(userId: string): Promise<boolean> {
  const { createSupabaseAdminClient } = await import("@/lib/db/supabase-admin");
  const admin = createSupabaseAdminClient();
  const { data } = await (admin.rpc as any)("is_trustlayer_admin", {
    p_user_id: userId,
  });
  return data === true;
}

export default async function DealPage({ params }: DealPageProps) {
  const { id } = await params;

  let deal: Deal | null;

  try {
    deal = await getDealById(id);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Authentication required."
    ) {
      redirect("/login");
    }

    throw error;
  }

  if (!deal) return notFound();

  const supabaseRole = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabaseRole.auth.getUser();

  if (!user) redirect("/login");

  let role: "buyer" | "seller" | "admin" | null = roleForDeal(deal, user.id);
  const adminViewer = !role ? await isPlatformAdmin(user.id) : false;
  if (!role && adminViewer) role = "admin";
  if (!role) notFound();

  // Participants use session client (RLS). Admins use service role for full deal context.
  const db =
    role === "admin"
      ? (await import("@/lib/db/supabase-admin")).createSupabaseAdminClient()
      : supabaseRole;

  const { data: disputes } = await db
    .from("deal_disputes")
    .select("id, status, reason, opened_at, opened_by, milestone_index")
    .eq("deal_id", deal.id)
    .order("opened_at", { ascending: false });

  const openDisputes = (disputes ?? []).filter(
    (d) => d.status === "open"
  );

  const dispute = disputes?.[0] ?? null;

  const disputedMilestones = new Set(
    openDisputes.map((d) => Number(d.milestone_index))
  );

  const openDispute = openDisputes.length > 0;

  const agreedDeadline = deal.agreed_deadline || deal.deadline;

  const deadlinePassed =
    !!agreedDeadline &&
    new Date(agreedDeadline).getTime() <= Date.now();

  const adminApprovedRefund = false;
  const adminApprovedRelease = false;

  const { data: milestones } = await db
    .from("deal_milestones")
    .select("id, milestone_index, amount, label")
    .eq("deal_id", deal.id)
    .order("milestone_index", { ascending: true });

  const { data: settlements } = await db
    .from("crypto_settlements")
    .select(
      "id, milestone_index, milestone_label, amount_base_units, onchain_status, funded, escrow_pda, asset_code, last_tx_signature, create_tx_signature, fund_tx_signature, release_tx_signature, cancel_tx_signature, refund_tx_signature, chain_deal_id, settlement_kind, buyer_wallet, seller_wallet"
    )
    .eq("deal_id", deal.id)
    .order("milestone_index", { ascending: true });

  const isMilestone =
    deal.escrow_type === "milestone" ||
    (milestones?.length ?? 0) > 1;

  const showCryptoActions = deal.rail === "crypto";
  const adapterHint = String(
    (deal as Deal & { settlement_adapter?: string | null }).settlement_adapter ||
      (deal as Deal & { settlement_kind?: string | null }).settlement_kind ||
      ""
  ).toLowerCase();
  let isAx =
    isAxAdapter(
      (deal as Deal & { settlement_adapter?: string | null }).settlement_adapter
    ) ||
    adapterHint.includes("ax") ||
    adapterHint.includes("dvp");

  // Legs: use admin client (same as deals list) so RLS cannot hide Ax legs
  type AxLegRow = {
    leg_index: number;
    party_role?: string | null;
    asset_code?: string | null;
    asset_type?: string | null;
    amount_base_units?: string | number | null;
    fee_amount?: string | number | null;
    fee_bps?: number | null;
    decimals?: number | null;
    nft_valuation_amount?: string | number | null;
  };
  let axLegs: AxLegRow[] | null = null;
  if (showCryptoActions || isAx) {
    try {
      const adminDb = createSupabaseAdminClient();
      const { data: axLegsRaw, error: legsErr } = await adminDb
        .from("deal_settlement_legs")
        .select(
          "leg_index, party_role, asset_code, asset_type, amount_base_units, fee_amount, fee_bps, decimals, nft_valuation_amount"
        )
        .eq("deal_id", deal.id)
        .order("leg_index", { ascending: true });
      if (legsErr) {
        console.error("[deal detail] settlement_legs:", legsErr.message);
      }
      axLegs = (axLegsRaw as AxLegRow[] | null) ?? null;
    } catch (e) {
      console.error("[deal detail] settlement_legs fetch failed", e);
      axLegs = null;
    }
  }
  if (!isAx && axLegs && axLegs.length >= 2) isAx = true;

  /*
   * IMPORTANT:
   *
   * Settlement state is authoritative per milestone.
   * Deal.status is only the aggregate lifecycle state.
   *
   * One-time escrow is milestone 0.
   */
  const oneTimeSettlement = (settlements ?? []).find(
    (row) => Number(row.milestone_index) === 0
  );

  const oneTimeStatus = String(
    oneTimeSettlement?.onchain_status || "not_created"
  );

  const oneTimeFunded =
    oneTimeSettlement?.onchain_status === "funded";

  const oneTimeTerminal = [
    "released",
    "cancelled",
    "refunded",
  ].includes(oneTimeStatus);

  const oneTimeDisputed = disputedMilestones.has(0);

  return (
    <AuthenticatedShell>
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <LiveDealSync dealId={deal.id} />

      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <Link
              href={role === "admin" ? "/admin/deals" : "/deals"}
              className="text-sm text-gray-500"
            >
              {role === "admin" ? "← Platform deals" : "← Back to deals"}
            </Link>

            {role === "admin" ? (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Admin view — deal details and settlements (party actions stay with buyer/seller wallets).
              </p>
            ) : null}

            <h1 className="mt-3 text-3xl font-bold">
              {deal.title}
            </h1>

            <p className="mt-1 font-mono text-sm text-gray-500">
              {deal.deal_code}
            </p>
          </div>

          <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium">
            {deal.status}
          </span>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-[var(--tl-line)] bg-white p-6 shadow-sm">
            <h2 className="font-semibold">Agreement</h2>

            {deal.description && (
              <p className="mt-4 whitespace-pre-wrap text-gray-600">
                {deal.description}
              </p>
            )}

            <dl className="mt-6 space-y-4">
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Payment rail</dt>
                <dd className="font-medium">
                  {isAx
                    ? "Crypto → Solana → Atomic exchange"
                    : deal.rail}
                </dd>
              </div>

              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Settlement</dt>
                <dd className="font-medium">
                  {isAx ? "Atomic exchange (Ax)" : "Escrow (1-leg)"}
                </dd>
              </div>

              {!isAx && (
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Amount</dt>
                  <dd className="inline-flex items-center gap-1.5 font-medium">
                    {deal.amount}
                    <TokenIcon
                      code={deal.asset_code || deal.currency}
                      size={16}
                    />
                    {deal.asset_code || deal.currency}
                  </dd>
                </div>
              )}

              {!isAx && deal.asset_code && (
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Asset</dt>
                  <dd className="inline-flex items-center gap-1.5 font-medium">
                    <TokenIcon code={deal.asset_code} size={16} />
                    {deal.asset_code}
                  </dd>
                </div>
              )}

              {!isAx &&
                (deal as Deal & { escrow_type?: string }).escrow_type && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Escrow type</dt>
                    <dd className="font-medium capitalize">
                      {String(
                        (deal as Deal & { escrow_type?: string }).escrow_type
                      ).replace("_", " ")}
                    </dd>
                  </div>
                )}

              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Initiated by</dt>
                <dd className="font-medium capitalize">
                  {deal.initiated_by}
                </dd>
              </div>

              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Your role</dt>
                <dd className="font-medium capitalize">
                  {role === "admin" ? "admin (observer)" : role}
                  {isAx
                    ? role === "buyer"
                      ? " · funds leg A"
                      : role === "seller"
                        ? " · funds leg B"
                        : ""
                    : ""}
                </dd>
              </div>
            </dl>

            {((isAx || (axLegs && axLegs.length >= 2)) && axLegs && axLegs.length > 0) && (
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {axLegs.map((l) => {
                  const idx = Number(l.leg_index ?? 0);
                  const code = String(l.asset_code || "SOL");
                  const human = formatLegAmountLabel(l);
                  const feeBps = l.fee_bps != null ? Number(l.fee_bps) : 125;
                  return (
                    <div
                      key={idx}
                      className="rounded-xl border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] p-3 text-sm"
                    >
                      <p className="text-xs font-semibold uppercase text-[var(--tl-muted)]">
                        {idx === 0
                          ? "Leg A · buyer pays"
                          : "Leg B · seller pays"}
                      </p>
                      <p className="mt-1 inline-flex items-center gap-1.5 font-medium">
                        <TokenIcon code={code} size={14} /> {human}
                      </p>
                      <p className="mt-1 text-xs text-[var(--tl-muted)]">
                        Fee {feeBps / 100}% · party{" "}
                        {String(l.party_role || (idx === 0 ? "buyer" : "seller"))}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            <DealAttachments dealId={deal.id} />

            {!isAx && milestones && milestones.length > 0 && (
              <div className="mt-6 rounded-lg border bg-gray-50 p-4">
                <h3 className="font-medium">
                  Agreed milestone structure
                </h3>

                <p className="mt-1 text-xs text-gray-500">
                  Fixed at agreement creation; settlement status
                  changes independently.
                </p>

                <div className="mt-3 space-y-2">
                  {milestones.map((m) => {
                    const settlement = settlements?.find(
                      (x) =>
                        Number(x.milestone_index) ===
                        Number(m.milestone_index)
                    );

                    return (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span>
                          #{Number(m.milestone_index) + 1}{" "}
                          {m.label ||
                            `Milestone ${
                              Number(m.milestone_index) + 1
                            }`}
                        </span>

                        <span className="font-medium">
                          <span className="inline-flex items-center gap-1">
                            {m.amount}
                            <TokenIcon code={deal.asset_code || deal.currency} size={14} />
                            {deal.asset_code || deal.currency}
                          </span>{" "}
                          ·{" "}
                          {settlement?.onchain_status ||
                            "not created"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-[var(--tl-line)] bg-white p-6 shadow-sm">
            <h2 className="font-semibold">Deadlines</h2>

            <p className="mt-4 text-sm text-gray-500">
              Agreed trade deadline
            </p>

            <p className="mt-1 text-xl font-semibold">
              {agreedDeadline
                ? new Date(agreedDeadline).toLocaleString()
                : "Not set"}
            </p>

            {deal.admin_review_deadline && (
              <div className="mt-4 rounded-lg bg-amber-50 p-3">
                <p className="text-sm text-gray-600">
                  Admin review window
                </p>

                <p className="mt-1 font-medium">
                  {new Date(
                    deal.admin_review_deadline
                  ).toLocaleString()}
                </p>
              </div>
            )}

            <p className="mt-2 text-xs text-gray-500">
              Neither deadline moves money automatically.
            </p>

            <p className="mt-2 text-sm text-gray-500">
              Duration: {formatDuration(deal.duration_seconds)}
            </p>

            <div className="mt-8 border-t pt-6">
              <h3 className="font-medium">Lifecycle</h3>

              <div className="mt-4 space-y-3 text-sm">
                <LifecycleStep
                  label="Deal created"
                  active
                />

                <LifecycleStep
                  label="Counterparty acceptance"
                  active={[
                    "accepted",
                    "awaiting_payment",
                    "funded",
                    "awaiting_delivery",
                    "completed",
                    "refunded",
                  ].includes(deal.status)}
                />

                <LifecycleStep
                  label="Payment"
                  active={[
                    "funded",
                    "awaiting_delivery",
                    "completed",
                    "refunded",
                  ].includes(deal.status)}
                />

                <LifecycleStep
                  label="Completion"
                  active={
                    deal.status === "completed" ||
                    deal.status === "refunded"
                  }
                />
              </div>
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-[var(--tl-line)] bg-white p-6 shadow-sm">
          <h2 className="font-semibold">Next action</h2>

          <p className="mt-2 text-gray-600">
            {nextAction(
              deal,
              role,
              adminApprovedRefund,
              adminApprovedRelease,
              deadlinePassed,
              isMilestone,
              isAx
            )}
          </p>

          {openDispute && (
            <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4">
              <p className="font-medium text-amber-900">
                Dispute open
              </p>

              <p className="mt-1 text-sm text-amber-800">
                Actions for the disputed milestone are frozen
                on-chain; other milestones remain independently
                settled. Use the dispute room below to share
                evidence with the other party and admin.
              </p>

              {dispute?.reason && (
                <p className="mt-3 whitespace-pre-wrap text-sm text-amber-900">
                  {dispute.reason}
                </p>
              )}
            </div>
          )}

          {/* Fiat rail */}
          {deal.rail === "fiat" &&
            !openDispute &&
            ["accepted", "awaiting_payment"].includes(
              deal.status
            ) && (
              <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-medium">
                  Fiat settlement
                </p>

                <p className="mt-1">
                  This deal is on the fiat rail ({deal.currency}).
                  Crypto deposit is not used. Naira checkout will
                  appear here when Flutterwave is connected.
                </p>
              </div>
            )}

          {/* ========== MILESTONE CARDS ========== */}
          {showCryptoActions && isMilestone && (
            <div className="mt-6 space-y-4">
              <p className="text-sm text-gray-600">
                Each agreed milestone remains visible. Settlement
                state changes independently; a dispute freezes only
                its milestone on-chain.
              </p>

              <div className="rounded-lg bg-gray-50 p-3 text-sm">
                <strong>
                  {(settlements ?? []).filter(
                    (x) => x.onchain_status === "funded"
                  ).length}
                  /{milestones?.length ?? 0}
                </strong>{" "}
                milestones currently funded ·{" "}
                <strong>
                  {(settlements ?? []).filter((x) =>
                    [
                      "released",
                      "cancelled",
                      "refunded",
                    ].includes(String(x.onchain_status))
                  ).length}
                  /{milestones?.length ?? 0}
                </strong>{" "}
                settled
              </div>

              {(milestones || []).map((m) => {
                const idx = Number(m.milestone_index);

                const s = settlements?.find(
                  (row) =>
                    Number(row.milestone_index) === idx
                );

                const st = String(
                  s?.onchain_status || "not_created"
                );

                /*
                 * Authoritative funded state:
                 * exact settlement + exact milestone.
                 */
                const fundedM = st === "funded";

                const terminalM = [
                  "released",
                  "cancelled",
                  "refunded",
                ].includes(st);

                const disputedM =
                  disputedMilestones.has(idx);

                return (
                  <div
                    key={`${deal.id}:${idx}`}
                    className="rounded-lg border p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {m.label ||
                            `Milestone ${idx + 1}`}
                        </p>

                        <p className="mt-1 text-sm font-medium">
                          <span className="inline-flex items-center gap-1">
                            {m.amount}
                            <TokenIcon code={deal.asset_code || deal.currency} size={14} />
                            {deal.asset_code || deal.currency}
                          </span>
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          Settlement: {st}
                          {s?.escrow_pda
                            ? ` · PDA ${String(
                                s.escrow_pda
                              ).slice(0, 8)}…`
                            : ""}
                        </p>
                      </div>

                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">
                        #{idx + 1}
                      </span>
                    </div>

                    {!terminalM && !disputedM && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {role === "buyer" && !fundedM && (
                          <CryptoDepositButton
                            dealId={deal.id}
                            milestoneIndex={idx}
                            label={
                              st === "created_unfunded"
                                ? `Fund milestone ${idx + 1}`
                                : `Create / fund milestone ${idx + 1}`
                            }
                          />
                        )}

                        {st === "created_unfunded" && !fundedM && (
                          <SellerCancelButton
                            dealId={deal.id}
                            assetCode={String(
                              deal.asset_code || deal.currency || "SOL"
                            )}
                            milestoneIndex={idx}
                            variant="unfunded"
                          />
                        )}

                        {role === "buyer" && fundedM && (
                          <ReleaseEscrowButton
                            dealId={deal.id}
                            milestoneIndex={idx}
                            label={`Release milestone ${idx + 1}`}
                          />
                        )}

                        {role === "seller" && fundedM && (
                          <SellerCancelButton
                            dealId={deal.id}
                            assetCode={String(
                              deal.asset_code ||
                                deal.currency ||
                                "SOL"
                            )}
                            milestoneIndex={idx}
                          />
                        )}

                        {fundedM && (
                          <DisputeButton
                            dealId={deal.id}
                            milestoneIndex={idx}
                          />
                        )}
                      </div>
                    )}

                    {terminalM && (
                      <p className="mt-3 text-xs font-medium text-green-700">
                        {st === "released"
                          ? "Released to seller"
                          : st === "cancelled"
                            ? "Cancelled — funds returned to buyer"
                            : "Refunded by admin"}
                      </p>
                    )}

                    {s &&
                      [
                        s.create_tx_signature,
                        s.fund_tx_signature,
                        s.release_tx_signature,
                        s.cancel_tx_signature,
                        s.refund_tx_signature,
                      ].filter(Boolean).length > 0 && (
                        <div className="mt-3 border-t pt-3 text-xs">
                          <p className="font-medium">
                            On-chain transactions
                          </p>

                          <div className="mt-1 space-y-1">
                            {[
                              [
                                "Create",
                                s.create_tx_signature,
                              ],
                              ["Fund", s.fund_tx_signature],
                              [
                                "Release",
                                s.release_tx_signature,
                              ],
                              ["Cancel", s.cancel_tx_signature],
                              [
                                "Admin refund",
                                s.refund_tx_signature,
                              ],
                            ]
                              .filter(([, sig]) => Boolean(sig))
                              .map(([label, sig]) => (
                                <a
                                  key={`${label}-${sig}`}
                                  href={`https://explorer.solana.com/tx/${sig}?cluster=devnet`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block break-all text-blue-600 underline"
                                >
                                  {label}:{" "}
                                  {String(sig).slice(0, 24)}
                                  …
                                </a>
                              ))}
                          </div>
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ========== AX (2-LEG) PATH ========== */}
          {showCryptoActions && isAx && !isMilestone && (() => {
            const oneTimeSettlement = settlements?.find(
              (row) => Number(row.milestone_index) === 0
            );
            const oneTimeStatus = String(
              oneTimeSettlement?.onchain_status || "not_created"
            );
            const axRole =
              role === "buyer" || role === "seller" ? role : "observer";
            return (
              <div className="mt-6 space-y-3">
                {axLegs && axLegs.length === 2 && (
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    {axLegs.map((l) => (
                      <div
                        key={String(l.leg_index)}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                      >
                        <div className="font-medium">
                          Leg {String(l.leg_index)} ({String(l.party_role ?? "")})
                        </div>
                        <div className="text-gray-600">
                          {String(l.asset_code ?? "")} · base units {String(l.amount_base_units ?? "")}
                          {" · "}fee {String(l.fee_amount ?? "")} ({String(l.fee_bps ?? "")} bps)
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <AcceptNftValuation
                    dealId={deal.id}
                    legs={(axLegs || []).map((l: Record<string, unknown>) => ({
                      legIndex: Number(l.leg_index ?? l.legIndex ?? 0),
                      assetType: String(l.asset_type || l.assetType || ""),
                      assetCode: String(l.asset_code || l.assetCode || ""),
                      nftValuationSol: l.nft_valuation_amount
                        ? String(l.nft_valuation_amount)
                        : l.nftValuationSol
                          ? String(l.nftValuationSol)
                          : null,
                      acceptedAt: l.nft_valuation_accepted_at
                        ? String(l.nft_valuation_accepted_at)
                        : null,
                    }))}
                  />
                  <AxDealPanel dealId={deal.id} />
              </div>
            );
          })()}

          {/* ========== ONE-TIME PATH ========== */}
          {showCryptoActions && !isAx && !isMilestone && (() => {
            const oneTimeSettlement = settlements?.find(
              (row) => Number(row.milestone_index) === 0
            );

            const oneTimeStatus = String(
              oneTimeSettlement?.onchain_status || "not_created"
            );

            const oneTimeFunded = oneTimeStatus === "funded";

            const oneTimeTerminal = [
              "released",
              "cancelled",
              "refunded",
            ].includes(oneTimeStatus);

            const oneTimeDisputed = disputedMilestones.has(0);

            return (
              <div className="mt-6 flex flex-wrap items-start gap-3">
                {role === "buyer" &&
                  !oneTimeFunded &&
                  !oneTimeTerminal &&
                  !oneTimeDisputed && (
                    <CryptoDepositButton
                      dealId={deal.id}
                      milestoneIndex={0}
                      label={
                        oneTimeStatus === "created_unfunded"
                          ? "Fund escrow"
                          : "Open Crypto Deposit"
                      }
                    />
                  )}

                {oneTimeStatus === "created_unfunded" &&
                  !oneTimeTerminal &&
                  !oneTimeDisputed && (
                    <SellerCancelButton
                      dealId={deal.id}
                      assetCode={String(
                        deal.asset_code || deal.currency || "SOL"
                      )}
                      milestoneIndex={0}
                      variant="unfunded"
                    />
                  )}

                {role === "buyer" &&
                  oneTimeFunded &&
                  !oneTimeTerminal &&
                  !oneTimeDisputed && (
                    <ReleaseEscrowButton
                      dealId={deal.id}
                      milestoneIndex={0}
                      label="Release to Seller"
                    />
                  )}

                {role === "seller" &&
                  oneTimeFunded &&
                  !oneTimeTerminal &&
                  !oneTimeDisputed && (
                    <SellerCancelButton
                      dealId={deal.id}
                      assetCode={String(
                        deal.asset_code ||
                          deal.currency ||
                          "SOL"
                      )}
                      milestoneIndex={0}
                    />
                  )}

                {oneTimeFunded &&
                  !oneTimeTerminal &&
                  !oneTimeDisputed && (
                    <DisputeButton
                      dealId={deal.id}
                      milestoneIndex={0}
                    />
                  )}
              </div>
            );
          })()}

          {deal.status === "awaiting_counterparty" &&
            role !== deal.initiated_by && (
              <InvitationResponse
                dealId={deal.id}
                isAx={
                  String(
                    (deal as { settlement_adapter?: string }).settlement_adapter ||
                      ""
                  ).includes("ax") ||
                  String((deal as Deal & { settlement_kind?: string | null }).settlement_kind || "").includes("ax")
                }
                hasNft={
                  String(deal.asset_code || "").toUpperCase() === "NFT" ||
                  Boolean(
                    (deal as { ax_leg_a_asset?: string }).ax_leg_a_asset ===
                      "NFT" ||
                      (deal as { ax_leg_b_asset?: string }).ax_leg_b_asset ===
                        "NFT"
                  )
                }
              />
            )}
        </section>

        {(disputes ?? []).map((d) => (
          <DisputeChat
            key={d.id}
            disputeId={d.id}
            canPost={d.status === "open"}
            viewerRole={role === "admin" ? "buyer" : role}
          />
        ))}
      </div>
    </main>
    </AuthenticatedShell>
  );
}

function LifecycleStep({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`h-2.5 w-2.5 rounded-full ${
          active ? "bg-black" : "bg-gray-200"
        }`}
      />

      <span
        className={
          active ? "font-medium" : "text-gray-400"
        }
      >
        {label}
      </span>
    </div>
  );
}

function nextAction(
  deal: Deal,
  role: "buyer" | "seller" | "admin",
  _adminApprovedRefund: boolean,
  _adminApprovedRelease: boolean,
  _deadlinePassed: boolean,
  isMilestone?: boolean,
  isAx?: boolean
) {
  if (role === "admin") {
    switch (deal.status) {
      case "awaiting_counterparty":
        return isAx
          ? "Waiting for the counterparty to accept this atomic exchange."
          : "Waiting for the counterparty to accept.";
      case "accepted":
      case "awaiting_payment":
        return isAx
          ? "Both parties must fund their leg before the atomic swap can complete."
          : isMilestone
            ? "Deal accepted. Waiting for milestone funding (buyer wallet)."
            : "Deal accepted. Waiting for payment (buyer wallet).";
      case "funded":
        return isAx
          ? "Both legs funded. Use Admin → Ax settle to Release or Cancel Ax as authority."
          : "Funds locked on-chain. Buyer/seller actions only; admin observes.";
      case "completed":
        return "This deal has been completed.";
      case "refunded":
        return "The deal has been refunded.";
      case "cancelled":
        return "This deal has been cancelled.";
      case "disputed":
        return "Dispute open — use admin dispute tools for on-chain resolve.";
      default:
        return "Admin observer view — no party wallet actions here.";
    }
  }

  switch (deal.status) {
    case "awaiting_counterparty":
      if (isAx) {
        return role === deal.initiated_by ||
          (deal.initiated_by === "buyer" && role === "buyer") ||
          (deal.initiated_by === "seller" && role === "seller")
          ? "Waiting for the counterparty to accept this atomic exchange (both legs shown above)."
          : "You are the counterparty on an atomic exchange. Review both legs, then accept or decline. After accept you fund your leg; they fund theirs.";
      }
      return role === "buyer"
        ? "Waiting for the seller to review the agreement."
        : "Review the agreement and accept or decline it.";

    case "accepted":
      if (deal.rail === "fiat") {
        return role === "buyer"
          ? "Deal accepted. Fiat checkout will be required here once enabled."
          : "Deal accepted. Waiting for the buyer to pay via fiat.";
      }

      return isMilestone
        ? "Deal accepted. Create and fund each milestone escrow."
        : "The deal has been accepted and is ready for payment.";

    case "awaiting_payment":
      if (deal.rail === "fiat") {
        return role === "buyer"
          ? "Fiat payment will be required here once checkout is enabled."
          : "Waiting for the buyer to pay via fiat checkout.";
      }

      return role === "buyer"
        ? isMilestone
          ? "Fund each milestone below. The deal stays in payment until all stages are funded."
          : isAx
            ? "Fund your leg (leg A). Counterparty funds leg B separately."
            : "Payment is now required."
        : isAx
          ? role === "seller"
            ? "Fund your leg (leg B). Initiator funds leg A separately."
            : "Waiting for both parties to fund their legs."
          : "Waiting for the buyer to fund the escrow(s).";

    case "funded":
      if (isAx) {
        return "Both legs are locked. The designated authority will Release (atomic swap) or Cancel Ax. Parties cannot release — open a dispute if something is wrong.";
      }
      return role === "buyer"
        ? isMilestone
          ? "Milestones are funded. Release or dispute each funded stage as delivery progresses."
          : "Payment is locked. You can release funds to the seller or open a dispute."
        : isMilestone
          ? "Funded milestones can be cancelled or disputed individually."
          : "Payment is locked. You can cancel the escrow or open a dispute.";

    case "completed":
      return "This deal has been completed.";

    case "refunded":
      return "The deal has been refunded.";

    case "cancelled":
      return "This deal has been cancelled.";

    case "disputed":
      return "This deal has a dispute. Use the room below to share evidence.";

    default:
      return "Review the deal details and wait for the next lifecycle action.";
  }
}
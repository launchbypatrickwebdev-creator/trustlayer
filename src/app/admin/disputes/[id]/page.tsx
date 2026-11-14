import TokenIcon from "@/components/TokenIcon";
import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import PageBackLink from "@/components/layout/PageBackLink";
import { notFound, redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/domain/admin";
import AdminResolveDispute from "@/components/admin/AdminResolveDispute";
import AdminExtendReviewDeadline from "@/components/admin/AdminExtendReviewDeadline";
import DisputeChat from "@/components/disputes/DisputeChat";
import DealAttachments from "@/components/deals/DealAttachments";
import LiveDealSync from "@/components/realtime/LiveDealSync";

interface Props {
  params: Promise<{ id: string }>;
}

type ChecklistValue = Record<string, unknown> | null;

export default async function AdminDisputeDetailPage({
  params,
}: Props) {
  const { id } = await params;

  try {
    const { admin } = await requireAdminUser();

    // ============================================================
    // Dispute
    // ============================================================

    const {
      data: dispute,
      error: disputeError,
    } = await admin
      .from("deal_disputes")
      .select(
        "id, deal_id, milestone_index, status, reason, opened_at, opened_by, resolved_at, resolved_by, resolution_notes"
      )
      .eq("id", id)
      .maybeSingle();

    if (disputeError || !dispute) {
      notFound();
    }

    // ============================================================
    // Deal / agreement
    // ============================================================

    const {
      data: deal,
      error: dealError,
    } = await admin
      .from("deals")
      .select(`
        id,
        deal_code,
        title,
        description,
        amount,
        currency,
        rail,
        asset_code,
        origin,
        initiated_by,
        buyer_id,
        seller_id,
        status,
        deadline,
        created_at,
        escrow_type,
        milestone_count,
        condition_type,
        serial_or_ref,
        delivery_method,
        creator_checklist,
        counterparty_checklist,
        creator_accepted_terms_at,
        counterparty_accepted_terms_at,
        counterparty_accepted_evidence_at,
        agreement_snapshot_hash,
        agreed_deadline,
        admin_review_deadline,
        settlement_adapter,
        chain
      `)
      .eq("id", dispute.deal_id)
      .maybeSingle();

    if (dealError || !deal) notFound();

    // ============================================================
    // Safe disputed milestone display
    // ============================================================

    const disputedMilestone = Number(
      dispute.milestone_index
    );

    // ============================================================
    // Agreed milestone structure
    //
    // This is the agreement definition.
    // It is intentionally separate from settlement state.
    // ============================================================

    const { data: milestones } = await admin
      .from("deal_milestones")
      .select(
        "id, milestone_index, amount, label"
      )
      .eq("deal_id", deal.id)
      .order("milestone_index", {
        ascending: true,
      });

    // ============================================================
    // On-chain settlements
    //
    // One-time escrow = milestone_index 0.
    // Milestone escrow = one settlement per milestone.
    // ============================================================

    const { data: settlements } = await admin
      .from("crypto_settlements")
      .select(
        "id, milestone_index, milestone_label, asset_code, network, amount_base_units, settlement_fee_amount, refund_fee_amount, cancellation_fee_amount, total_locked, funded, onchain_status, settlement_kind, escrow_pda, buyer_wallet, seller_wallet, initiator_wallet, chain_deal_id, last_tx_signature, last_verified_at, create_tx_signature, fund_tx_signature, release_tx_signature, cancel_tx_signature, refund_tx_signature"
      )
      .eq("deal_id", deal.id)
      .order("milestone_index", {
        ascending: true,
      });

    const primarySettlement =
      (settlements ?? []).find(
        (s: { milestone_index?: number }) =>
          Number(s.milestone_index) === Number(dispute.milestone_index)
      ) || (settlements ?? [])[0];
    const isAxSettlement =
      String(
        (primarySettlement as { settlement_kind?: string } | undefined)
          ?.settlement_kind || ""
      ).toLowerCase() === "ax" ||
      String(
        (deal as { settlement_adapter?: string }).settlement_adapter || ""
      ) === "solana_ax";

    return (
      <AdminShell active="disputes">
      <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
        <PageBackLink href="/admin/disputes" label="Back to dispute queue" />
        <div className="mx-auto max-w-6xl">
          <LiveDealSync dealId={deal.id} />

          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-sm text-gray-500">
                {deal.deal_code}
              </p>

              <h1 className="mt-1 text-3xl font-bold">
                {deal.title}
              </h1>
            </div>

            <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900">
              {dispute.status}
            </span>
          </div>

          {/* ======================================================
              DEAL / AGREEMENT
              ====================================================== */}

          <section className="mt-8 rounded-2xl border border-[var(--tl-line)] bg-[#071a2d] p-6 shadow-sm">
            <h2 className="font-semibold">
              Deal & agreement
            </h2>

            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <Row
                label="Amount"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    {deal.amount}
                    <TokenIcon code={deal.asset_code || deal.currency} size={14} />
                    {deal.asset_code || deal.currency}
                  </span>
                }
              />

              <Row
                label="Rail"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    {deal.rail}
                    {deal.asset_code ? (
                      <>
                        {" · "}
                        <TokenIcon code={deal.asset_code} size={14} />
                        {deal.asset_code}
                      </>
                    ) : null}
                  </span>
                }
              />

              <Row
                label="Status"
                value={deal.status}
              />

              <Row
                label="Disputed milestone"
                value={
                  Number.isFinite(disputedMilestone)
                    ? String(disputedMilestone + 1)
                    : "—"
                }
              />

              <Row
                label="Origin"
                value={String(deal.origin)}
              />

              <Row
                label="Initiated by"
                value={String(deal.initiated_by)}
              />

              <Row
                label="Escrow type"
                value={String(
                  deal.escrow_type || "one_time"
                )}
              />

              <Row
                label="Milestone count"
                value={String(
                  deal.milestone_count ?? "—"
                )}
              />

              <Row
                label="Deadline"
                value={
                  deal.deadline
                    ? new Date(
                        deal.deadline
                      ).toLocaleString()
                    : "Not set"
                }
              />

              <Row
                label="Agreed trade deadline"
                value={
                  deal.agreed_deadline
                    ? new Date(
                        deal.agreed_deadline
                      ).toLocaleString()
                    : "—"
                }
              />

              <Row
                label="Admin review deadline"
                value={
                  deal.admin_review_deadline
                    ? new Date(
                        deal.admin_review_deadline
                      ).toLocaleString()
                    : "—"
                }
              />

              <Row
                label="Buyer"
                value={deal.buyer_id ?? "—"}
              />

              <Row
                label="Seller"
                value={deal.seller_id ?? "—"}
              />

              <Row
                label="Condition"
                value={
                  deal.condition_type || "—"
                }
              />

              <Row
                label="Delivery method"
                value={
                  deal.delivery_method || "—"
                }
              />

              <Row
                label="Serial / reference"
                value={
                  deal.serial_or_ref || "—"
                }
              />

              <Row
                label="Creator terms accepted"
                value={
                  deal.creator_accepted_terms_at
                    ? new Date(
                        deal.creator_accepted_terms_at
                      ).toLocaleString()
                    : "—"
                }
              />

              <Row
                label="Counterparty terms accepted"
                value={
                  deal.counterparty_accepted_terms_at
                    ? new Date(
                        deal.counterparty_accepted_terms_at
                      ).toLocaleString()
                    : "—"
                }
              />

              <Row
                label="Counterparty evidence accepted"
                value={
                  deal.counterparty_accepted_evidence_at
                    ? new Date(
                        deal.counterparty_accepted_evidence_at
                      ).toLocaleString()
                    : "—"
                }
              />

              <Row
                label="Agreement snapshot"
                value={
                  deal.agreement_snapshot_hash ||
                  "—"
                }
              />
            </dl>

            {deal.description && (
              <div className="mt-6">
                <h3 className="font-medium">
                  Description
                </h3>

                <p className="mt-3 whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
                  {deal.description}
                </p>
              </div>
            )}

            <DealAttachments dealId={deal.id} />

            {/* ==================================================
                AGREEMENT CHECKLISTS
                ================================================== */}

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Checklist
                title="Creator checklist"
                value={
                  deal.creator_checklist as ChecklistValue
                }
              />

              <Checklist
                title="Counterparty checklist"
                value={
                  deal.counterparty_checklist as ChecklistValue
                }
              />
            </div>
          </section>

          {/* ======================================================
              ADMIN REVIEW WINDOW
              ====================================================== */}

          <AdminExtendReviewDeadline
            disputeId={dispute.id}
            currentDeadline={deal.admin_review_deadline}
            disabled={dispute.status !== "open"}
          />

          {/* ======================================================
              DISPUTE
              ====================================================== */}

          <section className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-6">
            <h2 className="font-semibold text-amber-950">
              Dispute
            </h2>

            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Row
                label="Disputed milestone"
                value={
                  Number.isFinite(
                    disputedMilestone
                  )
                    ? String(
                        disputedMilestone + 1
                      )
                    : "—"
                }
              />

              <Row
                label="Opened"
                value={
                  dispute.opened_at
                    ? new Date(
                        dispute.opened_at
                      ).toLocaleString()
                    : "—"
                }
              />

              <Row
                label="Opened by"
                value={String(
                  dispute.opened_by ?? "—"
                )}
              />

              <Row
                label="Resolved"
                value={
                  dispute.resolved_at
                    ? new Date(
                        dispute.resolved_at
                      ).toLocaleString()
                    : "—"
                }
              />

              <Row
                label="Resolved by"
                value={String(
                  dispute.resolved_by ?? "—"
                )}
              />
            </dl>

            {dispute.reason && (
              <p className="mt-5 whitespace-pre-wrap text-sm text-amber-900">
                {dispute.reason}
              </p>
            )}

            {dispute.resolution_notes && (
              <p className="mt-4 whitespace-pre-wrap rounded-lg bg-[#071a2d]/70 p-4 text-sm text-amber-950">
                <span className="font-medium">
                  Resolution notes:
                </span>{" "}
                {dispute.resolution_notes}
              </p>
            )}
          </section>

          {/* ======================================================
              AGREED MILESTONES
              ====================================================== */}

          {(milestones?.length ?? 0) > 0 && (
            <section className="mt-6 rounded-2xl border border-[var(--tl-line)] bg-[#071a2d] p-6 shadow-sm">
              <h2 className="font-semibold">
                Agreed milestones
              </h2>

              <p className="mt-1 text-xs text-gray-500">
                These rows represent the immutable agreement
                structure, not current custody state.
              </p>

              <div className="mt-5 space-y-3">
                {milestones!.map((milestone) => {
                  const index = Number(
                    milestone.milestone_index
                  );

                  const settlement =
                    settlements?.find(
                      (row) =>
                        Number(
                          row.milestone_index
                        ) === index
                    );

                  return (
                    <div
                      key={milestone.id}
                      className="rounded-lg border bg-gray-50 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">
                            {milestone.label ||
                              `Milestone ${
                                index + 1
                              }`}
                          </p>

                          <p className="mt-1 text-sm text-gray-600">
                            Agreed amount:{" "}
                            <span className="inline-flex items-center gap-1 font-medium">
                              {milestone.amount}
                              <TokenIcon code={deal.asset_code || deal.currency} size={14} />
                              {deal.asset_code || deal.currency}
                            </span>
                          </p>
                        </div>

                        <span className="rounded-full bg-[#071a2d] px-2 py-1 text-xs">
                          #{index + 1}
                        </span>
                      </div>

                      <div className="mt-3 text-xs text-gray-500">
                        Settlement state:{" "}
                        <span className="font-medium text-gray-700">
                          {settlement?.onchain_status ||
                            "not created"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ======================================================
              ON-CHAIN SETTLEMENTS
              ====================================================== */}

          {(settlements?.length ?? 0) > 0 && (
            <section className="mt-6 rounded-2xl border border-[var(--tl-line)] bg-[#071a2d] p-6 shadow-sm">
              <h2 className="font-semibold">
                On-chain settlement(s)
              </h2>

              <p className="mt-1 text-xs text-gray-500">
                Each milestone settlement has its own escrow
                PDA and independent on-chain state.
              </p>

              <div className="mt-5 space-y-4">
                {settlements!.map((s) => {
                  const index = Number(
                    s.milestone_index ?? 0
                  );

                  return (
                    <div
                      key={s.id}
                      className="rounded-lg border border-gray-100 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">
                            {s.milestone_label ||
                              `Milestone ${
                                index + 1
                              }`}
                          </p>

                          <p className="mt-1 text-xs text-gray-500">
                            #{index + 1}
                          </p>
                        </div>

                        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium">
                          {String(
                            s.onchain_status ?? "—"
                          )}
                        </span>
                      </div>

                      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                        <Row
                          label="Network"
                          value={String(
                            s.network ?? "—"
                          )}
                        />

                        <Row
                          label="Asset"
                          value={String(
                            s.asset_code ?? "—"
                          )}
                        />

                        <Row
                          label="Chain deal ID"
                          value={String(
                            s.chain_deal_id ?? "—"
                          )}
                        />

                        <Row
                          label="On-chain status"
                          value={String(
                            s.onchain_status ?? "—"
                          )}
                        />

                        <Row
                          label="Funded"
                          value={String(
                            s.funded
                          )}
                        />

                        <Row
                          label="Principal"
                          value={String(
                            s.amount_base_units ??
                              "—"
                          )}
                        />

                        <Row
                          label="Settlement fee"
                          value={String(
                            s.settlement_fee_amount ??
                              "0"
                          )}
                        />

                        <Row
                          label="Cancellation fee"
                          value={String(
                            s.cancellation_fee_amount ??
                              "0"
                          )}
                        />

                        <Row
                          label="Refund fee"
                          value={String(
                            s.refund_fee_amount ??
                              "0"
                          )}
                        />

                        <Row
                          label="Total locked"
                          value={String(
                            s.total_locked ?? "—"
                          )}
                        />

                        <Row
                          label="Escrow PDA"
                          value={
                            s.escrow_pda ?? "—"
                          }
                        />

                        <Row
                          label="Last transaction"
                          value={
                            s.last_tx_signature ??
                            "—"
                          }
                        />

                        <Row
                          label="Last verified"
                          value={
                            s.last_verified_at
                              ? new Date(
                                  s.last_verified_at
                                ).toLocaleString()
                              : "—"
                          }
                        />
                      </dl>

                      {/* Transaction signatures */}
                      {[
                        s.create_tx_signature,
                        s.fund_tx_signature,
                        s.release_tx_signature,
                        s.cancel_tx_signature,
                        s.refund_tx_signature,
                      ].filter(Boolean).length >
                        0 && (
                        <div className="mt-4 border-t pt-4">
                          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                            On-chain transactions
                          </p>

                          <div className="mt-2 space-y-1 text-xs">
                            {[
                              [
                                "Create",
                                s.create_tx_signature,
                              ],
                              [
                                "Fund",
                                s.fund_tx_signature,
                              ],
                              [
                                "Release",
                                s.release_tx_signature,
                              ],
                              [
                                "Cancel",
                                s.cancel_tx_signature,
                              ],
                              [
                                "Admin refund",
                                s.refund_tx_signature,
                              ],
                            ]
                              .filter(
                                ([, signature]) =>
                                  Boolean(signature)
                              )
                              .map(
                                ([
                                  label,
                                  signature,
                                ]) => (
                                  <a
                                    key={`${label}-${signature}`}
                                    href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block break-all text-blue-600 underline"
                                  >
                                    {label}:{" "}
                                    {String(
                                      signature
                                    ).slice(0, 32)}
                                    …
                                  </a>
                                )
                              )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ======================================================
              DISPUTE CHAT
              ====================================================== */}

          <DisputeChat
            disputeId={dispute.id}
            canPost={dispute.status === "open"}
            viewerRole="admin"
          />

          {/* ======================================================
              ON-CHAIN ADMIN RESOLUTION
              ====================================================== */}

          <AdminResolveDispute
            disputeId={dispute.id}
            status={dispute.status}
            settlementKind={isAxSettlement ? "ax" : "one_leg"}
            canResolve={
              dispute.status === "open" &&
              (deal.status === "disputed" || isAxSettlement)
            }
          />
        </div>
      </main>
      </AdminShell>
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Authentication required."
    ) {
      redirect("/login");
    }

    if (
      error instanceof Error &&
      error.message === "Admin access required."
    ) {
      redirect("/dashboard");
    }

    throw error;
  }
}

function Checklist({
  title,
  value,
}: {
  title: string;
  value: ChecklistValue;
}) {
  return (
    <div className="rounded-lg border p-4">
      <h3 className="font-medium">{title}</h3>

      <div className="mt-3 space-y-2 text-sm">
        {Object.entries(value ?? {}).map(
          ([key, checked]) => (
            <div
              key={key}
              className="flex items-center justify-between gap-4"
            >
              <span>
                {formatChecklistLabel(key)}
              </span>

              <span
                className={
                  checked === true
                    ? "font-medium text-green-700"
                    : "text-gray-500"
                }
              >
                {checked === true ? "✓" : "—"}
              </span>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function formatChecklistLabel(
  value: string
) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (character) =>
      character.toUpperCase()
    );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500">
        {label}
      </dt>

      <dd className="mt-1 break-all text-sm font-medium">
        {value}
      </dd>
    </div>
  );
}
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Ban,
  CheckCircle2,
  Layers3,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import DraftDealActions from "@/components/deals/DraftDealActions";
import TokenIcon from "@/components/TokenIcon";
import {
  formatAxAmountPair,
  formatAxAssetPair,
  isAxDealRow,
} from "@/lib/domain/deal-display";
import type { LegLike } from "@/lib/domain/deal-display";

export type DealRow = {
  id: string;
  deal_code: string;
  title: string;
  amount: string;
  currency: string;
  asset_code: string | null;
  rail: string;
  status: string;
  created_at: string;
  updated_at: string;
  settlement_adapter?: string | null;
  legs?: LegLike[];
};

type Tab = "all" | "active" | "completed" | "cancelled";

const TERMINAL = ["completed", "cancelled", "refunded", "declined", "expired"];
const COMPLETED = ["completed", "refunded"];
const CANCELLED = ["cancelled", "declined", "expired"];

function isActive(status: string) {
  return !TERMINAL.includes(status);
}

function statusChip(status: string) {
  const s = status.toLowerCase();
  if (["funded", "completed", "accepted"].includes(s)) {
    return "border-[var(--tl-emerald)]/30 bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]";
  }
  if (["disputed", "refund_pending"].includes(s)) {
    return "border-[var(--tl-warn)]/30 bg-[var(--tl-warning-soft)] text-[var(--tl-warn)]";
  }
  if (CANCELLED.includes(s) || s === "refunded") {
    return "border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] text-[var(--tl-muted)]";
  }
  return "border-[var(--tl-info)]/25 bg-[var(--tl-info-soft)] text-[var(--tl-info)]";
}

function statusLabel(status: string) {
  if (status === "awaiting_counterparty") return "Agreement";
  if (status === "awaiting_payment") return "Awaiting payment";
  if (status === "awaiting_delivery") return "Delivery";
  return status.replaceAll("_", " ");
}

function isAx(deal: DealRow) {
  return isAxDealRow({
    settlement_adapter: deal.settlement_adapter,
    legs: deal.legs,
  });
}

function assetLabel(deal: DealRow) {
  if (isAx(deal) && (deal.legs?.length ?? 0) >= 2) {
    return formatAxAssetPair(deal.legs!);
  }
  return (deal.asset_code || deal.currency || "—").toUpperCase();
}

function amountLabel(deal: DealRow) {
  if (isAx(deal) && (deal.legs?.length ?? 0) >= 2) {
    return formatAxAmountPair(deal.legs!);
  }
  const unit = deal.asset_code || deal.currency || "";
  return `${deal.amount} ${unit}`.trim();
}

export default function DealsWorkspace({ deals }: { deals: DealRow[] }) {
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const active = deals.filter((d) => isActive(d.status)).length;
    const completed = deals.filter((d) => COMPLETED.includes(d.status)).length;
    const cancelled = deals.filter((d) => CANCELLED.includes(d.status)).length;
    return { all: deals.length, active, completed, cancelled };
  }, [deals]);

  const filtered = useMemo(() => {
    let list = deals;
    if (tab === "active") list = list.filter((d) => isActive(d.status));
    if (tab === "completed") list = list.filter((d) => COMPLETED.includes(d.status));
    if (tab === "cancelled") list = list.filter((d) => CANCELLED.includes(d.status));

    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((d) => {
      const hay = [
        d.deal_code,
        d.title,
        d.status,
        d.asset_code,
        d.currency,
        d.amount,
        d.rail,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [deals, tab, q]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: "All deals" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Completed" },
    { key: "cancelled", label: "Cancelled" },
  ];

  return (
    <main className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[var(--tl-ink)] sm:text-4xl">
            Deals
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--tl-muted)]">
            Manage your deals, track progress, and take action when needed.
          </p>
        </div>
      </div>

      {/* Metrics */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="All deals"
          value={counts.all}
          detail="Total deals created"
          icon={<Layers3 size={18} />}
        />
        <Metric
          label="Active"
          value={counts.active}
          detail="In progress"
          icon={<span className="h-2.5 w-2.5 rounded-full bg-[var(--tl-emerald)]" />}
        />
        <Metric
          label="Completed"
          value={counts.completed}
          detail="Settled"
          icon={<CheckCircle2 size={18} />}
        />
        <Metric
          label="Cancelled"
          value={counts.cancelled}
          detail="Cancelled"
          icon={<Ban size={18} />}
        />
      </div>

      {/* Tabs + search */}
      <div className="mt-6 flex flex-col gap-3 border-b border-[var(--tl-line)] pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1">
          {tabs.map((t) => {
            const on = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  on
                    ? "bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)] ring-1 ring-[var(--tl-emerald)]/25"
                    : "text-[var(--tl-muted)] hover:bg-[var(--tl-bg-elevated)] hover:text-[var(--tl-ink)]"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="relative w-full max-w-xs">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tl-muted)]"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search deals…"
            className="w-full rounded-xl border border-[var(--tl-line)] bg-[var(--tl-card)] py-2.5 pl-9 pr-3 text-sm text-[var(--tl-ink)] outline-none placeholder:text-[var(--tl-muted)] focus:border-[var(--tl-emerald)]/40"
          />
        </div>
      </div>

      {/* Table */}
      <section className="mt-4 overflow-hidden rounded-[20px] border border-[var(--tl-line)] bg-[var(--tl-card)]">
        {filtered.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] text-[var(--tl-emerald)]">
              <Layers3 size={24} />
            </div>
            <h2 className="mt-4 text-lg font-bold text-[var(--tl-ink)]">
              {deals.length === 0 ? "No deals yet" : "No matches"}
            </h2>
            <p className="mt-2 max-w-md text-sm text-[var(--tl-muted)]">
              {deals.length === 0
                ? "Create a deal to record terms and give both sides a clear path from agreement to outcome."
                : "Try another tab or clear the search."}
            </p>
            {deals.length === 0 && (
              <Link
                href="/deals/new"
                className="tl-button tl-button-success mt-5 no-underline"
              >
                <Plus size={16} /> New deal
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--tl-line)] text-[10px] font-bold uppercase tracking-wider text-[var(--tl-muted)]">
                  <th className="px-5 py-3.5 font-bold">Deal ID</th>
                  <th className="px-3 py-3.5 font-bold">Asset</th>
                  <th className="px-3 py-3.5 font-bold">Amount</th>
                  <th className="px-3 py-3.5 font-bold">Status</th>
                  <th className="px-3 py-3.5 font-bold">Created</th>
                  <th className="px-5 py-3.5 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((deal) => (
                  <tr
                    key={deal.id}
                    className="border-b border-[var(--tl-line)]/70 transition hover:bg-white/[.02] last:border-b-0"
                  >
                    <td className="px-5 py-4">
                      <Link
                        href={`/deals/${deal.id}`}
                        className="group block no-underline"
                      >
                        <p className="font-mono text-xs font-semibold text-[var(--tl-ink)] group-hover:text-[var(--tl-emerald)]">
                          {deal.deal_code}
                          {isAx(deal) && (
                            <span className="ml-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan-300">
                              Ax
                            </span>
                          )}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--tl-muted)]">
                          <TokenIcon
                            code={deal.rail === "fiat" ? "FIAT" : "SOL"}
                            size={14}
                          />
                          {deal.rail === "fiat" ? "Fiat" : "Solana"}
                          {deal.title ? ` · ${deal.title}` : ""}
                        </p>
                      </Link>
                    </td>
                    <td className="px-3 py-4">
                      <span className="inline-flex flex-wrap items-center gap-1.5 text-sm font-semibold text-[var(--tl-ink)]">
                        {isAx(deal) && (deal.legs?.length ?? 0) >= 2 ? (
                          <>
                            {[...(deal.legs || [])]
                              .sort(
                                (a, b) =>
                                  Number(a.leg_index ?? 0) -
                                  Number(b.leg_index ?? 0)
                              )
                              .slice(0, 2)
                              .map((leg, i) => (
                                <span
                                  key={`${leg.leg_index}-${leg.asset_code}`}
                                  className="inline-flex items-center gap-1"
                                >
                                  {i > 0 && (
                                    <span className="text-[var(--tl-muted)]">
                                      ↔
                                    </span>
                                  )}
                                  <TokenIcon
                                    code={String(leg.asset_code || "SOL")}
                                    size={18}
                                  />
                                </span>
                              ))}
                          </>
                        ) : (
                          <TokenIcon
                            code={deal.asset_code || deal.currency}
                            size={18}
                          />
                        )}
                        {assetLabel(deal)}
                      </span>
                    </td>
                    <td className="px-3 py-4 text-sm font-medium text-[var(--tl-ink)]">
                      <span className="text-[var(--tl-ink)]">{amountLabel(deal)}</span>
                    </td>
                    <td className="px-3 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold capitalize ${statusChip(
                          deal.status
                        )}`}
                      >
                        {statusLabel(deal.status)}
                      </span>
                    </td>
                    <td className="px-3 py-4 text-xs text-[var(--tl-muted)]">
                      {new Date(deal.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col items-end gap-2">
                        <Link
                          href={`/deals/${deal.id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] px-3 py-1.5 text-xs font-bold text-[var(--tl-ink)] no-underline transition hover:border-[var(--tl-emerald)]/40 hover:text-[var(--tl-emerald)]"
                        >
                          View <ArrowRight size={13} />
                        </Link>
                        <DraftDealActions
                          dealId={deal.id}
                          status={deal.status}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Bottom CTA */}
      <div className="mt-5 flex flex-col items-start justify-between gap-4 rounded-[20px] border border-[var(--tl-emerald)]/20 bg-gradient-to-r from-[var(--tl-emerald-soft)] via-[var(--tl-card)] to-[var(--tl-bg-elevated)] p-5 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--tl-emerald)]/25 bg-[var(--tl-bg-elevated)] text-[var(--tl-emerald)]">
            <ShieldCheck size={18} />
          </span>
          <div>
            <p className="font-bold text-[var(--tl-ink)]">Create your next deal</p>
            <p className="mt-1 text-xs text-[var(--tl-muted)]">
              Set terms, add milestones, and get started in minutes.
            </p>
          </div>
        </div>
        <Link
          href="/deals/new"
          className="tl-button tl-button-success shrink-0 no-underline"
        >
          <Plus size={16} /> New deal
        </Link>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: number;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-[18px] border border-[var(--tl-line)] bg-[var(--tl-card)] p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--tl-muted)]">{label}</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] text-[var(--tl-emerald)]">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-black text-[var(--tl-ink)]">{value}</p>
      <p className="mt-1 text-[10px] text-[var(--tl-muted)]">{detail}</p>
    </div>
  );
}
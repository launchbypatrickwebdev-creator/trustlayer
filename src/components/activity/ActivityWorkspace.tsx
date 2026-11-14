"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Gavel,
  Layers3,
  LockKeyhole,
  Shield,
  Sparkles,
  WalletCards,
} from "lucide-react";

export type ActivityEvent = {
  id: string;
  deal_id: string;
  deal_code: string;
  deal_title: string | null;
  event_type: string;
  actor_type: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type Tab = "all" | "deals" | "settlement" | "security" | "system";

function category(eventType: string): Tab {
  const t = eventType.toLowerCase();
  if (
    t.includes("fund") ||
    t.includes("release") ||
    t.includes("cancel") ||
    t.includes("session") ||
    t.includes("onchain") ||
    t.includes("settlement") ||
    t.includes("refund")
  ) {
    return "settlement";
  }
  if (
    t.includes("dispute") ||
    t.includes("admin") ||
    t.includes("reconcile") ||
    t.includes("security")
  ) {
    return "security";
  }
  if (
    t.includes("invite") ||
    t.includes("agreement") ||
    t.includes("deal_") ||
    t.includes("milestone") ||
    t.includes("created") ||
    t.includes("accepted") ||
    t.includes("declined") ||
    t.includes("finalize")
  ) {
    return "deals";
  }
  return "system";
}

function titleize(eventType: string) {
  return eventType
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function subtitle(eventType: string, actor: string) {
  const t = eventType.toLowerCase();
  if (t.includes("admin") && t.includes("refund")) return "Refund processed by admin";
  if (t.includes("admin") && t.includes("release")) return "Release processed by admin";
  if (t.includes("dispute")) return "Dispute raised by counterparty";
  if (t.includes("cancel") && t.includes("verif")) return "Cancellation verified on-chain";
  if (t.includes("release") && t.includes("verif")) return "Release verified on-chain";
  if (t.includes("fund") && t.includes("verif")) return "Funding verified on-chain";
  if (t.includes("session")) return "On-chain session created";
  if (actor === "admin") return "Recorded by admin";
  return "Recorded by user";
}

function EventIcon({ eventType }: { eventType: string }) {
  const t = eventType.toLowerCase();
  const cls =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--tl-emerald)]/30 bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]";
  if (t.includes("dispute") || t.includes("admin"))
    return (
      <span className={cls}>
        <Gavel size={16} />
      </span>
    );
  if (t.includes("fund") || t.includes("release") || t.includes("cancel"))
    return (
      <span className={cls}>
        <WalletCards size={16} />
      </span>
    );
  if (t.includes("session") || t.includes("security"))
    return (
      <span className={cls}>
        <LockKeyhole size={16} />
      </span>
    );
  if (t.includes("deal") || t.includes("invite") || t.includes("agreement"))
    return (
      <span className={cls}>
        <Layers3 size={16} />
      </span>
    );
  return (
    <span className={cls}>
      <Shield size={16} />
    </span>
  );
}

export default function ActivityWorkspace({
  events,
}: {
  events: ActivityEvent[];
}) {
  const [tab, setTab] = useState<Tab>("all");

  const filtered = useMemo(() => {
    if (tab === "all") return events;
    return events.filter((e) => category(e.event_type) === tab);
  }, [events, tab]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "deals", label: "Deals" },
    { key: "settlement", label: "Settlement" },
    { key: "security", label: "Security" },
    { key: "system", label: "System" },
  ];

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-7 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-[var(--tl-ink)]">
          Activity
        </h1>
        <p className="mt-2 text-sm text-[var(--tl-muted)]">
          Track on-chain events and deal updates.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-1 border-b border-[var(--tl-line)] pb-3">
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

      <section className="mt-4 overflow-hidden rounded-[20px] border border-[var(--tl-line)] bg-[var(--tl-card)]">
        {filtered.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center px-6 py-12 text-center">
            <Sparkles className="text-[var(--tl-emerald)]" size={28} />
            <p className="mt-4 font-bold text-[var(--tl-ink)]">No events yet</p>
            <p className="mt-2 text-sm text-[var(--tl-muted)]">
              Activity appears as you create, fund, release, and resolve deals.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--tl-line)]/80">
            {filtered.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/deals/${e.deal_id}`}
                  className="flex items-center gap-4 px-4 py-4 no-underline transition hover:bg-white/[.02] sm:px-5"
                >
                  <EventIcon eventType={e.event_type} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[var(--tl-ink)]">
                      {titleize(e.event_type)}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--tl-muted)]">
                      {subtitle(e.event_type, e.actor_type)}
                    </p>
                    <p className="mt-1 text-[10px] text-[var(--tl-muted)]">
                      {new Date(e.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="hidden font-mono text-[11px] font-semibold text-[var(--tl-muted)] sm:inline">
                      {e.deal_code}
                    </span>
                    <ArrowRight size={16} className="text-[var(--tl-muted)]" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
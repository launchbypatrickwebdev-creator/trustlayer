import Image from "next/image";
import TokenIcon from "@/components/TokenIcon";
import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowRight,
  CircleAlert,
  Clock3,
  FileText,
  Headphones,
  Layers3,
  ShieldCheck,
  WalletCards,
  Zap,
  Gavel,
  Banknote,
  XCircle,
  CheckCircle2,
  Lock,
  UserRound,
  Plus,
} from "lucide-react";
import { listMyDeals } from "@/lib/domain/deals";
import { getFinancialEligibility } from "@/lib/domain/financial-eligibility";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import AuthenticatedShell from "@/components/layout/AuthenticatedShell";
import ClaimInviteOnAuth from "@/components/auth/ClaimInviteOnAuth";
import ClaimBotOnAuth from "@/components/auth/ClaimBotOnAuth";
import ClaimPartnerOnAuth from "@/components/auth/ClaimPartnerOnAuth";

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function statusClass(status: string) {
  if (["funded", "completed", "accepted"].includes(status)) {
    return "bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]";
  }
  if (["disputed", "refund_pending"].includes(status)) {
    return "bg-[var(--tl-warning-soft)] text-[var(--tl-warn)]";
  }
  if (["cancelled", "declined", "expired", "refunded"].includes(status)) {
    return "bg-white/5 text-[var(--tl-muted)]";
  }
  return "bg-[var(--tl-info-soft)] text-[var(--tl-info)]";
}

const TERMINAL = [
  "completed",
  "cancelled",
  "refunded",
  "declined",
  "expired",
] as const;

const ACTIONABLE = [
  "awaiting_counterparty",
  "awaiting_payment",
  "awaiting_delivery",
  "disputed",
  "draft",
] as const;

/** Side avatars — same family as Activity page */
function eventAvatar(type: string) {
  const t = type.toLowerCase();
  if (t.includes("dispute")) {
    return {
      icon: <Gavel size={15} />,
      className:
        "border-[var(--tl-warn)]/35 bg-[var(--tl-warning-soft)] text-[var(--tl-warn)]",
      blurb: "Dispute raised by counterparty",
    };
  }
  if (t.includes("refund")) {
    return {
      icon: <Banknote size={15} />,
      className:
        "border-[var(--tl-emerald)]/35 bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]",
      blurb: "Refund processed",
    };
  }
  if (t.includes("cancel")) {
    return {
      icon: <XCircle size={15} />,
      className: "border-[var(--tl-line)] bg-white/5 text-[var(--tl-muted)]",
      blurb: "Cancellation verified on-chain",
    };
  }
  if (t.includes("release")) {
    return {
      icon: <CheckCircle2 size={15} />,
      className:
        "border-[var(--tl-emerald)]/35 bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]",
      blurb: "Release verified on-chain",
    };
  }
  if (t.includes("fund")) {
    return {
      icon: <WalletCards size={15} />,
      className:
        "border-[var(--tl-emerald)]/35 bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]",
      blurb: "Funding verified on-chain",
    };
  }
  if (t.includes("session") || t.includes("action")) {
    return {
      icon: <Lock size={15} />,
      className:
        "border-[var(--tl-emerald)]/35 bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]",
      blurb: "On-chain session created",
    };
  }
  if (t.includes("admin")) {
    return {
      icon: <Gavel size={15} />,
      className:
        "border-[var(--tl-emerald)]/35 bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]",
      blurb: "Admin action on settlement",
    };
  }
  return {
    icon: <FileText size={15} />,
    className:
      "border-[var(--tl-emerald)]/35 bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]",
    blurb: "Deal event",
  };
}

function humanEvent(type: string) {
  return type
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const welcomeName =
    (profile?.display_name || "").trim() ||
    (profile?.username || "").trim() ||
    (user.email || "").split("@")[0] ||
    "there";

  const displayName =
    welcomeName.charAt(0).toUpperCase() + welcomeName.slice(1);

  const hour = new Date().getUTCHours();
  let greetingTitle: string;
  let greetingEmoji: string;
  let tagline: string;
  let subline: string;

  if (hour >= 5 && hour < 12) {
    greetingTitle = `Good morning, ${displayName}`;
    greetingEmoji = "🌅";
    tagline =
      "Start the day with clear terms. Settlement when both sides are ready.";
    subline =
      "Here's what's happening with your deals, actions, and recent activity.";
  } else if (hour >= 12 && hour < 17) {
    greetingTitle = `Good afternoon, ${displayName}`;
    greetingEmoji = "🤝";
    tagline = "Agreements first, settlement when you're ready.";
    subline =
      "Here's what's happening with your deals, actions, and recent activity.";
  } else if (hour >= 17 && hour < 22) {
    greetingTitle = `Good evening, ${displayName}`;
    greetingEmoji = "⏳";
    tagline = "Review what's moving. Release when the outcome is clear.";
    subline =
      "Here's what's happening with your deals, actions, and recent activity.";
  } else {
    greetingTitle = `Welcome, ${displayName}`;
    greetingEmoji = "🛡️";
    tagline = "Quiet hours. Your deals stay on-chain and in your control.";
    subline =
      "Here's what's happening with your deals, actions, and recent activity.";
  }

  const deals = await listMyDeals();
  const ngnEligibility = await getFinancialEligibility("NGN", "fiat", user.id);
  const active = deals.filter(
    (d) => !TERMINAL.includes(d.status as (typeof TERMINAL)[number])
  );
  const actionRequired = deals.filter((d) =>
    ACTIONABLE.includes(d.status as (typeof ACTIONABLE)[number])
  );

  const dealIds = deals.map((d) => d.id);
  const dealCodeById = new Map(
    deals.map((d) => [d.id, d.deal_code || d.id.slice(0, 8)])
  );

  const { data: events } =
    dealIds.length > 0
      ? await supabase
          .from("deal_events")
          .select("id, deal_id, event_type, actor_type, metadata, created_at")
          .in("deal_id", dealIds)
          .order("created_at", { ascending: false })
          .limit(8)
      : {
          data: [] as Array<{
            id: number;
            deal_id: string;
            event_type: string;
            actor_type: string;
            metadata: unknown;
            created_at: string;
          }>,
        };

  const recent = events ?? [];
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet";
  const solanaLive =
    cluster === "mainnet-beta" || cluster === "mainnet"
      ? "Solana mainnet"
      : "Solana Devnet";

  return (
    <AuthenticatedShell>
      <Suspense fallback={null}>
        <ClaimInviteOnAuth isAuthenticated={true} />
      </Suspense>
      <Suspense fallback={null}>
        <ClaimBotOnAuth isAuthenticated={true} />
        <ClaimPartnerOnAuth isAuthenticated={true} />
      </Suspense>

      <main className="mx-auto max-w-[1200px] px-4 py-7 sm:px-6 lg:px-8">
        <section className="relative isolate overflow-hidden rounded-[24px] border border-[var(--tl-line)] bg-[var(--tl-card)] p-6 sm:p-8">
          {/* soft glow behind the art */}
          <div
            className="pointer-events-none absolute -right-16 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full opacity-30 blur-3xl"
            style={{
              background:
                "radial-gradient(circle, rgba(16,185,129,0.45) 0%, rgba(212,175,55,0.12) 45%, transparent 70%)",
            }}
          />
          {/* subtle diagonal lines */}
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-[55%] opacity-[0.14]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(115deg, transparent 0, transparent 18px, rgba(16,185,129,0.35) 18px, rgba(16,185,129,0.35) 19px)",
              maskImage:
                "linear-gradient(90deg, transparent 0%, black 40%, black 100%)",
              WebkitMaskImage:
                "linear-gradient(90deg, transparent 0%, black 40%, black 100%)",
            }}
          />

          {/* Integrated hero artwork */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 hidden w-[48%] items-center justify-center sm:flex"
          >
            {/* Ambient emerald and gold lighting */}
            <div
              className="absolute right-[8%] top-1/2 h-64 w-64 -translate-y-1/2 rounded-full blur-3xl"
              style={{
                background:
                  "radial-gradient(circle, rgba(16,185,129,0.16) 0%, rgba(212,175,55,0.08) 42%, transparent 72%)",
              }}
            />

            <Image
              src="/dashboard-hero.png"
              alt=""
              width={640}
              height={360}
              priority
              className="
                relative z-10
                h-auto w-[300px]
                object-contain
                opacity-90
                mix-blend-screen
                md:w-[360px]
                lg:w-[440px]
                xl:w-[480px]
              "
              style={{
                maskImage:
                  "linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)",
              }}
            />
          </div>

          <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[var(--tl-emerald)]">
            Overview
          </p>
          <h1 className="mt-2 max-w-2xl text-3xl font-black tracking-tight text-[var(--tl-ink)] sm:text-4xl">
            {greetingTitle}{" "}
            <span className="inline-block" aria-hidden>
              {greetingEmoji}
            </span>
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--tl-muted)]">
            {tagline}
          </p>
          <p className="mt-1 max-w-xl text-sm text-[var(--tl-muted)]">
            {subline}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/deals/new"
              className="tl-button tl-button-success no-underline"
            >
              + Create a deal <ArrowRight size={15} />
            </Link>
            <Link
              href="/deals"
              className="tl-button tl-button-secondary no-underline"
            >
              Explore your deals
            </Link>
          </div>
        </section>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <MetricCard
            href="/deals"
            label="Active deals"
            value={active.length}
            note={
              active.length === 0
                ? "No active deals at the moment"
                : "Non-terminal agreements"
            }
            icon={<FileText size={18} />}
            tone="emerald"
          />
          <MetricCard
            href="/deals"
            label="Action required"
            value={actionRequired.length}
            note={
              actionRequired.length === 0
                ? "Nothing waiting for your action"
                : "Needs your attention"
            }
            icon={<CircleAlert size={18} />}
            tone="warn"
          />
          <MetricCard
            href="/deals"
            label="All deals"
            value={deals.length}
            note="Total you participate in"
            icon={<Layers3 size={18} />}
            tone="info"
          />
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.05fr_1.05fr_0.9fr]">
          <section className="rounded-[20px] border border-[var(--tl-line)] bg-[var(--tl-card)]">
            <div className="flex items-center justify-between border-b border-[var(--tl-line)] px-5 py-4">
              <div>
                <h2 className="text-sm font-bold text-[var(--tl-ink)]">
                  Active deals
                </h2>
                <p className="mt-0.5 text-xs text-[var(--tl-muted)]">
                  Non-terminal agreements you participate in.
                </p>
              </div>
              <Link
                href="/deals"
                className="text-xs font-bold text-[var(--tl-emerald)] no-underline hover:underline"
              >
                View all →
              </Link>
            </div>
            {active.length === 0 ? (
              <EmptyState
                title="Your next deal starts here"
                text="Create a shared agreement, set the terms, and keep the outcome clear from the start."
                href="/deals/new"
              />
            ) : (
              <ul className="divide-y divide-[var(--tl-line)]/80">
                {active.slice(0, 6).map((deal) => (
                  <li key={deal.id}>
                    <Link
                      href={`/deals/${deal.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-3.5 no-underline transition hover:bg-white/[.02]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--tl-ink)]">
                          {deal.title || deal.deal_code}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--tl-muted)]">
                          {deal.deal_code}
                          {deal.amount ? (
                            <span className="mt-0.5 inline-flex items-center gap-1">
                              <span>· {deal.amount}</span>
                              <TokenIcon
                                code={deal.asset_code || deal.currency}
                                size={14}
                              />
                              <span>{deal.asset_code || deal.currency || ""}</span>
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${statusClass(String(deal.status))}`}
                      >
                        {statusLabel(String(deal.status))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-[20px] border border-[var(--tl-line)] bg-[var(--tl-card)]">
            <div className="flex items-center justify-between border-b border-[var(--tl-line)] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--tl-emerald)]/25 bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]">
                  <Clock3 size={16} />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-[var(--tl-ink)]">
                    Recent activity
                  </h2>
                  <p className="text-[11px] text-[var(--tl-muted)]">
                    Recorded TrustLayer events for your deals.
                  </p>
                </div>
              </div>
              <Link
                href="/activity"
                className="text-xs font-bold text-[var(--tl-emerald)] no-underline hover:underline"
              >
                Open activity →
              </Link>
            </div>
            {recent.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-[var(--tl-muted)]">
                No events yet. Activity appears as deals move.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--tl-line)]/70">
                {recent.map((ev) => {
                  const av = eventAvatar(ev.event_type);
                  const code = dealCodeById.get(ev.deal_id) || "Deal";
                  return (
                    <li key={ev.id}>
                      <Link
                        href={`/deals/${ev.deal_id}`}
                        className="flex items-center gap-3 px-4 py-3.5 no-underline transition hover:bg-white/[.02]"
                      >
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${av.className}`}
                        >
                          {av.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-[var(--tl-ink)]">
                            {humanEvent(ev.event_type)}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-[var(--tl-muted)]">
                            {av.blurb}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-[var(--tl-muted)]">
                            {new Date(ev.created_at).toLocaleString()}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] font-semibold text-[var(--tl-muted)]">
                          {code}
                          <ArrowRight size={13} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="space-y-4">
            <section className="rounded-[20px] border border-[var(--tl-line)] bg-[var(--tl-card)]">
              <div className="flex items-center gap-2.5 border-b border-[var(--tl-line)] px-5 py-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--tl-emerald)]/25 bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]">
                  <Zap size={16} />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-[var(--tl-ink)]">
                    Quick actions
                  </h2>
                  <p className="text-[11px] text-[var(--tl-muted)]">
                    Keep things moving
                  </p>
                </div>
              </div>
              <div className="space-y-2 p-3">
                <QuickAction
                  href="/deals/new"
                  title="Create a new deal"
                  text="Start a secure transaction"
                  icon={<Plus size={17} />}
                />
                <QuickAction
                  href="/deals"
                  title="View your deals"
                  text="Manage existing transactions"
                  icon={<FileText size={17} />}
                />
                <QuickAction
                  href="/activity"
                  title="View activity"
                  text="Track on-chain and deal events"
                  icon={<Clock3 size={17} />}
                />
                <QuickAction
                  href="/profile"
                  title="Update profile"
                  text="Identity, wallets, and channels"
                  icon={<UserRound size={17} />}
                />
                <Link
                  href="/support"
                  className="group flex items-center gap-3 rounded-2xl border border-[var(--tl-emerald)]/35 bg-[var(--tl-emerald-soft)] p-3.5 no-underline transition hover:border-[var(--tl-emerald)]/50"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--tl-emerald)]/20 text-[var(--tl-emerald)]">
                    <Headphones size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[var(--tl-ink)]">
                      Need help?
                    </span>
                    <span className="mt-0.5 block text-[11px] text-[var(--tl-muted)]">
                      Support, status, and tickets
                    </span>
                  </span>
                  <ArrowRight
                    size={15}
                    className="text-[var(--tl-emerald)] transition group-hover:translate-x-0.5"
                  />
                </Link>
              </div>
            </section>

            <Link
              href="/profile"
              className="block rounded-[20px] border border-[var(--tl-line)] bg-[var(--tl-card)] p-5 no-underline transition hover:border-[var(--tl-emerald)]/30"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] text-[var(--tl-muted)]">
                    <ShieldCheck size={16} />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-[var(--tl-ink)]">
                      Fiat capacity
                    </p>
                    <p className="text-[11px] text-[var(--tl-muted)]">
                      When enabled · not required for Solana
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-[var(--tl-emerald)]">
                  Profile →
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-[var(--tl-bg-elevated)] px-2 py-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-[var(--tl-muted)]">
                    Level
                  </p>
                  <p className="mt-1 text-lg font-black text-[var(--tl-ink)]">
                    {ngnEligibility.verificationLevel ?? 0}
                  </p>
                </div>
                <div className="rounded-xl bg-[var(--tl-bg-elevated)] px-2 py-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-[var(--tl-muted)]">
                    Single
                  </p>
                  <p className="mt-1 text-sm font-black text-[var(--tl-ink)]">
                    ₦
                    {Number(
                      ngnEligibility.singleDealLimit || 100000
                    ).toLocaleString()}
                  </p>
                </div>
                <div className="rounded-xl bg-[var(--tl-bg-elevated)] px-2 py-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-[var(--tl-muted)]">
                    Open
                  </p>
                  <p className="mt-1 text-sm font-black text-[var(--tl-ink)]">
                    ₦
                    {Number(
                      ngnEligibility.openExposureLimit || 200000
                    ).toLocaleString()}
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </div>

        <section className="mt-5 flex flex-col gap-3 rounded-[18px] border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--tl-emerald)]/25 bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]">
              <ShieldCheck size={16} />
            </span>
            <div>
              <p className="text-sm font-bold text-[var(--tl-ink)]">
                Non-custodial. Your funds. Your control.
              </p>
              <p className="mt-0.5 text-xs text-[var(--tl-muted)]">
                TrustLayer uses on-chain escrow. You authorize every movement
                with your wallet.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide">
            <span className="rounded-full border border-[var(--tl-emerald)]/30 bg-[var(--tl-emerald-soft)] px-3 py-1 text-[var(--tl-emerald)]">
              {solanaLive} · live
            </span>
            <span className="rounded-full border border-[var(--tl-line)] px-3 py-1 text-[var(--tl-muted)]">
              Fiat rails · coming soon
            </span>
          </div>
        </section>
      </main>
    </AuthenticatedShell>
  );
}

function MetricCard({
  href,
  label,
  value,
  note,
  icon,
  tone,
}: {
  href: string;
  label: string;
  value: number;
  note: string;
  icon: React.ReactNode;
  tone: "emerald" | "warn" | "info";
}) {
  const toneClass =
    tone === "warn"
      ? "border-[var(--tl-warn)]/25 bg-[var(--tl-warning-soft)] text-[var(--tl-warn)]"
      : tone === "info"
        ? "border-[var(--tl-info)]/25 bg-[var(--tl-info-soft)] text-[var(--tl-info)]"
        : "border-[var(--tl-emerald)]/25 bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]";

  return (
    <Link
      href={href}
      className="rounded-[18px] border border-[var(--tl-line)] bg-[var(--tl-card)] p-4 no-underline transition hover:border-[var(--tl-emerald)]/30"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-[var(--tl-muted)]">
          {label}
        </span>
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-xl border ${toneClass}`}
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-black tracking-tight text-[var(--tl-ink)]">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-[var(--tl-muted)]">{note}</p>
    </Link>
  );
}

function QuickAction({
  href,
  title,
  text,
  icon,
}: {
  href: string;
  title: string;
  text: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)]/80 p-3.5 no-underline transition hover:border-[var(--tl-emerald)]/30 hover:bg-[var(--tl-emerald-soft)]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[var(--tl-ink)]">
          {title}
        </span>
        <span className="mt-0.5 block text-[11px] leading-4 text-[var(--tl-muted)]">
          {text}
        </span>
      </span>
      <ArrowRight
        size={15}
        className="text-[var(--tl-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--tl-emerald)]"
      />
    </Link>
  );
}

function EmptyState({
  title,
  text,
  href,
}: {
  title: string;
  text: string;
  href: string;
}) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center px-6 py-9 text-center">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-[20px] border border-[var(--tl-emerald)]/25 bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]">
        <WalletCards size={24} />
        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--tl-emerald)] text-xs font-bold text-[#042f2e]">
          +
        </span>
      </div>
      <h3 className="mt-5 font-bold text-[var(--tl-ink)]">{title}</h3>
      <p className="mt-2 max-w-xs text-sm leading-6 text-[var(--tl-muted)]">
        {text}
      </p>
      <Link
        href={href}
        className="tl-button tl-button-success mt-5 no-underline"
      >
        Get started <ArrowRight size={15} />
      </Link>
    </div>
  );
}
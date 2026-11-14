import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CheckCircle2,
  FileText,
  Gavel,
  LifeBuoy,
  RefreshCw,
  Users,
  Wallet,
  Layers3,
  Settings2,
} from "lucide-react";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/domain/admin";
import LiveAdminSync from "@/components/realtime/LiveAdminSync";
import AdminShell from "@/components/admin/AdminShell";

export default async function AdminPlatformPage() {
  try {
    const { admin } = await requireAdminUser();
    const [
      { count: deals },
      { count: openDisputes },
      { count: activeCrypto },
      { count: users },
      { count: support },
    ] = await Promise.all([
      admin.from("deals").select("id", { count: "exact", head: true }),
      admin
        .from("deal_disputes")
        .select("id", { count: "exact", head: true })
        .eq("status", "open"),
      admin
        .from("crypto_settlements")
        .select("id", { count: "exact", head: true })
        .eq("onchain_status", "funded"),
      admin.from("profiles").select("id", { count: "exact", head: true }),
      (admin as any)
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress"]),
    ]);

    const metrics = [
      {
        label: "Total deals",
        value: deals ?? 0,
        note: "Across the platform",
        icon: Layers3,
        tone: "emerald" as const,
      },
      {
        label: "Funded escrows",
        value: activeCrypto ?? 0,
        note: "Currently funded on-chain",
        icon: Wallet,
        tone: "cyan" as const,
      },
      {
        label: "Open disputes",
        value: openDisputes ?? 0,
        note: "Require admin attention",
        icon: Gavel,
        tone: "gold" as const,
      },
      {
        label: "Registered users",
        value: users ?? 0,
        note: "TrustLayer accounts",
        icon: Users,
        tone: "blue" as const,
      },
      {
        label: "Open support",
        value: support ?? 0,
        note: "Open or in progress",
        icon: LifeBuoy,
        tone: "violet" as const,
      },
    ];

    return (
      <AdminShell
        active="overview"
        breadcrumb="Overview"
        openDisputes={openDisputes ?? 0}
      >
        <LiveAdminSync />

        <section className="relative isolate overflow-hidden rounded-[28px] border border-[var(--tl-line)] bg-[linear-gradient(112deg,#102744_0%,#0d203b_48%,#07172e_100%)] px-5 py-6 shadow-[0_22px_70px_rgba(0,0,0,0.22)] sm:px-7 sm:py-8 lg:px-8">
          <div className="pointer-events-none absolute -right-10 -top-28 -z-10 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.18),transparent_68%)]" />
          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.75fr)_220px]">
            <div className="relative z-10">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--tl-emerald)]">
                TrustLayer operations
              </p>
              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                Good to see you, Admin <span aria-hidden="true">✦</span>
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--tl-muted)] sm:text-base">
                Here&apos;s your platform overview. Review the signals that need
                attention and keep every transaction accountable.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href="/admin/disputes"
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--tl-emerald)] px-4 py-3 text-sm font-bold text-[#042f2e] no-underline"
                >
                  <Gavel size={16} /> Review disputes <ArrowRight size={15} />
                </Link>
                <Link
                  href="/admin/activity"
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--tl-line)] bg-[rgba(6,17,39,0.45)] px-4 py-3 text-sm font-bold text-[var(--tl-ink)] no-underline transition hover:border-[var(--tl-emerald)]/40"
                >
                  <Activity size={16} /> Platform activity
                </Link>
              </div>
            </div>

            <div
              className="relative hidden h-40 items-center justify-center lg:flex"
              aria-hidden="true"
            >
              <div className="absolute h-40 w-64 rounded-full border border-[var(--tl-emerald)]/15" />
              <div className="absolute top-5 h-14 w-36 rotate-[30deg] rounded-2xl border border-[var(--tl-gold)]/60 bg-[linear-gradient(135deg,rgba(212,175,55,0.9),rgba(212,175,55,0.28))]" />
              <div className="absolute top-12 h-14 w-36 rotate-[30deg] rounded-2xl border border-[var(--tl-emerald)]/70 bg-[linear-gradient(135deg,rgba(16,185,129,0.55),rgba(16,185,129,0.08))]" />
              <div className="absolute top-[74px] h-14 w-36 rotate-[30deg] rounded-2xl border border-[var(--tl-info)]/40 bg-[linear-gradient(135deg,rgba(56,189,248,0.22),rgba(8,22,45,0.75))]" />
            </div>

            <div className="border-t border-[var(--tl-line)] pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <p className="text-xs font-semibold text-[var(--tl-muted)]">
                Platform snapshot
              </p>
              <div className="mt-3 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--tl-emerald)] shadow-[0_0_12px_rgba(16,185,129,0.65)]" />
                <span className="text-sm font-bold">Admin tools available</span>
              </div>
              <p className="mt-5 text-xs text-[var(--tl-muted)]">Total deals</p>
              <div className="mt-1 flex items-end gap-3">
                <span className="text-3xl font-black tracking-tight">
                  {deals ?? 0}
                </span>
                <span className="pb-1 text-xs text-[var(--tl-muted)]">
                  recorded on TrustLayer
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {metrics.map(({ label, value, note, icon: Icon, tone }) => {
            const toneClasses = {
              emerald:
                "border-[var(--tl-emerald)]/30 bg-[linear-gradient(145deg,rgba(16,185,129,0.10),rgba(13,29,56,0.82)_70%)] text-[var(--tl-emerald)]",
              cyan: "border-[var(--tl-info)]/25 bg-[linear-gradient(145deg,rgba(56,189,248,0.09),rgba(13,29,56,0.82)_70%)] text-[var(--tl-info)]",
              gold: "border-[var(--tl-gold)]/30 bg-[linear-gradient(145deg,rgba(212,175,55,0.10),rgba(13,29,56,0.82)_70%)] text-[var(--tl-gold)]",
              blue: "border-blue-400/25 bg-[linear-gradient(145deg,rgba(59,130,246,0.09),rgba(13,29,56,0.82)_70%)] text-blue-300",
              violet:
                "border-violet-400/25 bg-[linear-gradient(145deg,rgba(139,92,246,0.09),rgba(13,29,56,0.82)_70%)] text-violet-300",
            };
            return (
              <article
                key={label}
                className={`rounded-2xl border p-4 transition duration-200 hover:-translate-y-0.5 ${toneClasses[tone]}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-[var(--tl-muted)]">
                    {label}
                  </span>
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-current/15 bg-black/10">
                    <Icon size={19} />
                  </span>
                </div>
                <p className="mt-4 text-3xl font-black tracking-tight text-[var(--tl-ink)]">
                  {value}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-[var(--tl-muted)]">
                  {note}
                </p>
              </article>
            );
          })}
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
          <div className="rounded-[24px] border border-[var(--tl-line)] bg-[linear-gradient(145deg,rgba(18,37,68,0.92),rgba(8,22,45,0.92))] p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--tl-emerald)]/20 bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]">
                  <Settings2 size={20} />
                </span>
                <div>
                  <h2 className="text-base font-bold">Operations workspace</h2>
                  <p className="mt-1 text-xs text-[var(--tl-muted)]">
                    The tools you need to keep the platform moving.
                  </p>
                </div>
              </div>
              <span className="rounded-full border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--tl-muted)]">
                Admin only
              </span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <ActionCard
                href="/admin/deals"
                title="All platform deals"
                description="Review deals across all users."
                icon={<FileText size={19} />}
              />
              <ActionCard
                href="/admin/users"
                title="User management"
                description="Review accounts and access."
                icon={<Users size={19} />}
              />
              <ActionCard
                href="/admin/disputes"
                title="Dispute queue"
                description="Inspect and resolve open disputes."
                icon={<Gavel size={19} />}
                highlight={(openDisputes ?? 0) > 0}
              />
              <ActionCard
                href="/admin/reconcile"
                title="Reconciliation"
                description="Sync from confirmed signatures."
                icon={<RefreshCw size={19} />}
              />
              <ActionCard
                href="/admin/support"
                title="Support tickets"
                description="Follow up on user-reported issues."
                icon={<LifeBuoy size={19} />}
                highlight={(support ?? 0) > 0}
              />
              <ActionCard
                href="/admin/verification"
                title="Verification review"
                description="Open the verification foundation."
                icon={<BadgeCheck size={19} />}
              />
            </div>
          </div>

          <div className="flex flex-col rounded-[24px] border border-[var(--tl-line)] bg-[linear-gradient(145deg,rgba(18,37,68,0.92),rgba(8,22,45,0.92))] p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--tl-info)]/20 bg-[var(--tl-info-soft)] text-[var(--tl-info)]">
                <Activity size={20} />
              </span>
              <div>
                <h2 className="text-base font-bold">Platform pulse</h2>
                <p className="mt-1 text-xs text-[var(--tl-muted)]">
                  A quick view of areas to monitor.
                </p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              <PulseRow
                icon={<Gavel size={16} />}
                label="Dispute queue"
                value={`${openDisputes ?? 0} open`}
                tone={(openDisputes ?? 0) > 0 ? "gold" : "emerald"}
              />
              <PulseRow
                icon={<Wallet size={16} />}
                label="Funded crypto escrows"
                value={`${activeCrypto ?? 0} funded`}
                tone="cyan"
              />
              <PulseRow
                icon={<LifeBuoy size={16} />}
                label="Support queue"
                value={`${support ?? 0} open`}
                tone={(support ?? 0) > 0 ? "gold" : "emerald"}
              />
            </div>
            <div className="mt-5 rounded-2xl border border-[var(--tl-emerald)]/20 bg-[linear-gradient(110deg,rgba(16,185,129,0.10),rgba(16,185,129,0.025))] p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2
                  size={18}
                  className="mt-0.5 shrink-0 text-[var(--tl-emerald)]"
                />
                <div>
                  <p className="text-sm font-bold">
                    Confirmation before reconciliation
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--tl-muted)]">
                    Use confirmed transaction signatures to reconcile records;
                    reconciliation must not submit a new blockchain transaction.
                  </p>
                </div>
              </div>
              <Link
                href="/admin/reconcile"
                className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-[var(--tl-emerald)] no-underline hover:text-emerald-300"
              >
                Open reconciliation <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>
        </section>

        <footer className="mt-6 flex flex-col gap-3 border-t border-[var(--tl-line)]/80 pt-5 text-xs text-[var(--tl-muted)] sm:flex-row sm:items-center sm:justify-between">
          <span>TrustLayer · Transaction integrity infrastructure</span>
          <span className="flex items-center gap-2">
            Administrative actions remain subject to authorization and on-chain
            confirmation.
          </span>
        </footer>
      </AdminShell>
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required.")
      redirect("/login");
    if (error instanceof Error && error.message === "Admin access required.")
      redirect("/dashboard");
    throw error;
  }
}

function ActionCard({
  href,
  title,
  description,
  icon,
  highlight = false,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-[116px] flex-col rounded-2xl border border-[var(--tl-line)] bg-[rgba(6,17,39,0.42)] p-4 no-underline transition duration-200 hover:-translate-y-0.5 hover:border-[var(--tl-emerald)]/40 hover:bg-[rgba(16,185,129,0.055)]"
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
            highlight
              ? "border-[var(--tl-gold)]/25 bg-[var(--tl-gold-soft)] text-[var(--tl-gold)]"
              : "border-[var(--tl-emerald)]/20 bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]"
          }`}
        >
          {icon}
        </span>
        <ArrowUpRight
          size={15}
          className="text-[var(--tl-muted)] transition group-hover:text-[var(--tl-emerald)]"
        />
      </div>
      <span className="mt-3 text-sm font-bold text-[var(--tl-ink)]">{title}</span>
      <span className="mt-1 text-xs leading-5 text-[var(--tl-muted)]">
        {description}
      </span>
    </Link>
  );
}

function PulseRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "emerald" | "gold" | "cyan";
}) {
  const toneClass =
    tone === "gold"
      ? "border-[var(--tl-gold)]/20 bg-[var(--tl-gold-soft)] text-[var(--tl-gold)]"
      : tone === "cyan"
        ? "border-[var(--tl-info)]/20 bg-[var(--tl-info-soft)] text-[var(--tl-info)]"
        : "border-[var(--tl-emerald)]/20 bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--tl-line)] bg-[rgba(6,17,39,0.32)] px-3 py-3">
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-xl border ${toneClass}`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-sm font-semibold">{label}</span>
      <span className="text-xs font-bold text-[var(--tl-muted)]">{value}</span>
    </div>
  );
}

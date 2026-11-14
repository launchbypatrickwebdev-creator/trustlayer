"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  ArrowLeftRight,
  BadgeCheck,
  Gavel,
  KeyRound,
  LayoutDashboard,
  Layers3,
  LifeBuoy,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";

/**
 * Admin chrome — same model as Overview:
 * CSS grid [228px | 1fr], sidebar in document flow (not fixed).
 * Content never sits under the rail; global TrustLayerFooter stays full-width below.
 */
const navigation = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, key: "overview" },
  { href: "/admin/deals", label: "Deals", icon: Layers3, key: "deals" },
  { href: "/admin/users", label: "Users", icon: Users, key: "users" },
  { href: "/admin/partners", label: "Partners", icon: KeyRound, key: "partners" },
  { href: "/admin/disputes", label: "Disputes", icon: Gavel, key: "disputes" },
  {
    href: "/admin/ax-pending",
    label: "Ax settle",
    icon: ArrowLeftRight,
    key: "ax-pending",
  },
  {
    href: "/admin/reconcile",
    label: "Reconciliation",
    icon: RefreshCw,
    key: "reconcile",
  },
  { href: "/admin/activity", label: "Activity", icon: Activity, key: "activity" },
  { href: "/admin/support", label: "Support", icon: LifeBuoy, key: "support" },
  {
    href: "/admin/verification",
    label: "Verification",
    icon: BadgeCheck,
    key: "verification",
  },
] as const;

export type AdminNavKey = (typeof navigation)[number]["key"];

function navActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function AdminShell({
  active,
  children,
  openDisputes,
  breadcrumb,
}: {
  /** Optional override; otherwise derived from pathname */
  active?: AdminNavKey | string;
  children: ReactNode;
  openDisputes?: number;
  /** Right-column breadcrumb label, e.g. "Overview" */
  breadcrumb?: string;
}) {
  const pathname = usePathname() || "/admin";
  const activeKey =
    active ||
    navigation.find((n) => navActive(pathname, n.href))?.key ||
    "overview";
  const crumb =
    breadcrumb ||
    navigation.find((n) => n.key === activeKey)?.label ||
    "Admin";

  return (
    <div className="min-h-screen bg-[var(--tl-bg,#04101f)] text-[var(--tl-ink,#e8f0f8)]">
      <div className="mx-auto grid min-h-screen max-w-[1800px] lg:grid-cols-[228px_minmax(0,1fr)]">
        {/* Column 1 — in-flow sidebar (not fixed) */}
        <aside className="hidden border-r border-[var(--tl-line)]/80 bg-[var(--tl-bg-elevated,#071a2d)]/75 px-4 py-6 lg:flex lg:flex-col">
          <Link
            href="/dashboard"
            className="mb-10 flex items-center gap-3 px-2 no-underline"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--tl-emerald,#10b981)]/60 bg-[var(--tl-card,#0c1524)] text-xs font-black tracking-tight text-[var(--tl-emerald,#10b981)] shadow-[0_0_24px_rgba(16,185,129,0.12)]">
              TL
            </span>
            <span>
              <span className="block text-[16px] font-bold tracking-tight text-[var(--tl-ink)]">
                TrustLayer
              </span>
              <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--tl-muted)]">
                Admin workspace
              </span>
            </span>
          </Link>

          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--tl-muted)]">
            Platform
          </p>
          <nav className="space-y-1">
            {navigation.map(({ href, label, icon: Icon, key }) => {
              const isActive = key === activeKey;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold no-underline transition ${
                    isActive
                      ? "border border-[var(--tl-emerald)]/20 bg-[linear-gradient(100deg,rgba(16,185,129,0.2),rgba(16,185,129,0.06))] text-[var(--tl-emerald)] shadow-[inset_3px_0_0_var(--tl-emerald)]"
                      : "text-[var(--tl-muted)] hover:bg-[var(--tl-card)] hover:text-[var(--tl-ink)]"
                  }`}
                >
                  <Icon
                    size={17}
                    className={
                      isActive
                        ? "text-[var(--tl-emerald)]"
                        : "opacity-80 group-hover:opacity-100"
                    }
                  />
                  {label}
                  {label === "Disputes" && (openDisputes ?? 0) > 0 ? (
                    <span className="ml-auto rounded-full bg-[var(--tl-gold-soft,rgba(212,175,55,0.14))] px-2 py-0.5 text-[10px] font-bold text-[var(--tl-gold,#d4af37)]">
                      {openDisputes}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto overflow-hidden rounded-2xl border border-[var(--tl-line)] bg-[linear-gradient(160deg,rgba(16,185,129,0.10),rgba(8,22,45,0.15)_55%,rgba(212,175,55,0.08))] p-4">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--tl-emerald-soft,rgba(16,185,129,0.14))] text-[var(--tl-emerald)]">
              <ShieldCheck size={19} />
            </div>
            <p className="text-sm font-bold">Transaction integrity</p>
            <p className="mt-1 text-xs leading-5 text-[var(--tl-muted)]">
              Safer deals. Clearer outcomes. A record that holds together.
            </p>
            <div className="mt-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--tl-muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--tl-emerald)]" />{" "}
              Admin access enabled
            </div>
          </div>
        </aside>

        {/* Column 2 — all page content */}
        <div className="min-w-0 px-4 pb-8 pt-4 sm:px-6 lg:px-8 lg:pt-6">
          <header className="mb-7 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 lg:hidden">
              <span className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--tl-emerald)]/50 bg-[var(--tl-card)] text-xs font-black text-[var(--tl-emerald)]">
                TL
              </span>
              <span className="text-sm font-bold">
                TrustLayer{" "}
                <span className="font-medium text-[var(--tl-muted)]">Admin</span>
              </span>
            </div>
            <div className="hidden min-w-0 items-center gap-2 text-xs text-[var(--tl-muted)] sm:flex">
              <span className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] px-3 py-2">
                <ShieldCheck
                  size={14}
                  className="mr-2 inline text-[var(--tl-emerald)]"
                />
                Platform operations
              </span>
              <span className="text-[var(--tl-line)]">/</span>
              <span className="text-[var(--tl-ink)]">{crumb}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden items-center gap-2 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] px-3 py-2 text-xs text-[var(--tl-muted)] sm:flex">
                <span className="h-2 w-2 rounded-full bg-[var(--tl-emerald)] shadow-[0_0_12px_rgba(16,185,129,0.6)]" />{" "}
                Admin session
              </span>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-card)] px-3 py-2.5 text-xs font-bold text-[var(--tl-ink)] no-underline transition hover:border-[var(--tl-emerald)]/40"
              >
                <ArrowLeft size={14} />
                <span className="hidden sm:inline">User dashboard</span>
                <span className="sm:hidden">Dashboard</span>
              </Link>
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--tl-emerald)]/40 bg-[linear-gradient(135deg,rgba(16,185,129,0.24),rgba(56,189,248,0.12))] text-xs font-black text-[var(--tl-ink)]"
                title="TrustLayer Admin"
              >
                TA
              </span>
            </div>
          </header>

          {children}
        </div>
      </div>
    </div>
  );
}

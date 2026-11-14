"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  Bot,
  ArrowRight,
  CircleHelp,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Plus,
  ShieldCheck,
  UserCircle,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/db/supabase-browser";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/deals", label: "Deals", icon: ListChecks },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/profile", label: "Profile", icon: UserCircle },
  { href: "/support", label: "Support", icon: CircleHelp },
];

export default function AppShell({
  children,
  userEmail,
  isAdmin = false,
}: {
  children: React.ReactNode;
  userEmail?: string | null;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  const activePage =
    nav.find(
      ({ href }) => pathname === href || pathname.startsWith(`${href}/`)
    )?.label || "Workspace";
  const initials = (userEmail || "TL").split("@")[0].slice(0, 2).toUpperCase();

  return (
    <div className="tl-app flex min-h-screen bg-[var(--tl-bg)] text-[var(--tl-ink)]">
      {/* sticky (not fixed) so it leaves with the shell and does not cover the global footer */}
      <aside className="tl-sidebar sticky top-0 z-40 hidden h-screen w-[238px] shrink-0 flex-col border-r border-[var(--tl-line)]/80 px-4 py-5 lg:flex">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 px-2 no-underline"
        >
          <span className="tl-mark flex h-10 w-10 items-center justify-center rounded-[14px] text-xs shadow-lg">
            TL
          </span>
          <span>
            <span className="block text-[15px] font-bold tracking-tight">
              Trust<span className="text-emerald-300">Layer</span>
            </span>
            <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-[.19em] text-[var(--tl-muted)]">
              Deals · Settlement · Trust
            </span>
          </span>
        </Link>
        <p className="mb-3 mt-10 px-3 text-[9px] font-bold uppercase tracking-[.2em] text-slate-500">
          Workspace
        </p>
        <nav className="space-y-1">
          {nav.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold no-underline transition ${
                  active
                    ? "bg-gradient-to-r from-emerald-400/15 to-cyan-400/5 text-emerald-200 ring-1 ring-emerald-300/15"
                    : "text-slate-400 hover:bg-white/[.035] hover:text-white"
                }`}
              >
                {active && (
                  <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(16,185,129,.7)]" />
                )}
                <Icon
                  size={17}
                  className={
                    active
                      ? "text-emerald-300"
                      : "text-slate-500 group-hover:text-emerald-200"
                  }
                />
                {label}
                {label === "Support" && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto">
          <div className="relative overflow-hidden rounded-2xl border border-emerald-300/20 bg-gradient-to-br from-emerald-400/10 via-[var(--tl-card)] to-[var(--tl-bg-elevated)] p-4">
            <div className="absolute -right-5 -top-5 h-20 w-20 rounded-full bg-emerald-400/10 blur-2xl" />
            <p className="relative text-xs font-bold">
              Make every transaction verifiable.
            </p>
            <p className="relative mt-2 text-[10px] leading-4 text-[var(--tl-muted)]">
              One shared record. Clear terms. A verifiable outcome.
            </p>
            <div className="relative mt-4 flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Trust
              without custody
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="tl-topbar sticky top-0 z-30 border-b border-[var(--tl-line)]/80 backdrop-blur-2xl">
          <div className="flex h-[68px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href="/dashboard"
                className="flex items-center gap-2 no-underline lg:hidden"
              >
                <span className="tl-mark flex h-9 w-9 items-center justify-center rounded-xl text-[10px]">
                  TL
                </span>
              </Link>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-emerald-300">
                  TrustLayer workspace
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold">
                  {activePage}
                  <span className="hidden font-normal text-[var(--tl-muted)] sm:inline">
                    {" "}
                    / Your transaction overview
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {isAdmin && (
                <Link
                  href="/admin"
                  title="Admin platform"
                  className="hidden items-center gap-1.5 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-xs font-bold text-amber-200 no-underline sm:flex"
                >
                  <ShieldCheck size={14} /> Admin <ArrowRight size={12} />
                </Link>
              )}
              <Link
                href="/deals/new"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-3.5 py-2.5 text-xs font-bold text-slate-950 no-underline shadow-[0_8px_24px_rgba(16,185,129,.18)] transition hover:bg-emerald-300 sm:px-4 sm:text-sm"
              >
                <Plus size={16} />{" "}
                <span className="hidden min-[420px]:inline">New deal</span>
                <span className="min-[420px]:hidden">New</span>
              </Link>
              <div className="hidden h-8 w-px bg-[var(--tl-line)] sm:block" />
              <div className="hidden items-center gap-2 sm:flex">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-cyan-300/25 bg-gradient-to-br from-cyan-400/20 to-emerald-400/15 text-xs font-bold text-cyan-100">
                  {initials}
                </span>
                <span className="hidden max-w-28 truncate text-xs font-medium text-slate-300 xl:block">
                  {userEmail || "Your account"}
                </span>
              </div>
              <button
                type="button"
                onClick={signOut}
                disabled={signingOut}
                title={userEmail || "Sign out"}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--tl-line)] bg-white/[.025] text-slate-400 transition hover:border-rose-300/25 hover:text-rose-200 disabled:opacity-50"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-[var(--tl-line)]/60 px-3 py-2 lg:hidden">
            {nav.map(({ href, label, icon: Icon }) => {
              const active =
                pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold no-underline ${
                    active
                      ? "bg-emerald-400/10 text-emerald-200"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </Link>
              );
            })}
            {isAdmin && (
              <Link
                href="/admin"
                className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-amber-200 no-underline"
              >
                <ShieldCheck size={14} />
                Admin
              </Link>
            )}
          </nav>
        </header>
        {children}
      </div>
    </div>
  );
}
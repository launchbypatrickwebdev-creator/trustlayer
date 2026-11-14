"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ExternalLink, Menu, Search, X } from "lucide-react";
import {
  DEVELOPER_NAV_GROUPS,
  isNavActive,
  methodBadgeClass,
  type DevNavGroup,
  type DevNavLink,
} from "@/lib/developers/nav";

function filterGroups(q: string): DevNavGroup[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return DEVELOPER_NAV_GROUPS;
  return DEVELOPER_NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => {
      const hay = [
        item.label,
        item.href,
        ...(item.keywords || []),
        item.method || "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    }),
  })).filter((g) => g.items.length > 0);
}

function NavItem({
  item,
  pathname,
  onNavigate,
}: {
  item: DevNavLink;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = isNavActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] no-underline transition ${
        active
          ? "bg-white/10 font-semibold text-white"
          : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.method ? (
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none ${methodBadgeClass(item.method)}`}
        >
          {item.method}
        </span>
      ) : null}
    </Link>
  );
}

function SidebarBody({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => filterGroups(q), [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("tl-docs-jump")?.focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        document.getElementById("tl-docs-jump")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 p-3">
        <label className="relative block">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            id="tl-docs-jump"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Jump to…  Ctrl+K"
            className="w-full rounded-lg border border-white/10 bg-black/30 py-2 pl-8 pr-2 text-xs text-slate-200 outline-none placeholder:text-slate-500 focus:border-emerald-500/40"
          />
        </label>
        <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Jump to
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map((group) => (
          <div key={group.id} className="mb-4">
            <p className="mb-1 px-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              {group.title}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <NavItem
                  key={item.href + item.label}
                  item={item}
                  pathname={pathname}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}

        <div className="mt-2 border-t border-white/10 pt-3">
          <p className="mb-1 px-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Your workspace
          </p>
          <Link
            href="/partner"
            onClick={onNavigate}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-slate-400 no-underline hover:bg-white/5 hover:text-white"
          >
            Partner Console
            <ExternalLink size={13} className="opacity-60" />
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Persistent docs chrome (Safe Haven / ReadMe style):
 * top bar + fixed left sidebar + main content.
 * Always show sidebar from md up — not optional.
 */
export default function DevelopersShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/developers";
  const [mobileOpen, setMobileOpen] = useState(false);

  // The /developers route is the public developer landing page. Keep the
  // documentation chrome for the deeper guides and API reference routes.
  if (pathname === "/developers") return <>{children}</>;

  return (
    <div className="min-h-screen bg-[#070f1c] text-slate-200">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070f1c]/95 backdrop-blur-xl">
        <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-4">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              className="rounded-lg border border-white/10 p-2 text-slate-300 md:hidden"
              aria-label="Open docs menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={18} />
            </button>
            <Link href="/" className="flex items-center gap-2 no-underline">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/40 bg-[#0a1628] text-[10px] font-black text-white">
                TL
              </span>
              <span className="text-sm font-bold text-white">TrustLayer</span>
            </Link>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
              Developers
            </span>
            <span className="hidden rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-400 sm:inline">
              API Reference
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-slate-300 sm:inline">
              Test environment
            </span>
            <Link
              href="/partner"
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 no-underline hover:border-emerald-500/40"
            >
              Partner Console
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-[min(100%,18rem)] flex-col border-r border-white/10 bg-[#0a1220] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-3">
              <span className="text-sm font-bold text-white">Docs</span>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-400"
                onClick={() => setMobileOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <SidebarBody
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      {/* Body: sidebar + content — sidebar fixed width, always on md+ */}
      <div className="flex min-h-[calc(100vh-3.5rem)]">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[18rem] shrink-0 border-r border-white/10 bg-[#0a1220] md:block">
          <SidebarBody pathname={pathname} />
        </aside>

        <main className="min-w-0 flex-1 overflow-x-hidden px-5 py-10 sm:px-10 lg:px-14">
          {children}
        </main>
      </div>
    </div>
  );
}

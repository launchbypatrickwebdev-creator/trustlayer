import Link from "next/link";
import type { ReactNode } from "react";
import { Activity, BookOpen, Building2, Handshake, KeyRound, LayoutDashboard, ListTodo, Users, Webhook } from "lucide-react";
import type { PartnerMembership } from "@/lib/domain/partner-api/partner-console";
import WorkspaceSwitcher from "@/components/partner/WorkspaceSwitcher";
import EnvironmentSwitcher from "@/components/partner/EnvironmentSwitcher";

const NAV = [
  { href: "/partner", label: "Overview", icon: LayoutDashboard, key: "overview" },
  { href: "/partner/tasks", label: "Assigned tasks", icon: ListTodo, key: "tasks" },
  { href: "/partner/deals", label: "Deals", icon: Handshake, key: "deals" },
  { href: "/partner/keys", label: "API keys", icon: KeyRound, key: "keys" },
  { href: "/partner/webhooks", label: "Webhooks", icon: Webhook, key: "webhooks" },
  { href: "/partner/activity", label: "API activity", icon: Activity, key: "activity" },
  { href: "/partner/team", label: "Team", icon: Users, key: "team" },
  { href: "/developers", label: "Developers", icon: BookOpen, key: "developers" },
];

export default function PartnerShell({
  active, partnerName, partnerId, memberships = [], role = "viewer", environmentHint = "test", children,
}: {
  active: string; partnerName: string; partnerId?: string; memberships?: PartnerMembership[];
  role?: string; environmentHint?: string; children: ReactNode;
}) {
  const query = partnerId ? `?partner=${encodeURIComponent(partnerId)}` : "";
  return <div className="min-h-screen bg-[#050d19] text-slate-200">
    <header className="sticky top-0 z-40 border-b border-[#1a2b40] bg-[#07111f]/95 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`/partner${query}`} className="flex shrink-0 items-center gap-2 no-underline">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-300/30 bg-emerald-300/10 text-xs font-black text-emerald-200">TL</span>
            <span><span className="block text-sm font-extrabold tracking-tight text-white">TrustLayer</span><span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Partner Console</span></span>
          </Link>
          <span className="hidden h-8 w-px bg-[#26374a] md:block" />
          <div className="hidden min-w-0 items-center gap-2 md:flex"><Building2 size={15} className="text-emerald-300" /><span className="max-w-48 truncate text-sm font-semibold text-slate-300">{partnerName}</span></div>
        </div>
        <div className="flex items-center gap-2">
          <WorkspaceSwitcher memberships={memberships} partnerId={partnerId || ""} />
          {role !== "operator" && <EnvironmentSwitcher environment={environmentHint} partnerId={partnerId} />}
          {role !== "operator" && <Link href="/dashboard" className="rounded-lg border border-[#26374a] px-3 py-2 text-xs font-semibold text-slate-400 no-underline hover:text-white">App</Link>}
        </div>
      </div>
    </header>
    <div className="mx-auto grid max-w-[1440px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-8 lg:py-8">
      <aside className="h-fit rounded-2xl border border-[#1a2b40] bg-[#081524] p-2 lg:sticky lg:top-24">
        <div className="px-3 py-3"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">Workspace</p><p className="mt-1 truncate text-sm font-semibold text-slate-200">{partnerName}</p><p className="mt-1 text-xs capitalize text-slate-500">{role} access</p></div>
        <nav className="flex gap-1 overflow-x-auto lg:flex-col">{NAV.filter(item => role === "operator" ? item.key === "tasks" : item.key === "tasks" ? role === "owner" : true).map(item => { const Icon = item.icon; const on = active === item.key; const href = query ? `${item.href}${item.href.includes("?") ? "&" : "?"}${query.slice(1)}` : item.href; return <Link key={item.key} href={href} className={`inline-flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold no-underline transition ${on ? "bg-emerald-300/10 text-emerald-200 ring-1 ring-inset ring-emerald-300/15" : "text-slate-400 hover:bg-white/[0.04] hover:text-white"}`}><Icon size={15}/>{item.label}</Link>; })}</nav>
        {role !== "operator" && <div className="mt-4 hidden rounded-xl border border-[#1d3448] bg-[#0c1b2a] p-3 lg:block"><p className="text-xs font-semibold text-slate-200">Integration health</p><p className="mt-1 text-[11px] leading-5 text-slate-500">Review API requests and webhook deliveries to diagnose integration issues.</p><Link href={`/partner/activity${query}`} className="mt-2 inline-block text-xs font-semibold text-emerald-300 no-underline">View activity →</Link></div>}
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  </div>;
}

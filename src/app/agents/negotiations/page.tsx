import AuthenticatedShell from "@/components/layout/AuthenticatedShell";
import AgentNegotiationWorkspace from "@/components/agents/AgentNegotiationWorkspace";
import SellerAuthoritySettings from "@/components/agents/SellerAuthoritySettings";

export default function AgentNegotiationsPage() {
  return <AuthenticatedShell><main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
    <div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-500">TrustLayer Agent Settlement Network</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">AI agent intelligence & negotiation</h1><p className="mt-3 text-sm leading-6 text-[var(--tl-muted)]">Agents receive business instructions, discover counterparties, formulate offers and negotiate within explicit limits. TrustLayer—not the AI—makes the authoritative policy decision.</p><div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 font-semibold text-emerald-700 dark:text-emerald-200">Persistent negotiation records</span><span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 font-semibold text-amber-700 dark:text-amber-200">No funds move in this stage</span></div></div>
    <SellerAuthoritySettings />
    <AgentNegotiationWorkspace />
  </main></AuthenticatedShell>;
}

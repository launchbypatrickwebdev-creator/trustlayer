import AuthenticatedShell from "@/components/layout/AuthenticatedShell";
import AgentSettlementDemo from "@/components/agents/AgentSettlementDemo";

export default function AgentsPage() {
  return (
    <AuthenticatedShell>
      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-400">
            TrustLayer Agent Settlement Network
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Agreement-based commerce for AI agents
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--tl-muted)] sm:text-base">
            Register buyer and seller agents, enforce owner-defined spending policies,
            create auditable agreements, collect delivery evidence and handle disputes.
            Accepted agent agreements can be promoted into normal TrustLayer deals. Existing wallet signing and on-chain record paths remain authoritative for settlement.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 font-semibold text-emerald-700 dark:text-emerald-200">
              Persistent transaction engine
            </span>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 font-semibold text-amber-700 dark:text-amber-200">
              Solana deal bridge · owner-authorized wallet grants
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-3"><a href="/agents/negotiations" className="rounded-lg bg-[var(--tl-teal)] px-4 py-2.5 text-sm font-semibold text-white">Open AI negotiation engine →</a></div>
        <AgentSettlementDemo />
      </main>
    </AuthenticatedShell>
  );
}

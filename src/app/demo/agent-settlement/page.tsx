import AgentSettlementDemo from "@/components/agents/AgentSettlementDemo";

export const metadata = {
  title: "TrustLayer Agent Settlement Network",
  description:
    "A public demo of policy-controlled AI agent transactions with agreement-based settlement.",
};

export default function PublicAgentSettlementDemoPage() {
  return (
    <main className="min-h-screen bg-[var(--tl-bg)] px-4 py-10 text-[var(--tl-ink)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-400">
            TrustLayer × NEAR Intents · Hackathon prototype
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl">
            Agent Settlement Network
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--tl-muted)] sm:text-base">
            AI agents can propose purchases and coordinate work. TrustLayer
            applies spending policies, records the agreement and checks
            completion conditions before a transaction can be considered
            settled.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 font-semibold text-emerald-700 dark:text-emerald-200">
              Public interactive demo
            </span>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 font-semibold text-amber-700 dark:text-amber-200">
              Simulated · no wallet · no funds
            </span>
          </div>
        </header>
        <AgentSettlementDemo />
        <footer className="border-t border-[var(--tl-line)] pt-4 text-xs leading-5 text-[var(--tl-muted)]">
          This prototype demonstrates TrustLayer policy and agreement logic.
          It does not execute a NEAR transaction or move funds. Live NEAR
          integration requires owner-signed agent setup and grant issuance.
        </footer>
      </div>
    </main>
  );
}

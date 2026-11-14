import Link from "next/link";
import PageBackLink from "@/components/layout/PageBackLink";

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageBackLink href="/" label="Back to home" />
      <h1 className="text-3xl font-black">Terms of Service</h1>
      <p className="mt-2 text-sm text-[var(--tl-muted)]">
        Last updated: September 2026 · TrustLayer non-custodial escrow
      </p>
      <div className="prose prose-sm mt-8 max-w-none space-y-4 text-[var(--tl-ink)]">
        <p>
          TrustLayer provides agreement-first escrow orchestration. For crypto
          rails, funds are locked in on-chain program accounts you authorize with
          your wallet. TrustLayer does not custody your private keys.
        </p>
        <p>
          You are responsible for the accuracy of deal terms, counterparty
          selection, and wallet security. Disputes may be resolved by the parties
          or, when enabled, by platform admin actions that still require on-chain
          confirmation where applicable.
        </p>
        <p>
          Fiat settlement, when enabled, is subject to payment-provider rules and
          applicable law in your jurisdiction. Identity verification may be
          required for regulated fiat activity and is separate from non-custodial
          crypto escrow authorization.
        </p>
        <p>
          This summary is a product placeholder. Replace with counsel-approved
          Terms of Service before production launch.
        </p>
      </div>
    </main>
  );
}

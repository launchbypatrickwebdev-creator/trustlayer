import PageBackLink from "@/components/layout/PageBackLink";
import { FAQS } from "@/lib/help/faqs";

export default function FaqPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageBackLink href="/support" label="Back to support" />
      <h1 className="text-3xl font-black text-[var(--tl-ink)]">FAQ</h1>
      <p className="mt-2 text-sm text-[var(--tl-muted)]">
        Common questions about TrustLayer escrow, Devnet testing, disputes, and
        fees. Same answers power Support search.
      </p>
      <div className="mt-8 space-y-3">
        {FAQS.map((item) => (
          <details
            key={item.id}
            className="rounded-2xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-4"
          >
            <summary className="cursor-pointer font-bold text-[var(--tl-ink)]">
              {item.q}
            </summary>
            <p className="mt-2 text-sm leading-6 text-[var(--tl-muted)]">
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </main>
  );
}
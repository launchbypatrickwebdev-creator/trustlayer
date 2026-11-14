import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  FileCheck2,
  Gavel,
  HandCoins,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Users,
  WalletCards,
  Zap,
} from "lucide-react";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import WaitlistForm from "@/components/marketing/WaitlistForm";

export default async function Home() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return (
    <main className="min-h-screen overflow-hidden">
      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b border-[var(--tl-line)] bg-[var(--tl-bg)]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3 no-underline">
            <span className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--tl-emerald)]/40 bg-[var(--tl-navy-mid)] text-xs font-black text-white shadow-[0_0_24px_rgba(16,185,129,.08)]">
              TL
            </span>
            <span className="text-lg font-bold tracking-tight text-[var(--tl-ink)]">
              TrustLayer
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/developers"
              className="hidden rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--tl-muted)] no-underline transition hover:bg-[var(--tl-card)] hover:text-[var(--tl-ink)] sm:inline"
            >
              Developers
            </Link>

            <Link
              href="/login"
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[var(--tl-muted)] no-underline hover:bg-[var(--tl-card)] hover:text-[var(--tl-ink)]"
            >
              Sign in
            </Link>

            <Link href="/login" className="tl-button tl-button-success no-underline">
              Create a deal <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative border-b border-[var(--tl-line)]">
        <div className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(circle_at_78%_28%,rgba(16,185,129,.13),transparent_28%),radial-gradient(circle_at_20%_80%,rgba(212,175,55,.06),transparent_22%)]" />

        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[.92fr_1.08fr] lg:items-center lg:px-8 lg:py-24">
          <div>
            <p className="tl-eyebrow">Transaction integrity infrastructure</p>

            <h1 className="mt-5 max-w-3xl text-5xl font-black leading-[.98] tracking-[-.05em] text-[var(--tl-ink)] sm:text-6xl lg:text-7xl">
              Every deal deserves
              <span className="block text-[var(--tl-emerald)]">
                structure.
              </span>
            </h1>

            <p className="mt-7 max-w-2xl text-xl font-semibold leading-8 text-[var(--tl-ink)]">
              Agree on the terms. Commit the assets. Complete the transaction.
              Record the outcome.
            </p>

            <p className="mt-4 max-w-2xl text-base leading-8 text-[var(--tl-muted)]">
              TrustLayer is a transaction platform for structured agreements,
              non-custodial escrow, and atomic asset exchange. It gives
              participants one shared deal record for agreed terms, asset
              commitments, delivery conditions, and defined settlement
              outcomes.
            </p>

            <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--tl-muted)]">
              Whether one party is funding an escrow or two parties are
              exchanging assets, TrustLayer coordinates the transaction from
              agreement to settlement.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              <span className="rounded-full border border-[var(--tl-emerald)]/30 bg-[var(--tl-emerald-soft)] px-3 py-1.5 text-xs font-bold text-[var(--tl-emerald)]">
                One-way escrow
              </span>
              <span className="rounded-full border border-[var(--tl-gold)]/30 bg-[var(--tl-gold-soft)] px-3 py-1.5 text-xs font-bold text-[var(--tl-gold)]">
                Atomic exchange
              </span>
              <span className="rounded-full border border-[var(--tl-line)] bg-[var(--tl-card)] px-3 py-1.5 text-xs font-bold text-[var(--tl-muted)]">
                One structured deal record
              </span>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className="tl-button tl-button-success no-underline">
                Create a deal <ArrowRight size={16} />
              </Link>

              <a
                href="#how-it-works"
                className="tl-button tl-button-secondary no-underline"
              >
                See how it works <ArrowDown size={16} />
              </a>
            </div>

            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-xs font-semibold text-[var(--tl-muted)]">
              <span className="flex items-center gap-2">
                <LockKeyhole size={14} className="text-[var(--tl-emerald)]" />
                Non-custodial crypto
              </span>

              <span className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-[var(--tl-emerald)]" />
                Defined settlement paths
              </span>

              <span className="flex items-center gap-2">
                <FileCheck2 size={14} className="text-[var(--tl-gold)]" />
                Shared transaction record
              </span>

              <span className="flex items-center gap-2">
                <Zap size={14} className="text-[var(--tl-emerald)]" />
                Telegram bot live
              </span>
            </div>

            <p className="mt-6 text-sm font-semibold text-[var(--tl-muted)]">
              Make every transaction{" "}
              <span className="text-[var(--tl-emerald)]">verifiable.</span>
            </p>
          </div>

          {/* TWO TRANSACTION MODELS */}
          <div className="relative lg:pl-4">
            <div className="absolute -inset-8 rounded-[40px] bg-[radial-gradient(circle,rgba(16,185,129,.12),transparent_62%)] blur-2xl" />

            <div className="relative space-y-4">
              {/* Escrow preview */}
              <div className="overflow-hidden rounded-[26px] border border-[var(--tl-emerald)]/30 bg-[var(--tl-bg-elevated)] p-3 shadow-[0_25px_70px_rgba(0,0,0,.4)]">
                <div className="flex items-center justify-between px-3 pb-3 pt-2">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[.16em] text-[var(--tl-muted)]">
                      Settlement model 01
                    </p>
                    <p className="mt-1 text-sm font-bold text-[var(--tl-ink)]">
                      One-way escrow
                    </p>
                  </div>
                  <span className="rounded-full bg-[var(--tl-emerald-soft)] px-3 py-1.5 text-[10px] font-bold text-[var(--tl-emerald)]">
                    PROTECTED TRANSACTION
                  </span>
                </div>

                <Image
                  src="/trustlayer-deal-previews.png"
                  alt="Illustrative TrustLayer one-way escrow transaction showing funding and delivery"
                  width={810}
                  height={780}
                  priority
                  className="h-auto w-full rounded-[19px] object-cover"
                />

                <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                  <span className="text-xs font-semibold text-[var(--tl-muted)]">
                    Buyer funds · Seller delivers
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--tl-emerald)]">
                    <CheckCircle2 size={14} />
                    Defined release path
                  </span>
                </div>
              </div>

              {/* Atomic exchange preview */}
              <div className="rounded-[26px] border border-[var(--tl-gold)]/30 bg-[var(--tl-bg-elevated)] p-5 shadow-[0_20px_60px_rgba(0,0,0,.28)] sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[.16em] text-[var(--tl-muted)]">
                      Settlement model 02
                    </p>
                    <p className="mt-1 text-sm font-bold text-[var(--tl-ink)]">
                      Atomic exchange
                    </p>
                  </div>
                  <span className="rounded-full bg-[var(--tl-gold-soft)] px-3 py-1.5 text-[10px] font-bold text-[var(--tl-gold)]">
                    ASSET-FOR-ASSET
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <div className="rounded-2xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-3 text-center">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]">
                      <WalletCards size={20} />
                    </div>
                    <p className="mt-2 text-xs font-bold text-[var(--tl-ink)]">
                      Party A
                    </p>
                    <p className="mt-1 text-[10px] text-[var(--tl-muted)]">
                      Commits asset A
                    </p>
                  </div>

                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--tl-gold)]/30 bg-[var(--tl-gold-soft)] text-[var(--tl-gold)]">
                    <RefreshCw size={17} />
                  </div>

                  <div className="rounded-2xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-3 text-center">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--tl-gold-soft)] text-[var(--tl-gold)]">
                      <WalletCards size={20} />
                    </div>
                    <p className="mt-2 text-xs font-bold text-[var(--tl-ink)]">
                      Party B
                    </p>
                    <p className="mt-1 text-[10px] text-[var(--tl-muted)]">
                      Commits asset B
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-[var(--tl-emerald)]/25 bg-[var(--tl-emerald-soft)] px-4 py-3 text-center">
                  <p className="text-[10px] font-black tracking-[.14em] text-[var(--tl-emerald)]">
                    ATOMIC SETTLEMENT
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[var(--tl-ink)]">
                    Both assets exchange under the deal rules
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TWO WAYS TO SETTLE */}
      <section
        id="how-it-works"
        className="border-b border-[var(--tl-line)] bg-[var(--tl-bg-elevated)]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <p className="tl-eyebrow">Two ways to settle a deal</p>

          <h2 className="mt-2 max-w-3xl text-4xl font-black tracking-[-.035em] text-[var(--tl-ink)] sm:text-5xl">
            Different transactions. Structured outcomes.
          </h2>

          <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--tl-muted)]">
            Not every transaction works the same way. Some require one party
            to commit funds while another delivers. Others require two parties
            to commit assets for an exchange. TrustLayer supports both models
            through one shared transaction engine.
          </p>

          <div className="mt-12 grid gap-5 lg:grid-cols-2">
            {/* ONE-WAY ESCROW */}
            <div className="rounded-[28px] border border-[var(--tl-emerald)]/25 bg-[var(--tl-card)] p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="rounded-full bg-[var(--tl-emerald-soft)] px-3 py-1.5 text-[10px] font-black tracking-wide text-[var(--tl-emerald)]">
                  PROTECTED TRANSACTIONS
                </span>
                <LockKeyhole size={21} className="text-[var(--tl-emerald)]" />
              </div>

              <h3 className="mt-5 text-2xl font-black text-[var(--tl-ink)]">
                One-way escrow
              </h3>

              <p className="mt-3 text-sm leading-7 text-[var(--tl-muted)]">
                One party commits the agreed asset. The other party performs
                against the agreement before settlement follows the deal's
                rules.
              </p>

              <div className="mt-7 space-y-3">
                <StepRow
                  number="01"
                  title="Agree"
                  description="Both parties agree on the terms, amount, delivery conditions, and milestones."
                />
                <StepRow
                  number="02"
                  title="Buyer commits"
                  description="The buyer authorizes funding into the non-custodial escrow program."
                />
                <StepRow
                  number="03"
                  title="Seller delivers"
                  description="The seller performs against the shared agreement and submits delivery evidence where required."
                />
                <StepRow
                  number="04"
                  title="Settle"
                  description="Release, cancellation, or dispute resolution follows the applicable deal rules."
                />
              </div>

              <div className="mt-7 rounded-2xl border border-[var(--tl-emerald)]/20 bg-[var(--tl-emerald-soft)] p-4">
                <p className="text-[10px] font-black tracking-[.14em] text-[var(--tl-emerald)]">
                  DEFINED OUTCOMES
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <OutcomePill label="Release" />
                  <OutcomePill label="Cancel" />
                  <OutcomePill label="Dispute and resolution" />
                </div>
              </div>
            </div>

            {/* ATOMIC EXCHANGE */}
            <div className="rounded-[28px] border border-[var(--tl-gold)]/25 bg-[var(--tl-card)] p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="rounded-full bg-[var(--tl-gold-soft)] px-3 py-1.5 text-[10px] font-black tracking-wide text-[var(--tl-gold)]">
                  ASSET-FOR-ASSET TRANSACTIONS
                </span>
                <RefreshCw size={21} className="text-[var(--tl-gold)]" />
              </div>

              <h3 className="mt-5 text-2xl font-black text-[var(--tl-ink)]">
                Atomic exchange
              </h3>

              <p className="mt-3 text-sm leading-7 text-[var(--tl-muted)]">
                Two parties commit different assets to an exchange governed
                by their shared deal. Neither side is simply waiting for the
                other to release a buyer-funded payment.
              </p>

              <div className="mt-7 space-y-3">
                <StepRow
                  number="01"
                  title="Agree on the exchange"
                  description="Both participants agree on the assets, quantities, conditions, and expiry."
                  tone="gold"
                />
                <StepRow
                  number="02"
                  title="Party A funds"
                  description="The first participant authorizes funding of their exchange leg."
                  tone="gold"
                />
                <StepRow
                  number="03"
                  title="Party B funds"
                  description="The second participant authorizes funding of their own exchange leg."
                  tone="gold"
                />
                <StepRow
                  number="04"
                  title="Atomic settlement"
                  description="Once both legs are funded, the authorized settlement exchanges both sides according to the deal rules."
                  tone="gold"
                />
              </div>

              <div className="mt-7 rounded-2xl border border-[var(--tl-gold)]/20 bg-[var(--tl-gold-soft)] p-4">
                <p className="text-[10px] font-black tracking-[.14em] text-[var(--tl-gold)]">
                  EXCHANGE OUTCOMES
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <OutcomePill label="Atomic release" tone="gold" />
                  <OutcomePill label="Cancel" tone="gold" />
                  <OutcomePill label="Reclaim under the rules" tone="gold" />
                </div>
              </div>
            </div>
          </div>

          <p className="mt-6 max-w-3xl text-xs leading-6 text-[var(--tl-muted)]">
            Each settlement model has its own lifecycle and authorization
            rules. One-way escrow dispute resolution and atomic exchange
            cancellation or reclaim are distinct processes.
          </p>
        </div>
      </section>

      {/* ONE DEAL, ONE RECORD, ONE OUTCOME */}
      <section className="border-b border-[var(--tl-line)]">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="tl-eyebrow">The TrustLayer transaction model</p>

            <h2 className="mt-2 text-4xl font-black tracking-[-.035em] text-[var(--tl-ink)] sm:text-5xl">
              One deal. One shared record. One outcome.
            </h2>

            <p className="mt-4 text-sm leading-7 text-[var(--tl-muted)]">
              The foundation stays the same, even when the settlement method
              changes. Every deal connects the participants, agreement,
              committed assets, milestones, evidence, settlement, and final
              outcome.
            </p>
          </div>

          {/* SHARED RECORD */}
          <div className="mt-10 overflow-hidden rounded-[28px] border border-[var(--tl-emerald)]/25 bg-[var(--tl-bg-elevated)]">
            <div className="border-b border-[var(--tl-line)] p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black tracking-[.16em] text-[var(--tl-emerald)]">
                    THE COMMON FOUNDATION
                  </p>
                  <h3 className="mt-2 text-2xl font-black text-[var(--tl-ink)]">
                    One shared deal record
                  </h3>
                </div>
                <FileCheck2
                  size={26}
                  className="text-[var(--tl-emerald)]"
                />
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <RecordItem
                  label="PARTICIPANTS"
                  title="Who is involved"
                  description="The parties and their roles in the deal."
                />
                <RecordItem
                  label="AGREEMENT"
                  title="What was agreed"
                  description="Terms, conditions, quantities, and obligations."
                />
                <RecordItem
                  label="ASSETS"
                  title="What is committed"
                  description="The assets and amounts assigned to the deal."
                />
                <RecordItem
                  label="MILESTONES"
                  title="What must happen"
                  description="Delivery stages, requirements, and evidence."
                />
              </div>
            </div>

            {/* BRANCHING SETTLEMENT PATHS */}
            <div className="p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-[var(--tl-line)]" />
                <span className="text-[10px] font-black tracking-[.16em] text-[var(--tl-muted)]">
                  THE SETTLEMENT METHOD CHANGES
                </span>
                <div className="h-px flex-1 bg-[var(--tl-line)]" />
              </div>

              <div className="mt-7 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-[var(--tl-emerald)]/25 bg-[var(--tl-card)] p-5">
                  <p className="text-[10px] font-black tracking-[.14em] text-[var(--tl-emerald)]">
                    PATH A
                  </p>
                  <h4 className="mt-2 text-lg font-bold text-[var(--tl-ink)]">
                    One-way escrow
                  </h4>

                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <FlowPill label="Buyer funds" />
                    <ArrowRight size={13} className="text-[var(--tl-muted)]" />
                    <FlowPill label="Seller delivers" />
                    <ArrowRight size={13} className="text-[var(--tl-muted)]" />
                    <FlowPill label="Settlement" />
                  </div>

                  <p className="mt-4 text-xs leading-6 text-[var(--tl-muted)]">
                    Release, cancellation, and applicable dispute-resolution
                    paths follow the one-way escrow rules.
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--tl-gold)]/25 bg-[var(--tl-card)] p-5">
                  <p className="text-[10px] font-black tracking-[.14em] text-[var(--tl-gold)]">
                    PATH B
                  </p>
                  <h4 className="mt-2 text-lg font-bold text-[var(--tl-ink)]">
                    Atomic exchange
                  </h4>

                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <FlowPill label="Party A funds" tone="gold" />
                    <span className="text-xs font-bold text-[var(--tl-muted)]">
                      +
                    </span>
                    <FlowPill label="Party B funds" tone="gold" />
                    <ArrowRight size={13} className="text-[var(--tl-muted)]" />
                    <FlowPill label="Atomic settlement" tone="gold" />
                  </div>

                  <p className="mt-4 text-xs leading-6 text-[var(--tl-muted)]">
                    Both funding legs are required for the exchange. Cancellation
                    and reclaim follow the atomic exchange rules.
                  </p>
                </div>
              </div>

              {/* REJOIN */}
              <div className="mt-7 flex justify-center">
                <div className="flex flex-col items-center gap-2">
                  <div className="h-6 w-px bg-[var(--tl-line)]" />
                  <ArrowDown size={17} className="text-[var(--tl-emerald)]" />
                </div>
              </div>

              <div className="mt-2 rounded-2xl border border-[var(--tl-emerald)]/30 bg-[var(--tl-emerald-soft)] p-5 text-center sm:p-6">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--tl-emerald)]/25 bg-[var(--tl-card)] text-[var(--tl-emerald)]">
                  <CheckCircle2 size={22} />
                </div>

                <p className="mt-3 text-[10px] font-black tracking-[.16em] text-[var(--tl-emerald)]">
                  THE RECORDED OUTCOME
                </p>

                <h4 className="mt-2 text-xl font-black text-[var(--tl-ink)]">
                  One transaction history
                </h4>

                <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-[var(--tl-muted)]">
                  The deal's state, settlement result, evidence, and history
                  remain connected to the same shared record, from agreement
                  through completion.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <RecordItem
              label="EVIDENCE"
              title="What was submitted"
              description="Delivery records and supporting information."
            />
            <RecordItem
              label="SETTLEMENT"
              title="How it concluded"
              description="The applicable release, exchange, or other settlement result."
            />
            <RecordItem
              label="OUTCOME"
              title="What happened"
              description="The final state of the transaction."
            />
            <RecordItem
              label="HISTORY"
              title="When it happened"
              description="A connected history of important deal activity."
            />
          </div>
        </div>
      </section>

      {/* WHY TRUSTLAYER */}
      <section className="border-b border-[var(--tl-line)] bg-[var(--tl-bg-elevated)]">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[.8fr_1.2fr] lg:items-center lg:px-8">
          <div>
            <p className="tl-eyebrow">Why TrustLayer</p>

            <h2 className="mt-2 text-4xl font-black tracking-[-.035em] text-[var(--tl-ink)] sm:text-5xl">
              Transactions are more than payments.
            </h2>

            <p className="mt-5 max-w-xl text-sm leading-7 text-[var(--tl-muted)]">
              A transaction starts before money or assets move. The parties
              need to know what was agreed, what each side must commit, what
              must be delivered, and what happens when the deal concludes.
            </p>

            <p className="mt-5 text-lg font-semibold text-[var(--tl-ink)]">
              The transaction has rules.{" "}
              <span className="text-[var(--tl-emerald)]">
                TrustLayer keeps them connected.
              </span>
            </p>
          </div>

          <div className="overflow-hidden rounded-[28px] border border-[var(--tl-line)] bg-[var(--tl-card)] p-3">
            <Image
              src="/trustlayer-integrity-layers.png"
              alt="TrustLayer transaction layers connecting participants, agreement, assets, work, outcome, and record"
              width={950}
              height={520}
              className="h-auto w-full rounded-[20px]"
            />
          </div>
        </div>
      </section>

      {/* WHO USES TRUSTLAYER */}
      <section className="border-y border-[var(--tl-line)] bg-[var(--tl-bg-elevated)]">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <p className="tl-eyebrow">Who uses TrustLayer</p>

          <h2 className="mt-2 max-w-3xl text-4xl font-black tracking-[-.035em] text-[var(--tl-ink)] sm:text-5xl">
            Structured deals for people and businesses.
          </h2>

          <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--tl-muted)]">
            Whether you are paying for work, selling goods, exchanging assets,
            or coordinating a business transaction, the deal should be clear
            to everyone involved.
          </p>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            <AudienceCard
              icon={<WalletCards size={20} />}
              title="Buyers"
              headline="Know what you are committing to."
              text="Agree on the terms, commit the agreed asset, track delivery, and follow the settlement conditions attached to the deal."
              flow="AGREE → COMMIT → REVIEW → OUTCOME"
              exception="DEFINED RELEASE / CANCELLATION PATHS"
            />

            <AudienceCard
              icon={<HandCoins size={20} />}
              title="Sellers"
              headline="Don't deliver on a promise."
              text="See the transaction's agreed and funded state before committing your work, goods, or services."
              flow="AGREEMENT → COMMITMENT → DELIVERY"
              exception="DEFINED SETTLEMENT CONDITIONS"
            />

            <AudienceCard
              icon={<Users size={20} />}
              title="Exchange participants"
              headline="Commit both sides of the deal."
              text="Coordinate asset-for-asset transactions where each participant funds their own exchange leg under the shared agreement."
              flow="PARTY A + PARTY B → ATOMIC EXCHANGE"
              exception="CANCEL / RECLAIM UNDER THE RULES"
            />
          </div>
        </div>
      </section>

      {/* USE CASES */}
      <section className="border-b border-[var(--tl-line)]">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <p className="tl-eyebrow">Built for real trade</p>

          <h2 className="mt-2 max-w-3xl text-4xl font-black tracking-[-.035em] text-[var(--tl-ink)] sm:text-5xl">
            Where structured deals fit.
          </h2>

          <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--tl-muted)]">
            One transaction model across independent work, peer-to-peer trade,
            business agreements, and platforms that need structured settlement
            workflows.
          </p>

          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            <UseCaseCard
              image="/marketing/freelancer.jpg"
              imageAlt="Freelancer and client reviewing work on a laptop"
              chip="MILESTONES"
              title="Freelancers and contractors"
              text="A client and contractor agree on scope, deliverables, payment, and milestones. TrustLayer records the agreement and coordinates supported escrow and release actions."
            />

            <UseCaseCard
              image="/marketing/use-p2p.jpg"
              imageAlt="Seller preparing a package for a peer-to-peer order"
              chip="P2P"
              title="P2P commerce"
              text="Help people transact with clearer terms, verifiable funding, agreed conditions, and a structured settlement or cancellation process."
            />

            <UseCaseCard
              image="/marketing/use-b2b.jpg"
              imageAlt="Business team reviewing contracts and payment terms"
              chip="B2B"
              title="B2B transactions"
              text="Coordinate transactions tied to purchase agreements, delivery conditions, project milestones, contractual obligations, or asset exchanges."
            />

            <UseCaseCard
              image="/marketing/marketplace.jpg"
              imageAlt="Product team working on an ecommerce platform"
              chip="API / EMBED"
              title="Marketplaces and software platforms"
              text="Integrate structured deal and settlement workflows into an existing platform instead of building the entire transaction engine internally."
            />
          </div>
        </div>
      </section>

      {/* TECHNOLOGY / RAILS */}
      <section className="border-y border-[var(--tl-line)] bg-[var(--tl-bg-elevated)]">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2">
            {/* NON-CUSTODIAL */}
            <div className="rounded-[28px] border border-[var(--tl-line)] bg-[var(--tl-card)] p-7 sm:p-9">
              <p className="tl-eyebrow">Non-custodial by design</p>

              <h2 className="mt-2 text-3xl font-black tracking-tight text-[var(--tl-ink)]">
                Your wallet. Your authorization. No custody.
              </h2>

              <p className="mt-4 text-sm leading-7 text-[var(--tl-muted)]">
                Crypto settlement is live today on Solana. Participants
                authorize transactions with their own wallets. Assets are
                handled by the relevant on-chain settlement program, not held
                by TrustLayer in a company-controlled wallet.
              </p>

              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                <Mini
                  icon={<LockKeyhole size={17} />}
                  title="Wallet"
                  text="You authorize"
                />
                <Mini
                  icon={<ShieldCheck size={17} />}
                  title="Program"
                  text="Settlement executes"
                />
                <Mini
                  icon={<FileCheck2 size={17} />}
                  title="Record"
                  text="Outcome persists"
                />
              </div>
            </div>

            {/* RAILS */}
            <div className="rounded-[28px] border border-[var(--tl-line)] bg-[var(--tl-card)] p-7 sm:p-9">
              <p className="tl-eyebrow">Built beyond one payment rail</p>

              <h2 className="mt-2 text-3xl font-black tracking-tight text-[var(--tl-ink)]">
                One transaction engine. More ways to fund.
              </h2>

              <p className="mt-4 text-sm leading-7 text-[var(--tl-muted)]">
                TrustLayer separates the deal and settlement logic from the
                payment rail used to fund it. Solana crypto settlement is live
                today. Fiat rails are in development.
              </p>

              <div className="mt-7 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[var(--tl-emerald)]/25 bg-[var(--tl-emerald-soft)] p-4">
                  <div className="flex items-center gap-3">
                    <Image
                      src="/icons/solana.svg"
                      alt="Solana"
                      width={28}
                      height={28}
                      className="h-7 w-7"
                    />
                    <div>
                      <p className="font-bold text-[var(--tl-emerald)]">
                        Solana
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--tl-muted)]">
                        Live today
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--tl-gold)]/25 bg-[var(--tl-gold-soft)] p-4">
                  <div className="flex items-center gap-3">
                    <Image
                      src="/icons/fiat.svg"
                      alt="Fiat"
                      width={28}
                      height={28}
                      className="h-7 w-7"
                    />
                    <div>
                      <p className="font-bold text-[var(--tl-gold)]">
                        Fiat rails
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--tl-muted)]">
                        In development
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <p className="mt-4 text-xs leading-6 text-[var(--tl-muted)]">
                Funding routes and settlement networks are separate parts of
                the architecture. A supported route may help a participant
                obtain an asset, while the applicable settlement still
                executes through its designated network and rules.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* EARLY ACCESS */}
      <section className="border-t border-[var(--tl-line)] bg-[var(--tl-bg-elevated)]">
        <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
          <p className="tl-eyebrow">Early access</p>

          <h2 className="mt-2 text-3xl font-black tracking-tight text-[var(--tl-ink)] sm:text-4xl">
            Get notified when we open the next window.
          </h2>

          <p className="mt-5 text-xs leading-6 text-[var(--tl-muted)]">
            Solana Devnet live · Telegram bot live · Mainnet and early-access
            updates via waitlist
          </p>

          <WaitlistForm />

          <p className="mt-4 text-[11px] text-[var(--tl-muted)]">
            Prefer to start on devnet now?{" "}
            <Link
              href="/login"
              className="font-semibold text-[var(--tl-emerald)]"
            >
              Create a deal
            </Link>
            {" · "}
            <a
              href="https://t.me/TrustLayerEscrowBot"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[var(--tl-emerald)]"
            >
              Open Telegram bot
            </a>
            {" · "}
            <Link
              href="/developers"
              className="font-semibold text-[var(--tl-emerald)]"
            >
              Developers
            </Link>
          </p>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_50%_0%,rgba(16,185,129,.15),transparent_42%)]" />

        <div className="relative mx-auto max-w-4xl px-4 py-24 text-center sm:px-6">
          <p className="tl-eyebrow">Ready to create the deal?</p>

          <h2 className="mt-3 text-4xl font-black tracking-[-.045em] text-[var(--tl-ink)] sm:text-6xl">
            Your next transaction deserves more than a chat.
          </h2>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-[var(--tl-muted)]">
            Structure the deal before the transaction happens. Agree on the
            terms, define what each party commits, coordinate performance,
            and settle with a shared record of the outcome.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="tl-button tl-button-success px-6 py-3.5 text-base no-underline"
            >
              Create a deal <ArrowRight size={17} />
            </Link>

            <Link
              href="/developers"
              className="tl-button tl-button-secondary px-6 py-3.5 text-base no-underline"
            >
              Partner API docs
            </Link>
          </div>

          <p className="mt-5 text-xs text-[var(--tl-muted)]">
            Non-custodial crypto on Solana · Telegram bot live · Fiat rails in
            development
          </p>
        </div>
      </section>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* REUSABLE COMPONENTS                                                        */
/* -------------------------------------------------------------------------- */

function StepRow({
  number,
  title,
  description,
  tone = "emerald",
}: {
  number: string;
  title: string;
  description: string;
  tone?: "emerald" | "gold";
}) {
  const numberClass =
    tone === "gold"
      ? "border-[var(--tl-gold)]/30 bg-[var(--tl-gold-soft)] text-[var(--tl-gold)]"
      : "border-[var(--tl-emerald)]/30 bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]";

  return (
    <div className="flex gap-4 rounded-2xl border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] p-4">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-black ${numberClass}`}
      >
        {number}
      </div>

      <div>
        <p className="font-bold text-[var(--tl-ink)]">{title}</p>
        <p className="mt-1 text-xs leading-6 text-[var(--tl-muted)]">
          {description}
        </p>
      </div>
    </div>
  );
}

function OutcomePill({
  label,
  tone = "emerald",
}: {
  label: string;
  tone?: "emerald" | "gold";
}) {
  const cls =
    tone === "gold"
      ? "border-[var(--tl-gold)]/25 bg-[var(--tl-card)] text-[var(--tl-gold)]"
      : "border-[var(--tl-emerald)]/25 bg-[var(--tl-card)] text-[var(--tl-emerald)]";

  return (
    <span
      className={`rounded-full border px-3 py-1.5 text-[10px] font-bold ${cls}`}
    >
      {label}
    </span>
  );
}

function FlowPill({
  label,
  tone = "emerald",
}: {
  label: string;
  tone?: "emerald" | "gold";
}) {
  const cls =
    tone === "gold"
      ? "border-[var(--tl-gold)]/25 bg-[var(--tl-gold-soft)] text-[var(--tl-gold)]"
      : "border-[var(--tl-emerald)]/25 bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]";

  return (
    <span className={`rounded-lg border px-3 py-2 text-[10px] font-black ${cls}`}>
      {label}
    </span>
  );
}

function RecordItem({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-5">
      <p className="text-[10px] font-black tracking-[.14em] text-[var(--tl-emerald)]">
        {label}
      </p>

      <p className="mt-2 font-bold text-[var(--tl-ink)]">{title}</p>

      <p className="mt-2 text-xs leading-6 text-[var(--tl-muted)]">
        {description}
      </p>
    </div>
  );
}

function AudienceCard({
  icon,
  title,
  headline,
  text,
  flow,
  exception,
}: {
  icon: React.ReactNode;
  title: string;
  headline: string;
  text: string;
  flow: string;
  exception: string;
}) {
  return (
    <div className="rounded-[26px] border border-[var(--tl-line)] bg-[var(--tl-card)] p-6">
      <div className="tl-icon">{icon}</div>

      <p className="mt-5 text-xs font-bold uppercase tracking-[.14em] text-[var(--tl-muted)]">
        {title}
      </p>

      <h3 className="mt-2 text-2xl font-black tracking-tight text-[var(--tl-ink)]">
        {headline}
      </h3>

      <p className="mt-3 text-sm leading-6 text-[var(--tl-muted)]">{text}</p>

      <div className="mt-6 rounded-xl border border-[var(--tl-emerald)]/20 bg-[var(--tl-emerald-soft)] px-3 py-3 text-center text-[10px] font-black leading-5 tracking-wide text-[var(--tl-emerald)]">
        {flow}
      </div>

      <div className="mt-2 rounded-xl border border-[var(--tl-gold)]/20 bg-[var(--tl-gold-soft)] px-3 py-3 text-center text-[10px] font-black leading-5 tracking-wide text-[var(--tl-gold)]">
        {exception}
      </div>
    </div>
  );
}

function UseCaseCard({
  image,
  imageAlt,
  chip,
  title,
  text,
}: {
  image: string;
  imageAlt: string;
  chip: string;
  title: string;
  text: string;
}) {
  return (
    <article className="overflow-hidden rounded-[26px] border border-[var(--tl-line)] bg-[var(--tl-card)]">
      <div className="relative aspect-[16/10] overflow-hidden bg-[var(--tl-bg-elevated)]">
        <Image
          src={image}
          alt={imageAlt}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 100vw, 50vw"
        />

        <span className="absolute left-4 top-4 rounded-full border border-white/15 bg-[#05070a]/75 px-3 py-1 text-[10px] font-black tracking-wide text-[var(--tl-emerald)] backdrop-blur-md">
          {chip}
        </span>
      </div>

      <div className="p-6">
        <h3 className="text-xl font-black tracking-tight text-[var(--tl-ink)]">
          {title}
        </h3>

        <p className="mt-3 text-sm leading-6 text-[var(--tl-muted)]">{text}</p>
      </div>
    </article>
  );
}

function Mini({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] p-4">
      <div className="text-[var(--tl-emerald)]">{icon}</div>

      <p className="mt-3 text-sm font-bold text-[var(--tl-ink)]">{title}</p>

      <p className="mt-1 text-xs text-[var(--tl-muted)]">{text}</p>
    </div>
  );
}
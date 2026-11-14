import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Headphones,
  MessageSquare,
  PlayCircle,
  ShieldCheck,
} from "lucide-react";
import AuthenticatedShell from "@/components/layout/AuthenticatedShell";
import SupportForm from "@/components/support/SupportForm";
import SystemStatusPanel from "@/components/support/SystemStatusPanel";
import {
  SupportSearchProvider,
  SupportSearchInput,
  SupportCommonList,
} from "@/components/support/SupportCommonQuestions";

export default function SupportPage() {
  return (
    <AuthenticatedShell>
      <SupportSearchProvider>
        <main className="mx-auto max-w-[960px] px-4 py-7 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-[var(--tl-ink)]">
                Support
              </h1>
              <p className="mt-2 text-sm text-[var(--tl-muted)]">
                Get help, find answers, and stay informed.
              </p>
            </div>
            <a
              href="#new-ticket"
              className="tl-button tl-button-success w-fit shrink-0 no-underline"
            >
              New ticket
            </a>
          </div>

          <section className="mt-6 rounded-[22px] border border-[var(--tl-emerald)]/25 bg-[var(--tl-card)] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--tl-emerald)]/30 bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]">
                <Headphones size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-[var(--tl-ink)]">
                  How can we help you?
                </h2>
                <p className="mt-1 text-sm text-[var(--tl-muted)]">
                  Search our help center, browse common questions, or create a
                  support ticket.
                </p>
                <SupportSearchInput />
              </div>
            </div>
          </section>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <HubCard
              href="/faq"
              icon={<BookOpen size={18} />}
              title="Help Center"
              text="Browse guides and FAQs"
            />
            <HubCard
              href="#new-ticket"
              icon={<MessageSquare size={18} />}
              title="Contact Support"
              text="Get in touch with our team"
            />
            <HubCard
              href="#guides"
              icon={<PlayCircle size={18} />}
              title="Video Guides"
              text="Watch step-by-step tutorials"
              badge="Soon"
            />
            <HubCard
              href="#status"
              icon={<ShieldCheck size={18} />}
              title="System Status"
              text="Live platform & chain checks"
            />
          </div>

          <section
            id="guides"
            className="mt-5 scroll-mt-24 rounded-[18px] border border-dashed border-[var(--tl-line)] bg-[var(--tl-bg-elevated)]/50 p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--tl-line)] bg-[var(--tl-card)] text-[var(--tl-emerald)]">
                  <PlayCircle size={18} />
                </span>
                <div>
                  <p className="text-sm font-bold text-[var(--tl-ink)]">
                    Video guides
                  </p>
                  <p className="text-xs text-[var(--tl-muted)]">
                    Create deal · Fund escrow · Release / cancel · Dispute —
                    coming as short clips.
                  </p>
                </div>
              </div>
              <span className="rounded-full border border-[var(--tl-line)] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--tl-muted)]">
                Playlist reserved
              </span>
            </div>
          </section>

          <SupportCommonList />

          <div id="status" className="mt-8 scroll-mt-24">
            <SystemStatusPanel />
          </div>

          <section className="mt-10 rounded-[20px] border border-[var(--tl-line)] bg-[var(--tl-card)] p-5 sm:p-6">
            <h2 className="text-lg font-bold text-[var(--tl-ink)]">
              Message us directly
            </h2>
            <p className="mt-1 text-sm text-[var(--tl-muted)]">
              Prefer chat? Reach TrustLayer care on WhatsApp or Telegram. Include
              your deal code when the issue is about a specific transaction.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <a
                href={
                  process.env.NEXT_PUBLIC_SUPPORT_TELEGRAM_URL ||
                  "https://t.me/+d1S6hauPxcVmZjQ0"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] p-4 no-underline transition hover:border-[var(--tl-emerald)]/40"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2AABEE]/15 text-sm font-bold text-[#2AABEE]">
                  TG
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-[var(--tl-ink)]">
                    Telegram
                  </span>
                  <span className="block text-xs text-[var(--tl-muted)]">
                    {process.env.NEXT_PUBLIC_SUPPORT_TELEGRAM_LABEL ||
                      "@trustlayer_support"}
                  </span>
                </span>
              </a>
            </div>

          </section>

          <section id="new-ticket" className="mt-10 scroll-mt-24">
            <h2 className="text-lg font-bold text-[var(--tl-ink)]">
              Contact Support
            </h2>
            <p className="mt-1 text-sm text-[var(--tl-muted)]">
              Tell us what happened. Include a deal code when the issue is about
              a specific transaction.
            </p>
            <div className="mt-4 rounded-[20px] border border-[var(--tl-line)] bg-[var(--tl-card)] p-5 sm:p-6">
              <SupportForm />
            </div>
            <p className="mt-3 text-[11px] text-[var(--tl-muted)]">
              Never send your wallet seed phrase, private key, password, or
              recovery code.
            </p>
          </section>
        </main>
      </SupportSearchProvider>
    </AuthenticatedShell>
  );
}

function HubCard({
  href,
  icon,
  title,
  text,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  text: string;
  badge?: string;
}) {
  const inner = (
    <>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--tl-emerald)]/25 bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-bold text-[var(--tl-ink)]">{title}</span>
          {badge && (
            <span className="rounded-full border border-[var(--tl-line)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--tl-muted)]">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-[var(--tl-muted)]">{text}</span>
      </span>
      <ArrowRight size={16} className="shrink-0 text-[var(--tl-muted)]" />
    </>
  );

  if (href.startsWith("#")) {
    return (
      <a
        href={href}
        className="flex items-center gap-3 rounded-[18px] border border-[var(--tl-line)] bg-[var(--tl-card)] p-4 no-underline transition hover:border-[var(--tl-emerald)]/30 hover:bg-white/[.02]"
      >
        {inner}
      </a>
    );
  }

  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-[18px] border border-[var(--tl-line)] bg-[var(--tl-card)] p-4 no-underline transition hover:border-[var(--tl-emerald)]/30 hover:bg-white/[.02]"
    >
      {inner}
    </Link>
  );
}
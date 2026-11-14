"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { ArrowLeft, Mail, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/db/supabase-browser";
import ClaimInviteOnAuth from "@/components/auth/ClaimInviteOnAuth";
import ClaimBotOnAuth from "@/components/auth/ClaimBotOnAuth";
import ClaimPartnerOnAuth from "@/components/auth/ClaimPartnerOnAuth";
import ClaimPartnerInviteOnAuth from "@/components/auth/ClaimPartnerInviteOnAuth";

const INVITE_KEY = "tl_invite_token";
const BOT_CLAIM_KEY = "tl_bot_claim_token";
const BOT_NEXT_KEY = "tl_bot_claim_next";
const PARTNER_CLAIM_KEY = "tl_partner_claim_token";
const PARTNER_NEXT_KEY = "tl_partner_claim_next";
const PARTNER_INVITE_KEY = "tl_partner_invite_token";

function safeNextPath(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  if (
    raw === "/partner" ||
    raw.startsWith("/partner/") ||
    raw.startsWith("/deals/") ||
    raw.startsWith("/dashboard") ||
    raw.startsWith("/developers") ||
    raw.startsWith("/profile") ||
    raw.startsWith("/activity") ||
    raw.startsWith("/support") ||
    raw.startsWith("/admin")
  ) {
    return raw;
  }
  return null;
}

function LoginForm() {
  const supabase = createSupabaseBrowserClient();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const invite = search.get("invite");
    if (invite) {
      try {
        sessionStorage.setItem(INVITE_KEY, invite);
      } catch {
        /* ignore */
      }
    }
    const botClaim = search.get("bot_claim");
    if (botClaim) {
      try {
        sessionStorage.setItem(BOT_CLAIM_KEY, botClaim);
        const next = search.get("next");
        if (next && next.startsWith("/")) {
          sessionStorage.setItem(BOT_NEXT_KEY, next);
        }
      } catch {
        /* ignore */
      }
    }
    const partnerClaim = search.get("partner_claim");
    if (partnerClaim) {
      try {
        sessionStorage.setItem(PARTNER_CLAIM_KEY, partnerClaim);
        const next = search.get("next");
        if (next && next.startsWith("/")) {
          sessionStorage.setItem(PARTNER_NEXT_KEY, next);
        }
      } catch {
        /* ignore */
      }
    }
    const partnerInvite = search.get("partner_invite");
    if (partnerInvite) {
      try {
        sessionStorage.setItem(PARTNER_INVITE_KEY, partnerInvite);
      } catch {
        /* ignore */
      }
    }
  }, [search]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setAuthenticated(Boolean(data.session?.user));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(Boolean(session?.user));
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase.auth]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    let invite: string | null = search.get("invite");
    if (!invite) {
      try {
        invite = sessionStorage.getItem(INVITE_KEY);
      } catch {
        invite = null;
      }
    }

    let botClaim: string | null = search.get("bot_claim");
    let botNext: string | null = search.get("next");
    if (!botClaim) {
      try {
        botClaim = sessionStorage.getItem(BOT_CLAIM_KEY);
        botNext = botNext || sessionStorage.getItem(BOT_NEXT_KEY);
      } catch {
        botClaim = null;
      }
    }

    let partnerClaim: string | null = search.get("partner_claim");
    let partnerNext: string | null = search.get("next");
    if (!partnerClaim) {
      try {
        partnerClaim = sessionStorage.getItem(PARTNER_CLAIM_KEY);
        partnerNext = partnerNext || sessionStorage.getItem(PARTNER_NEXT_KEY);
      } catch {
        partnerClaim = null;
      }
    }

    let hasPartnerInvite = !!search.get("partner_invite");
    if (!hasPartnerInvite) {
      try {
        hasPartnerInvite = !!sessionStorage.getItem(PARTNER_INVITE_KEY);
      } catch {
        hasPartnerInvite = false;
      }
    }

    let next = "/dashboard";
    if (invite) {
      next = `/dashboard?invite=${encodeURIComponent(invite)}`;
    } else if (botClaim) {
      const q = new URLSearchParams();
      q.set("bot_claim", botClaim);
      if (botNext && botNext.startsWith("/")) q.set("next", botNext);
      next = `/dashboard?${q.toString()}`;
    } else if (partnerClaim) {
      const q = new URLSearchParams();
      q.set("partner_claim", partnerClaim);
      if (partnerNext && partnerNext.startsWith("/")) q.set("next", partnerNext);
      next = `/dashboard?${q.toString()}`;
    } else if (hasPartnerInvite) {
      next = "/partner";
    } else {
      const requested = safeNextPath(search.get("next"));
      if (requested) next = requested;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    setLoading(false);
    setMessage(
      error?.message || "Check your email for your TrustLayer login link."
    );
  }

  const partnerConsoleHint =
    safeNextPath(search.get("next")) === "/partner" ||
    !!safeNextPath(search.get("next"))?.startsWith("/partner/") ||
    !!search.get("partner_invite");

  return (
    <>
      <ClaimInviteOnAuth isAuthenticated={authenticated} />
      <ClaimBotOnAuth isAuthenticated={authenticated} />
      <ClaimPartnerOnAuth isAuthenticated={authenticated} />
      <ClaimPartnerInviteOnAuth isAuthenticated={authenticated} />
      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--tl-muted)] no-underline"
          >
            <ArrowLeft size={15} />
            Back to TrustLayer
          </Link>

          <div className="tl-card mt-5 p-7 sm:p-9">
            <div className="tl-icon">
              <ShieldCheck size={19} />
            </div>
            <h1 className="mt-6 text-3xl font-black tracking-tight">
              Welcome back.
            </h1>
            <p className="mt-2 text-sm leading-6 text-[var(--tl-muted)]">
              Use your email to receive a secure sign-in link. No password to
              remember.
            </p>
            {search.get("invite") && (
              <p className="mt-3 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] px-3 py-2 text-xs text-[var(--tl-muted)]">
                You opened a deal invitation. After you sign in, we will link
                the deal to this account.
              </p>
            )}
            {search.get("bot_claim") && (
              <p className="mt-3 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] px-3 py-2 text-xs text-[var(--tl-muted)]">
                You opened a Telegram deal link. After you sign in with email,
                those deals will appear on your dashboard.
              </p>
            )}
            {search.get("partner_claim") && (
              <p className="mt-3 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] px-3 py-2 text-xs text-[var(--tl-muted)]">
                You opened a partner deal link. After you sign in, that deal will
                be attached to this account.
              </p>
            )}
            {partnerConsoleHint && (
              <p className="mt-3 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] px-3 py-2 text-xs text-[var(--tl-muted)]">
                Partner Console invite. After you sign in, you will join the
                partner workspace (and may be limited to console-only access).
              </p>
            )}

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              <label className="block text-sm font-bold" htmlFor="email">
                Email address
              </label>
              <div className="relative">
                <Mail
                  size={17}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--tl-muted)]"
                />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full py-3.5 pl-11 pr-4"
                  placeholder="you@example.com"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="tl-button tl-button-primary w-full disabled:opacity-50"
              >
                {loading ? "Sending secure link…" : "Send secure login link"}
              </button>
            </form>

            {message && (
              <div className="mt-4 rounded-2xl bg-[var(--tl-emerald-soft)] p-4 text-sm font-medium text-[var(--tl-emerald)]">
                {message}
              </div>
            )}
          </div>

          <p className="mt-5 text-center text-xs leading-5 text-[var(--tl-muted)]">
            TrustLayer is designed around agreements, verified settlement state
            and identity-aware access.
          </p>
        </div>
      </main>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">(
    "idle"
  );
  const [message, setMessage] = useState("");
  const [showModal, setShowModal] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setStatus("err");
        setMessage(body.error || "Unable to join the list.");
        return;
      }
      setEmail("");
      setStatus("ok");
      setShowModal(true);
    } catch {
      setStatus("err");
      setMessage("Network error. Try again.");
    } finally {
      setStatus((s) => (s === "loading" ? "idle" : s));
    }
  }

  function closeModal() {
    setShowModal(false);
    setStatus("idle");
  }

  return (
    <>
      <form
        onSubmit={onSubmit}
        className="mx-auto mt-8 flex w-full max-w-xl flex-col gap-3 sm:flex-row sm:items-stretch"
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          className="min-h-[52px] flex-1 rounded-2xl border border-[var(--tl-line)] bg-[var(--tl-card)] px-4 text-sm text-[var(--tl-ink)] outline-none placeholder:text-[var(--tl-muted)] focus:border-[var(--tl-emerald)]/50"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="tl-button tl-button-success min-h-[52px] shrink-0 px-6 disabled:opacity-50"
        >
          {status === "loading" ? "Joining…" : "Join early access"}
        </button>
      </form>

      {status === "err" && message && (
        <p className="mt-3 text-center text-sm text-[var(--tl-danger)]">
          {message}
        </p>
      )}

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="waitlist-ok-title"
          onClick={closeModal}
        >
          <div
            className="relative w-full max-w-md rounded-3xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-8 shadow-[0_24px_80px_rgba(0,0,0,.55)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeModal}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-[var(--tl-muted)] hover:bg-[var(--tl-bg-elevated)] hover:text-[var(--tl-ink)]"
              aria-label="Close"
            >
              <X size={18} />
            </button>

            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]">
              <CheckCircle2 size={24} />
            </div>
            <h3
              id="waitlist-ok-title"
              className="mt-5 text-xl font-black tracking-tight text-[var(--tl-ink)]"
            >
              You&apos;re on the list
            </h3>
            <p className="mt-3 text-sm leading-6 text-[var(--tl-muted)]">
              We&apos;ll email you when <strong className="text-[var(--tl-ink)]">mainnet</strong> opens
              and when early-access fee windows start. No tokens. No points farm.
            </p>
            <p className="mt-3 text-sm leading-6 text-[var(--tl-muted)]">
              You can still use <strong className="text-[var(--tl-ink)]">devnet</strong> now —
              sign in or open the Telegram bot and practice real deal flows with
              test funds.
            </p>
            <button
              type="button"
              onClick={closeModal}
              className="tl-button tl-button-success mt-6 w-full"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
"use client";

import { useState } from "react";

export type CounterpartyResolved = {
  mode: "registered" | "invite";
  userId?: string | null;
  username?: string | null;
  email?: string | null;
  displayLabel: string;
};

/**
 * Lookup registered user OR prepare invite by @username / email / telegram @.
 * Registered → seat profiles.id (no mandatory share link).
 * Invite → pending party + shareable claim link after create.
 */
export default function CounterpartyField({
  valueLabel,
  onResolved,
}: {
  valueLabel?: string;
  onResolved: (value: CounterpartyResolved | null) => void;
}) {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function lookup() {
    const raw = input.trim();
    if (!raw) {
      onResolved(null);
      setStatus("");
      return;
    }
    setLoading(true);
    setStatus("Looking up…");
    try {
      const res = await fetch(
        `/api/profile/lookup?q=${encodeURIComponent(raw)}`
      );
      const body = (await res.json()) as {
        error?: string;
        found?: boolean;
        userId?: string;
        username?: string | null;
        email?: string | null;
        registered?: boolean;
        inviteEmail?: string;
        inviteUsername?: string;
      };
      if (!res.ok) throw new Error(body.error || "Lookup failed.");

      if (body.found && body.userId) {
        const label = body.username
          ? `@${body.username}`
          : body.email || body.userId.slice(0, 8) + "…";
        onResolved({
          mode: "registered",
          userId: body.userId,
          username: body.username || null,
          email: body.email || null,
          displayLabel: label,
        });
        setStatus(
          `Found on TrustLayer: ${label}. They will see this deal under Deals after you create it — no invite link needed.`
        );
        return;
      }

      const isEmail =
        raw.includes("@") && raw.includes(".") && !raw.startsWith("@");
      const username = raw.replace(/^@/, "").toLowerCase();
      onResolved({
        mode: "invite",
        userId: null,
        username: isEmail ? null : username,
        email: isEmail ? raw.toLowerCase() : null,
        displayLabel: isEmail ? raw.toLowerCase() : `@${username}`,
      });
      setStatus(
        isEmail
          ? `Not registered yet — deal will create an email invite for ${raw.toLowerCase()}. Share the invite link after create.`
          : `Not registered yet — deal will reserve @${username} and give you a shareable invite link after create.`
      );
    } catch (e) {
      onResolved(null);
      setStatus(e instanceof Error ? e.message : "Lookup failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-2">
      <label className="block text-sm font-medium text-[var(--tl-ink)]">
        Counterparty
      </label>
      <p className="text-xs text-[var(--tl-muted)]">
        TrustLayer @username, email, user id, or Telegram @. If they are already
        on TrustLayer they see the deal on their dashboard. If not, you get an
        invite link after create.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="w-full rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] px-3 py-2 text-sm text-[var(--tl-ink)]"
          placeholder="@username or email@domain.com"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            onResolved(null);
            setStatus("");
          }}
          onBlur={() => void lookup()}
        />
        <button
          type="button"
          disabled={loading || !input.trim()}
          onClick={() => void lookup()}
          className="tl-button tl-button-secondary shrink-0 disabled:opacity-50"
        >
          {loading ? "…" : "Lookup"}
        </button>
      </div>
      {status && <p className="text-xs text-[var(--tl-muted)]">{status}</p>}
      {valueLabel && (
        <p className="text-xs font-medium text-[var(--tl-emerald)]">
          Selected: {valueLabel}
        </p>
      )}
    </section>
  );
}

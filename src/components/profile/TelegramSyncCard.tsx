"use client";

import { useState } from "react";

export default function TelegramSyncCard({
  connected,
  channelUserId,
  telegramUsername,
}: {
  connected: boolean;
  channelUserId?: string | null;
  telegramUsername?: string | null;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setError("");
    setToken(null);
    try {
      const r = await fetch("/api/profile/telegram-sync", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not create token.");
      setToken(d.token);
      setExpiresAt(d.expiresAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (connected) {
    return (
      <div className="text-sm text-emerald-900">
        <p className="font-semibold">Telegram connected</p>
        <p className="mt-1 text-xs">
          {telegramUsername ? `@${telegramUsername}` : "Linked"}
          {channelUserId ? ` · id ${channelUserId}` : ""}
        </p>
        <p className="mt-2 text-xs text-emerald-800/80">
          Bot deals and web deals share this TrustLayer account.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm font-semibold">Sync Telegram</p>
      <p className="mt-1 text-xs leading-5 text-[var(--tl-muted)]">
        1. Generate a one-time token here
        <br />
        2. Open your TrustLayer Telegram bot
        <br />
        3. Send <code className="rounded bg-white px-1">/sync TOKEN</code>
      </p>
      <button
        type="button"
        disabled={loading}
        onClick={() => void generate()}
    className="tl-button tl-button-primary mt-3 rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50"
      >
        {loading ? "Generating…" : "Generate sync token"}
      </button>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      {token ? (
        <div className="mt-3 space-y-2">
          <p className="break-all rounded-lg border border-[var(--tl-line)] bg-white px-3 py-2 font-mono text-xs">
            {token}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copy()}
              className="rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold"
            >
              {copied ? "Copied" : "Copy token"}
            </button>
            <span className="self-center text-[10px] text-[var(--tl-muted)]">
              Expires{" "}
              {expiresAt ? new Date(expiresAt).toLocaleTimeString() : "soon"} ·
              one use
            </span>
          </div>
          <p className="text-[11px] text-[var(--tl-muted)]">
            In Telegram: <code>/sync {token.slice(0, 8)}…</code>
          </p>
        </div>
      ) : null}
    </div>
  );
}

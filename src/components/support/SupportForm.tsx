"use client";

import { FormEvent, useState } from "react";

export default function SupportForm() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setStatus("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: String(fd.get("category") || "general"),
          dealCode: String(fd.get("dealCode") || "").trim(),
          subject: String(fd.get("subject") || "").trim(),
          message: String(fd.get("message") || "").trim(),
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Unable to send.");
      setStatus("Request received. We’ll follow up when we can.");
      e.currentTarget.reset();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Unable to send.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "mt-1.5 w-full rounded-xl border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] px-3 py-2.5 text-sm text-[var(--tl-ink)] outline-none placeholder:text-[var(--tl-muted)] focus:border-[var(--tl-emerald)]/40";

  return (
    <form onSubmit={onSubmit}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--tl-muted)]">
        Support request
      </p>
      <h3 className="mt-1 text-xl font-bold text-[var(--tl-ink)]">
        Tell us what happened
      </h3>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-bold text-[var(--tl-muted)]">
          Category
          <select name="category" className={field} defaultValue="general">
            <option value="general">General inquiry</option>
            <option value="deal">Deal issue</option>
            <option value="settlement">Settlement issue</option>
            <option value="verification">Verification</option>
            <option value="account">Account & security</option>
            <option value="technical">Technical issue</option>
          </select>
        </label>
        <label className="block text-xs font-bold text-[var(--tl-muted)]">
          Deal code
          <input
            name="dealCode"
            placeholder="Optional · TL-..."
            className={field}
          />
        </label>
      </div>

      <label className="mt-4 block text-xs font-bold text-[var(--tl-muted)]">
        Subject
        <input
          required
          name="subject"
          maxLength={160}
          placeholder="Briefly describe the issue"
          className={field}
        />
      </label>

      <label className="mt-4 block text-xs font-bold text-[var(--tl-muted)]">
        Message
        <textarea
          required
          name="message"
          maxLength={5000}
          rows={6}
          placeholder="Give us the details…"
          className={field}
        />
      </label>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p
          className={`text-xs ${
            status.includes("received")
              ? "text-[var(--tl-emerald)]"
              : status
                ? "text-[var(--tl-danger)]"
                : "text-[var(--tl-muted)]"
          }`}
        >
          {status || " "}
        </p>
        <button
          type="submit"
          disabled={busy}
          className="tl-button tl-button-success disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send to TrustLayer support"}
        </button>
      </div>
    </form>
  );
}
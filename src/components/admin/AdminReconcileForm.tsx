"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminReconcileForm() {
  const router = useRouter();
  const [disputeId, setDisputeId] = useState("");
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function submit() {
    setBusy(true);
    setMsg("");
    setErr("");
    const id = disputeId.trim();
    const sig = signature.trim();
    if (!id || sig.length < 64) {
      setErr("Dispute id and a full Solana signature are required.");
      setBusy(false);
      return;
    }
    const r = await fetch(`/api/admin/disputes/${id}/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signature: sig }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setErr(d.error || "Reconcile failed.");
      return;
    }
    setMsg(
      d.message ||
        `Synced. Action: ${d.action || d.terminalAction || "ok"}`
    );
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm font-semibold">
        Dispute id (UUID)
        <input
          className="mt-2 w-full rounded-xl border border-[var(--tl-line)] px-4 py-3 font-mono text-sm"
          value={disputeId}
          onChange={(e) => setDisputeId(e.target.value.trim())}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        />
      </label>
      <label className="block text-sm font-semibold">
        Solana transaction signature
        <input
          className="mt-2 w-full rounded-xl border border-[var(--tl-line)] px-4 py-3 font-mono text-sm"
          value={signature}
          onChange={(e) => setSignature(e.target.value.trim())}
          placeholder="Base58 signature"
        />
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
    className="tl-button tl-button-primary rounded-xl px-5 py-3 text-sm font-bold disabled:opacity-50"
      >
        {busy ? "Reconciling…" : "Reconcile confirmed transaction"}
      </button>
      {msg ? (
        <p className="break-all text-sm text-green-700">{msg}</p>
      ) : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      <p className="text-xs text-[var(--tl-muted)]">
        Never sends a second on-chain transaction. Prefer opening the dispute
        detail when you have the link; this form is for recovery from the admin
        hub.
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function DraftDealActions({
  dealId,
  status,
}: {
  dealId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isDraft = String(status).toLowerCase() === "draft";

  if (!isDraft) return null;

  async function remove() {
    if (
      !window.confirm(
        "Discard this draft? It will be marked cancelled. You can create a new deal anytime. Drafts are never funded on-chain."
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    const r = await fetch(`/api/deals/${dealId}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setError(d.error || "Could not discard draft.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm text-amber-950">
        <span className="font-bold">Draft</span> — finish the agreement or
        discard it.
      </p>
      <Link
        href={`/deals/${dealId}`}
    className="tl-button tl-button-primary rounded-lg px-3 py-2 text-xs font-bold no-underline"
      >
        Continue deal
      </Link>
      <button
        type="button"
        disabled={busy}
        onClick={() => void remove()}
        className="rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-800 disabled:opacity-50"
      >
        {busy ? "Discarding…" : "Delete draft"}
      </button>
      {error ? <p className="w-full text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

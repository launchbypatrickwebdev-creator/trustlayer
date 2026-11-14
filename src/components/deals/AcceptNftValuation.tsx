"use client";

import { useState } from "react";

type Leg = {
  legIndex: number;
  assetType?: string;
  assetCode?: string;
  nftValuationUsd?: string | null;
  nftValuationSol?: string | null;
  acceptedAt?: string | null;
};

export default function AcceptNftValuation({
  dealId,
  legs,
}: {
  dealId: string;
  legs: Leg[];
}) {
  const nftLegs = (legs || []).filter(
    (l) =>
      String(l.assetType || "").toLowerCase() === "nft" ||
      String(l.assetCode || "").toUpperCase() === "NFT"
  );
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  if (nftLegs.length === 0) return null;

  async function accept(legIndex: number) {
    setBusy(legIndex);
    setMsg("");
    try {
      const res = await fetch("/api/crypto/ax/accept-valuation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, legIndex }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Accept failed");
      setMsg(
        data.alreadyAccepted
          ? `Leg ${legIndex} already accepted`
          : `Leg ${legIndex} valuation accepted`
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Accept failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h3 className="text-sm font-semibold text-amber-900">
        NFT valuation acceptance
      </h3>
      <p className="mt-1 text-xs text-amber-800">
        Both parties should accept the agreed USD valuation before on-chain
        create. Fee is 2% of USD valuation (clamped 0.00001–10 SOL). At fund you
        lock 1.5× fee; the reserve is refunded on release.
      </p>
      <ul className="mt-3 space-y-2">
        {nftLegs.map((l) => (
          <li
            key={l.legIndex}
            className="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <span>
              Leg {l.legIndex} · valuation{" "}
              <strong>
                {l.nftValuationUsd
                  ? `$${l.nftValuationUsd}`
                  : l.nftValuationSol
                    ? `${l.nftValuationSol} SOL (legacy)`
                    : "—"}
              </strong>
              {l.acceptedAt ? (
                <span className="ml-2 text-xs text-green-700">accepted</span>
              ) : null}
            </span>
            {!l.acceptedAt && (
              <button
                type="button"
                disabled={busy === l.legIndex}
                onClick={() => accept(l.legIndex)}
                className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {busy === l.legIndex ? "…" : "Accept valuation"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {msg && <p className="mt-2 text-xs text-gray-700">{msg}</p>}
    </div>
  );
}

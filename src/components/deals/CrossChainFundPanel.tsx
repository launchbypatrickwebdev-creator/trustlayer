"use client";

/**
 * Aurora Intents Deposits — bring funds from another network into the user's
 * Solana wallet, then they still sign TrustLayer fund (non-custodial).
 */

import { useCallback, useEffect, useMemo, useState } from "react";

type SourceToken = {
  assetId: string;
  symbol?: string;
  blockchain?: string;
  chain?: string;
  decimals?: number;
  name?: string;
};

type Order = {
  id: string;
  depositAddress?: string | null;
  depositMemo?: string | null;
  depositAddressAndMemo?: string | null;
  sourceAssetId?: string;
  sourceAmount?: string;
  destinationAsset?: string;
  recipient?: string;
  expectedAmount?: string | null;
  expiresAt?: string | null;
  provider?: string;
};

type Status = {
  id: string;
  providerStatus?: string;
  verificationStatus?: string;
  fundingStatus?: string;
  destinationTxSignature?: string | null;
  failureReason?: string | null;
};

type Props = {
  dealId: string;
  /** SOL | USDC | USDT — what TrustLayer needs on Solana */
  destinationAsset: string;
  /** Ax leg 0 | 1; omit for 1-leg escrow */
  legIndex?: 0 | 1;
  className?: string;
};

function flattenTokens(payload: unknown): SourceToken[] {
  const out: SourceToken[] = [];
  const seen = new Set<string>();
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      v.forEach(visit);
      return;
    }
    const o = v as Record<string, unknown>;
    const id = String(o.assetId ?? o.asset_id ?? "").trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push({
        assetId: id,
        symbol:
          String(o.symbol ?? o.ticker ?? o.code ?? "").toUpperCase() ||
          undefined,
        blockchain:
          String(o.blockchain ?? o.chain ?? o.network ?? "").toLowerCase() ||
          undefined,
        chain:
          String(o.chain ?? o.blockchain ?? "").toLowerCase() || undefined,
        decimals:
          typeof o.decimals === "number"
            ? o.decimals
            : Number.isFinite(Number(o.decimals))
              ? Number(o.decimals)
              : undefined,
        name: o.name ? String(o.name) : undefined,
      });
    }
    for (const x of Object.values(o)) visit(x);
  };
  visit(payload);
  return out.sort((a, b) =>
    `${a.blockchain || ""}${a.symbol || ""}`.localeCompare(
      `${b.blockchain || ""}${b.symbol || ""}`
    )
  );
}

function toBaseUnits(human: string, decimals: number): string | null {
  const t = human.trim();
  if (!t || !/^\d+(\.\d+)?$/.test(t)) return null;
  const [w, f = ""] = t.split(".");
  if (f.length > decimals) return null;
  const frac = f.padEnd(decimals, "0");
  const raw = `${w}${frac}`.replace(/^0+/, "") || "0";
  return raw;
}

export default function CrossChainFundPanel({
  dealId,
  destinationAsset,
  legIndex,
  className = "",
}: Props) {
  const dest = String(destinationAsset || "USDC").toUpperCase();
  const [open, setOpen] = useState(false);
  const [tokens, setTokens] = useState<SourceToken[]>([]);
  const [loadErr, setLoadErr] = useState("");
  const [loadingAssets, setLoadingAssets] = useState(false);

  const [sourceAssetId, setSourceAssetId] = useState("");
  const [humanAmount, setHumanAmount] = useState("");
  const [refundTo, setRefundTo] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const selected = useMemo(
    () => tokens.find((t) => t.assetId === sourceAssetId) || null,
    [tokens, sourceAssetId]
  );

  const loadAssets = useCallback(async () => {
    setLoadingAssets(true);
    setLoadErr("");
    try {
      const r = await fetch("/api/cross-chain/assets", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to load Aurora assets");
      setTokens(flattenTokens(j.sourceAssets));
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Assets unavailable");
    } finally {
      setLoadingAssets(false);
    }
  }, []);

  useEffect(() => {
    if (open && tokens.length === 0 && !loadingAssets) void loadAssets();
  }, [open, tokens.length, loadingAssets, loadAssets]);

  const refresh = useCallback(async () => {
    if (!order?.id) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        `/api/cross-chain/status?orderId=${encodeURIComponent(order.id)}`,
        { cache: "no-store" }
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Status check failed");
      setStatus(j.order);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Status check failed");
    } finally {
      setBusy(false);
    }
  }, [order?.id]);

  useEffect(() => {
    if (!order?.id) return;
    const t = setInterval(() => void refresh(), 12000);
    return () => clearInterval(t);
  }, [order?.id, refresh]);

  async function createQuote() {
    setBusy(true);
    setError("");
    setOrder(null);
    setStatus(null);
    try {
      const decimals = selected?.decimals ?? 6;
      const base = toBaseUnits(humanAmount, decimals);
      if (!base || base === "0") {
        throw new Error("Enter a valid source amount.");
      }
      if (!sourceAssetId) throw new Error("Select a source asset.");
      if (!refundTo.trim() || refundTo.trim().length < 8) {
        throw new Error("Enter a source-chain refund address.");
      }
      const r = await fetch("/api/cross-chain/quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          dealId,
          sourceAssetId,
          sourceAmount: base,
          refundTo: refundTo.trim(),
          sourceChain: selected?.blockchain || selected?.chain || "unknown",
          legIndex,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Quote failed");
      setOrder(j.order);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create quote.");
    } finally {
      setBusy(false);
    }
  }

  const depositAddr =
    order?.depositAddressAndMemo || order?.depositAddress || "";
  const ready =
    status?.fundingStatus === "asset_delivered" ||
    status?.verificationStatus === "verified";

  return (
    <section
      className={`rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-4 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-300">
            Cross-chain · Aurora Intents
          </p>
          <h3 className="mt-1 text-sm font-semibold text-[var(--tl-ink)]">
            Need {dest} on Solana from another network?
          </h3>
          <p className="mt-1 text-xs leading-5 text-[var(--tl-muted)]">
            Bridge into your Solana wallet, then sign TrustLayer fund. Aurora
            does not fund escrow for you.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100"
        >
          {open ? "Hide" : "Bring funds from another network"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-3 border-t border-cyan-500/20 pt-4">
          {loadErr && (
            <p className="text-sm text-red-500">
              {loadErr}{" "}
              <button
                type="button"
                className="underline"
                onClick={() => void loadAssets()}
              >
                Retry
              </button>
            </p>
          )}
          {loadingAssets && (
            <p className="text-xs text-[var(--tl-muted)]">
              Loading Aurora assets…
            </p>
          )}

          {!order && (
            <div className="grid gap-3">
              <label className="block text-xs font-medium">
                Source asset
                <select
                  value={sourceAssetId}
                  onChange={(e) => setSourceAssetId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] px-3 py-2 text-sm"
                >
                  <option value="">Select…</option>
                  {tokens.map((t) => (
                    <option key={t.assetId} value={t.assetId}>
                      {(t.blockchain || t.chain || "?").toUpperCase()} ·{" "}
                      {t.symbol || t.assetId.slice(0, 24)}
                    </option>
                  ))}
                </select>
              </label>
              {selected && (
                <p className="break-all font-mono text-[10px] text-[var(--tl-muted)]">
                  {selected.assetId}
                </p>
              )}
              <label className="block text-xs font-medium">
                Amount ({selected?.symbol || "source"})
                <input
                  value={humanAmount}
                  onChange={(e) => setHumanAmount(e.target.value)}
                  placeholder="e.g. 25.5"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-medium">
                Refund address (source chain)
                <input
                  value={refundTo}
                  onChange={(e) => setRefundTo(e.target.value)}
                  placeholder="Address on the source network if deposit fails"
                  className="mt-1 w-full rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] px-3 py-2 font-mono text-xs"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void createQuote()}
                className="rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-bold text-[#042f2e] disabled:opacity-50"
              >
                {busy
                  ? "Getting quote…"
                  : `Get deposit address → ${dest} on Solana`}
              </button>
            </div>
          )}

          {order && (
            <div className="space-y-3">
              <div className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-3">
                <p className="text-[10px] font-bold uppercase text-[var(--tl-muted)]">
                  Send source funds to
                </p>
                <p className="mt-1 break-all font-mono text-xs text-[var(--tl-ink)]">
                  {depositAddr}
                </p>
                {order.depositMemo && (
                  <p className="mt-1 text-xs">
                    Memo:{" "}
                    <span className="font-mono">{order.depositMemo}</span>
                  </p>
                )}
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-cyan-300 underline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(String(depositAddr));
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  {copied ? "Copied" : "Copy address"}
                </button>
                {order.expiresAt && (
                  <p className="mt-2 text-[10px] text-[var(--tl-muted)]">
                    Quote expires {new Date(order.expiresAt).toLocaleString()}
                  </p>
                )}
                <p className="mt-1 text-[10px] text-[var(--tl-muted)]">
                  Destination: {order.destinationAsset || dest} →{" "}
                  <span className="font-mono">{order.recipient}</span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void refresh()}
                  className="rounded-lg border border-[var(--tl-line)] px-3 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  {busy ? "Checking…" : "Refresh status"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOrder(null);
                    setStatus(null);
                  }}
                  className="text-xs text-[var(--tl-muted)] underline"
                >
                  New quote
                </button>
              </div>

              {status && (
                <div className="rounded-lg border border-[var(--tl-line)] p-3 text-xs">
                  <p>
                    Provider:{" "}
                    <strong>{status.providerStatus || "—"}</strong>
                  </p>
                  <p>
                    Verification:{" "}
                    <strong>{status.verificationStatus || "—"}</strong>
                  </p>
                  <p>
                    Funding: <strong>{status.fundingStatus || "—"}</strong>
                  </p>
                  {status.destinationTxSignature && (
                    <a
                      className="mt-1 block break-all text-cyan-300 underline"
                      href={`https://explorer.solana.com/tx/${status.destinationTxSignature}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Solana delivery tx
                    </a>
                  )}
                  {status.failureReason && (
                    <p className="mt-1 text-red-500">{status.failureReason}</p>
                  )}
                </div>
              )}

              {ready && (
                <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-200">
                  Funds received in your Solana wallet. Use{" "}
                  <span className="underline">Fund escrow / Fund leg</span>{" "}
                  below to lock into TrustLayer (you must sign).
                </p>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      )}
    </section>
  );
}

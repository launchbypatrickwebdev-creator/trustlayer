"use client";

import TokenIcon from "@/components/TokenIcon";
import { useMemo, useState } from "react";
import { ChevronDown, WalletCards } from "lucide-react";

type WalletRow = {
  id: string;
  network: string;
  asset_code: string;
  address: string;
  is_primary: boolean;
  label?: string | null;
  provider?: string | null;
};

/** Chain networks. Only Solana is live; Base / Ethereum reserved for later. */
const NETWORKS = [
  { id: "solana", label: "Solana", live: true, clusterNote: "devnet / mainnet" },
  { id: "base", label: "Base", live: false, clusterNote: "coming soon" },
  { id: "ethereum", label: "Ethereum", live: false, clusterNote: "coming soon" },
] as const;

/** Solana signer apps shown in UI — extend this list as you add adapters. */
const PROVIDERS = [
  { id: "phantom", label: "Phantom" },
  { id: "solflare", label: "Solflare" },
  { id: "other", label: "Other Solana wallet" },
] as const;

/** Assets per network (Solana live set). */
const ASSETS_BY_NETWORK: Record<string, readonly string[]> = {
  solana: ["SOL", "USDC", "USDT"],
  base: ["ETH", "USDC"],
  ethereum: ["ETH", "USDC", "USDT"],
};

const ASSETS = ASSETS_BY_NETWORK.solana;

function shortAddr(a: string) {
  if (!a || a.length < 12) return a;
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

/**
 * Multi-wallet profile section.
 * One address can hold SOL + USDC + USDT (separate rows).
 * Different addresses (Phantom vs Solflare) can each hold all three assets.
 */
export default function WalletsSection({
  wallets: initialWallets,
  cluster,
}: {
  wallets: WalletRow[];
  cluster: string;
}) {
  const [open, setOpen] = useState(false);
  const [wallets, setWallets] = useState<WalletRow[]>(initialWallets);
  const [network, setNetwork] = useState<string>("solana");
  const [asset, setAsset] = useState<(typeof ASSETS)[number]>("SOL");
  const [address, setAddress] = useState("");
  const [provider, setProvider] = useState<string>("phantom");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const groups = useMemo(() => {
    const map = new Map<
      string,
      { address: string; label?: string | null; provider?: string | null; assets: WalletRow[] }
    >();
    for (const w of wallets) {
      const key = `${w.network}:${w.address}`;
      const g = map.get(key) || {
        address: w.address,
        label: w.label,
        provider: w.provider,
        assets: [] as WalletRow[],
      };
      g.assets.push(w);
      if (w.label) g.label = w.label;
      if (w.provider) g.provider = w.provider;
      map.set(key, g);
    }
    return Array.from(map.values());
  }, [wallets]);

  async function save() {
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch("/api/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetCode: asset,
          address: address.trim(),
          network: cluster,
          isPrimary: true,
          provider,
          label: label.trim() || null,
        }),
      });
      const body = (await res.json()) as { error?: string; wallet?: WalletRow };
      if (!res.ok) throw new Error(body.error || "Save failed.");
      setStatus(`Saved ${asset} on ${shortAddr(address.trim())}.`);
      setAddress("");
      // refresh list
      const list = await fetch("/api/wallets");
      const listBody = (await list.json()) as { wallets?: WalletRow[] };
      if (listBody.wallets) setWallets(listBody.wallets);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Unable to save wallet.");
    } finally {
      setBusy(false);
    }
  }

  async function removeWallet(id: string) {
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch(`/api/wallets?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Remove failed.");
      setWallets((prev) => prev.filter((w) => w.id !== id));
      setStatus("Removed.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Unable to remove.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="tl-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-6 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="tl-icon">
            <WalletCards size={18} />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--tl-muted)]">
              Wallets
            </p>
            <p className="mt-0.5 font-semibold text-[var(--tl-ink)]">
              Solana signers · {cluster}
            </p>
            <p className="mt-1 text-xs text-[var(--tl-muted)]">
              {groups.length === 0
                ? "No addresses linked yet"
                : `${groups.length} address${groups.length === 1 ? "" : "es"} · ${wallets.length} asset row${wallets.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
        <ChevronDown
          size={18}
          className={`text-[var(--tl-muted)] transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-[var(--tl-line)] px-6 pb-6 pt-4">
          <p className="text-sm leading-6 text-[var(--tl-muted)]">
            Link Phantom, Solflare, or another Solana signer today. One address
            can hold SOL, USDC, and USDT. Room is reserved for Base and Ethereum
            wallets when those rails go live — they appear in the network
            dropdown as coming soon.
          </p>

          {groups.length === 0 ? (
            <p className="text-sm text-[var(--tl-muted)]">
              No wallets linked yet. Add one below or use /linkwallet on
              Telegram.
            </p>
          ) : (
            <div className="space-y-3">
              {groups.map((g) => {
                const providerLabel =
                  PROVIDERS.find((p) => p.id === g.provider)?.label ||
                  g.provider ||
                  "Solana wallet";
                return (
                  <div
                    key={g.address}
                    className="rounded-xl border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] px-4 py-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-[var(--tl-ink)]">
                        {g.label || providerLabel}
                      </p>
                      <span className="rounded-full bg-[var(--tl-emerald-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--tl-emerald)]">
                        {providerLabel}
                      </span>
                    </div>
                    <p className="mt-1 break-all font-mono text-xs text-[var(--tl-muted)]">
                      {g.address}
                    </p>
                    <ul className="mt-2 space-y-1">
                      {g.assets.map((w) => (
                        <li
                          key={w.id}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="text-[var(--tl-ink)]">
                            <span className="inline-flex items-center gap-1"><TokenIcon code={w.asset_code} size={14} />{w.asset_code}</span>
                            {w.is_primary ? " · primary" : ""}
                          </span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void removeWallet(w.id)}
                            className="text-[var(--tl-danger)] hover:underline disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          <div className="rounded-xl border border-dashed border-[var(--tl-line)] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--tl-muted)]">
              Add / update wallet
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <select
                value={network}
                onChange={(e) => {
                  const n = e.target.value;
                  setNetwork(n);
                  const list = ASSETS_BY_NETWORK[n] || ASSETS_BY_NETWORK.solana;
                  setAsset(list[0] as (typeof ASSETS)[number]);
                }}
                className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] px-3 py-2 text-sm text-[var(--tl-ink)]"
              >
                {NETWORKS.map((n) => (
                  <option key={n.id} value={n.id} disabled={!n.live}>
                    {n.label}
                    {!n.live ? " (soon)" : ""}
                  </option>
                ))}
              </select>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                disabled={network !== "solana"}
                className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] px-3 py-2 text-sm text-[var(--tl-ink)] disabled:opacity-50"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <select
                value={asset}
                onChange={(e) =>
                  setAsset(e.target.value as (typeof ASSETS)[number])
                }
                disabled={network !== "solana"}
                className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] px-3 py-2 text-sm text-[var(--tl-ink)] disabled:opacity-50"
              >
                {(ASSETS_BY_NETWORK[network] || ASSETS).map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            {network !== "solana" && (
              <p className="mt-2 text-xs text-[var(--tl-muted)]">
                {network} wallets are not live yet — Solana only for now.
              </p>
            )}
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={
                network === "solana"
                  ? "Solana address (from Phantom / Solflare / …)"
                  : `${network} address (coming soon)`
              }
              disabled={network !== "solana"}
              className="mt-2 w-full rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] px-3 py-2 font-mono text-sm text-[var(--tl-ink)]"
            />
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Optional label (e.g. Phantom main)"
              className="mt-2 w-full rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] px-3 py-2 text-sm text-[var(--tl-ink)]"
            />
            <button
              type="button"
              disabled={busy || !address.trim()}
              onClick={() => void save()}
              className="tl-button tl-button-secondary mt-3 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save wallet"}
            </button>
            {status && (
              <p className="mt-2 text-xs text-[var(--tl-muted)]">{status}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

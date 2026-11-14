"use client";

import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import SolanaAxActions from "@/components/crypto/SolanaAxActions";
import CrossChainFundPanel from "@/components/deals/CrossChainFundPanel";
import TrustLayerWalletSelector from "@/components/crypto/TrustLayerWalletSelector";
import { useWallet } from "@solana/wallet-adapter-react";

type AxStatus = {
  role: "buyer" | "seller" | "observer";
  dealStatus?: string;
  onchainStatus: string;
  fundedA: boolean;
  fundedB: boolean;
  chainDealId: string | null;
  axPda: string | null;
  isAdmin?: boolean;
  canAuthoritySettle?: boolean;
  releaseAuthorityPubkey?: string | null;
  trustlayerAdmin?: string | null;
  createTx?: string | null;
  fundATx?: string | null;
  fundBTx?: string | null;
  releaseTx?: string | null;
  cancelTx?: string | null;
};

export default function AxSessionPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const dealId = String(params.id || "");
  const actionParam = (search.get("action") || "create").toLowerCase();

  // CRITICAL: authority must not fall through to create
  const action: "create" | "fund" | "release" | "authority" =
    actionParam === "fund"
      ? "fund"
      : actionParam === "release" || actionParam === "authority"
        ? actionParam === "authority"
          ? "authority"
          : "release"
        : "create";

  const leg = search.get("leg") === "1" ? 1 : 0;
  const { publicKey } = useWallet();

  const [meta, setMeta] = useState<AxStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `/api/crypto/ax/status?dealId=${encodeURIComponent(dealId)}${publicKey ? `&wallet=${encodeURIComponent(publicKey.toBase58())}` : ""}`
        );
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Failed to load Ax status");
        if (cancelled) return;
        setMeta({
          role: body.role,
          dealStatus: body.dealStatus || "",
          onchainStatus: body.onchainStatus,
          fundedA: Boolean(body.fundedA),
          fundedB: Boolean(body.fundedB),
          chainDealId: body.chainDealId,
          axPda: body.axPda,
          isAdmin: Boolean(body.isAdmin),
          canAuthoritySettle: Boolean(body.canAuthoritySettle),
          releaseAuthorityPubkey: body.releaseAuthorityPubkey || null,
          trustlayerAdmin:
            body.trustlayerAdmin || body.adminDefaultAuthority || null,
          createTx: body.createTx || null,
          fundATx: body.fundATx || null,
          fundBTx: body.fundBTx || null,
          releaseTx: body.releaseTx || null,
          cancelTx: body.cancelTx || null,
        });
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dealId, publicKey]);

  const wallet = publicKey?.toBase58() || "";
  const authorityPk = String(
    meta?.releaseAuthorityPubkey || meta?.trustlayerAdmin || ""
  ).trim();

  // Only the exact authority pubkey — not "logged-in admin with different key"
  const canRelease = Boolean(
    meta &&
      meta.fundedA &&
      meta.fundedB &&
      (meta.onchainStatus === "funded" ||
        meta.onchainStatus === "disputed" ||
        meta.canAuthoritySettle) &&
      wallet &&
      authorityPk.length >= 32 &&
      wallet === authorityPk
  );


  const agreementReady = [
    "accepted",
    "awaiting_payment",
    "funded",
    "disputed",
  ].includes(String(meta?.dealStatus || "").toLowerCase());
  const blockCreateFund =
    (action === "create" || action === "fund") && Boolean(meta) && !agreementReady;

  const title =
    action === "create"
      ? "Create Ax on-chain"
      : action === "fund"
        ? `Fund leg ${leg === 0 ? "A" : "B"}`
        : "Authority settle (Release / Cancel Ax)";

  const explorer = (sig: string) =>
    `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

  const txLinks: [string, string | null | undefined][] = [
    ["Create", meta?.createTx],
    ["Fund leg A", meta?.fundATx],
    ["Fund leg B", meta?.fundBTx],
    ["Release", meta?.releaseTx],
    ["Cancel", meta?.cancelTx],
  ];

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Link
        href={`/deals/${dealId}`}
        className="text-sm text-gray-500 hover:underline"
      >
        ← Back to deal
      </Link>
      <h1 className="mt-4 text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-gray-500">
        {action === "authority" || action === "release"
          ? "Connect the authority wallet. Release completes the swap; Cancel Ax returns both legs."
          : "Secure Ax session. After confirm you return to the deal page."}
      </p>

      <div className="mt-6 space-y-4 rounded-2xl border border-[var(--tl-line)] bg-white p-5 shadow-sm">
        <TrustLayerWalletSelector />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading && <p className="text-sm text-gray-500">Loading Ax status…</p>}
        {blockCreateFund && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Deal is not ready for crypto. The counterparty must accept the
            agreement before Create Ax or Fund. Status:{" "}
            {String(meta?.dealStatus || "unknown")}.
          </p>
        )}

        {!loading && meta && (action === "authority" || action === "release") && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
            <p>
              On-chain: <strong>{meta.onchainStatus}</strong> · A:
              {meta.fundedA ? "✓" : "–"} B:{meta.fundedB ? "✓" : "–"}
            </p>
            <p className="mt-1 break-all font-mono text-[10px]">
              Authority: {authorityPk || "(unset)"}
            </p>
            {wallet && (
              <p className="mt-1 break-all font-mono text-[10px]">
                Connected: {wallet}
                {canRelease ? " · authorized" : " · not the authority key"}
              </p>
            )}
          </div>
        )}

        {!loading && meta && (action === "authority" || action === "release") && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
            <p className="font-semibold">Authority settle link</p>
            <p className="mt-1 break-all font-mono text-[10px]">
              {typeof window !== "undefined"
                ? `${window.location.origin}/deals/${dealId}/ax?action=authority`
                : `/deals/${dealId}/ax?action=authority`}
            </p>
            <button
              type="button"
              className="mt-2 rounded-lg border border-amber-400 px-3 py-1.5 text-xs font-semibold"
              onClick={async () => {
                const u =
                  typeof window !== "undefined"
                    ? `${window.location.origin}/deals/${dealId}/ax?action=authority`
                    : `/deals/${dealId}/ax?action=authority`;
                try {
                  await navigator.clipboard.writeText(u);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {}
              }}
            >
              {copied ? "Copied" : "Copy settle link"}
            </button>
            <p className="mt-2 text-[11px] text-amber-900/80">
              Share with the authority key holder. They open the link and connect
              that wallet — no TrustLayer account required. Admin login alone does
              not authorize a custom authority deal.
            </p>
          </div>
        )}


        {!loading && meta && action === "fund" && (() => {
          const legs = (meta as { legs?: { leg_index?: number; asset_code?: string }[] })
            .legs;
          const legAsset =
            (legs &&
              legs.find((l) => Number(l.leg_index) === leg)?.asset_code) ||
            (leg === 0 ? "SOL" : "USDC");
          const code = String(legAsset).toUpperCase();
          if (!["SOL", "USDC", "USDT"].includes(code)) return null;
          return (
            <CrossChainFundPanel
              dealId={dealId}
              destinationAsset={code}
              legIndex={leg as 0 | 1}
              className="mb-4"
            />
          );
        })()}

        {!loading && meta && !blockCreateFund && (
          <SolanaAxActions
            dealId={dealId}
            role={meta.role}
            onchainStatus={
              meta.fundedA &&
              meta.fundedB &&
              meta.onchainStatus === "created_unfunded"
                ? "funded"
                : meta.onchainStatus
            }
            fundedA={meta.fundedA}
            fundedB={meta.fundedB}
            chainDealId={meta.chainDealId}
            axPda={meta.axPda}
            canRelease={canRelease}
            focusAction={
              action === "authority" || action === "release"
                ? "authority"
                : action
            }
            focusLeg={leg as 0 | 1}
            onStatusChange={() => router.push(`/deals/${dealId}`)}
          />
        )}

        {!loading && meta && (
          <div className="border-t border-gray-100 pt-3 text-xs">
            <p className="font-medium">On-chain transactions</p>
            <div className="mt-1 space-y-1">
              {txLinks
                .filter(([, sig]) => Boolean(sig))
                .map(([label, sig]) => (
                  <a
                    key={`${label}-${sig}`}
                    href={explorer(String(sig))}
                    target="_blank"
                    rel="noreferrer"
                    className="block break-all text-blue-600 underline"
                  >
                    {label}: {String(sig).slice(0, 28)}…
                  </a>
                ))}
              {!txLinks.some(([, sig]) => Boolean(sig)) && (
                <p className="text-gray-500">No signatures recorded yet.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
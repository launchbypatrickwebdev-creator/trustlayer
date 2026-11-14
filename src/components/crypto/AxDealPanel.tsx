"use client";

/**
 * Deal-page Ax chrome for parties:
 * - Create / Fund CTAs by role — only after agreement accepted (1-leg parity)
 * - Cancel unfunded / dispute / reclaim via SolanaAxActions
 * - On-chain tx links (read-only)
 * - Authority settle link share for parties; settle CTA only for admin/authority
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import SolanaAxActions from "@/components/crypto/SolanaAxActions";

type Status = {
  role: "buyer" | "seller" | "observer";
  dealStatus?: string;
  onchainStatus: string;
  fundedA: boolean;
  fundedB: boolean;
  chainDealId: string | null;
  axPda: string | null;
  isAdmin?: boolean;
  isAuthorityUser?: boolean;
  createTx?: string | null;
  fundATx?: string | null;
  fundBTx?: string | null;
  releaseTx?: string | null;
  cancelTx?: string | null;
};

function agreementAllowsOnchain(dealStatus?: string) {
  const ds = String(dealStatus || "").toLowerCase();
  return ["accepted", "awaiting_payment", "funded", "disputed"].includes(ds);
}

export default function AxDealPanel({ dealId }: { dealId: string }) {
  const [s, setS] = useState<Status | null>(null);
  const [err, setErr] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/crypto/ax/status?dealId=${encodeURIComponent(dealId)}`
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "status failed");
      setS({
        role: body.role,
        dealStatus: body.dealStatus || body.status || "",
        onchainStatus: body.onchainStatus,
        fundedA: Boolean(body.fundedA),
        fundedB: Boolean(body.fundedB),
        chainDealId: body.chainDealId,
        axPda: body.axPda,
        isAdmin: Boolean(body.isAdmin),
        isAuthorityUser: Boolean(body.isAuthorityUser),
        createTx: body.createTx || null,
        fundATx: body.fundATx || null,
        fundBTx: body.fundBTx || null,
        releaseTx: body.releaseTx || null,
        cancelTx: body.cancelTx || null,
      });
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load Ax status");
    }
  }, [dealId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!s) return <p className="text-sm text-gray-500">Loading Ax status…</p>;

  const st = s.onchainStatus;
  const created =
    st !== "not_created" && st !== "cancelled" && st !== "released";
  const bothFunded = s.fundedA && s.fundedB;
  const agreementReady = agreementAllowsOnchain(s.dealStatus);

  const showAuthorityCta =
    (s.isAdmin || s.isAuthorityUser) &&
    bothFunded &&
    (st === "funded" || st === "disputed");

  const links: [string, string | null | undefined][] = [
    ["Create", s.createTx],
    ["Fund leg A", s.fundATx],
    ["Fund leg B", s.fundBTx],
    ["Release", s.releaseTx],
    ["Cancel", s.cancelTx],
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {s.role === "buyer" && st === "not_created" && agreementReady && (
          <Link
            href={`/deals/${dealId}/ax?action=create`}
            className="rounded-lg border border-teal-500 px-4 py-2 text-sm font-medium text-teal-700"
          >
            Create Ax on-chain →
          </Link>
        )}
        {s.role === "buyer" && st === "not_created" && !agreementReady && (
          <p className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            Waiting for the counterparty to accept the agreement before Create
            Ax on-chain (same rule as 1-leg escrow). Status:{" "}
            {s.dealStatus || "pending"}.
          </p>
        )}
        {s.role === "buyer" &&
          agreementReady &&
          created &&
          !s.fundedA &&
          !bothFunded && (
            <Link
              href={`/deals/${dealId}/ax?action=fund&leg=0`}
              className="rounded-lg border border-teal-500 px-4 py-2 text-sm font-medium text-teal-700"
            >
              Fund leg A →
            </Link>
          )}
        {s.role === "seller" &&
          agreementReady &&
          created &&
          !s.fundedB &&
          !bothFunded && (
            <Link
              href={`/deals/${dealId}/ax?action=fund&leg=1`}
              className="rounded-lg border border-teal-500 px-4 py-2 text-sm font-medium text-teal-700"
            >
              Fund leg B →
            </Link>
          )}
        {(showAuthorityCta || bothFunded) && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                const path = `/deals/${dealId}/ax?action=authority`;
                const url =
                  typeof window !== "undefined"
                    ? `${window.location.origin}${path}`
                    : path;
                try {
                  await navigator.clipboard.writeText(url);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                } catch {
                  /* ignore */
                }
              }}
              className="rounded-lg border border-amber-500 px-4 py-2 text-sm font-medium text-amber-800"
            >
              {copiedLink ? "Copied authority link" : "Copy authority link"}
            </button>
            {showAuthorityCta && (
              <Link
                href={`/deals/${dealId}/ax?action=authority`}
                className="rounded-lg border border-amber-500/50 px-3 py-2 text-xs font-medium text-amber-700"
              >
                Open settle →
              </Link>
            )}
          </div>
        )}
      </div>

      {bothFunded && st === "funded" && !showAuthorityCta && (
        <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          Both legs funded. Waiting for the designated authority to Release
          (atomic swap) or Cancel Ax. Share{" "}
          <span className="font-mono text-[10px]">
            /deals/{dealId}/ax?action=authority
          </span>{" "}
          with the authority wallet holder (no TrustLayer account required).
          You can open a dispute if needed.
        </p>
      )}

      {/* After accept only: cancel unfunded / dispute still need panel when on-chain exists */}
      {(agreementReady || created) && (
        <SolanaAxActions
          dealId={dealId}
          role={s.role}
          onchainStatus={s.onchainStatus}
          fundedA={s.fundedA}
          fundedB={s.fundedB}
          chainDealId={s.chainDealId}
          axPda={s.axPda}
          canRelease={false}
          focusAction="all"
          onStatusChange={load}
        />
      )}

      <div className="border-t border-gray-200 pt-3 text-xs">
        <p className="font-medium">On-chain transactions</p>
        <div className="mt-1 space-y-1">
          {links
            .filter(([, sig]) => Boolean(sig))
            .map(([label, sig]) => (
              <a
                key={`${label}-${sig}`}
                href={`https://explorer.solana.com/tx/${sig}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
                className="block break-all text-blue-600 underline"
              >
                {label}: {String(sig).slice(0, 28)}…
              </a>
            ))}
          {!links.some(([, sig]) => Boolean(sig)) && (
            <p className="text-gray-500">No signatures recorded yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

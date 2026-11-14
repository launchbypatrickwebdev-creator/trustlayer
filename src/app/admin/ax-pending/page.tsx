"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import AdminPageHeader, { AdminPanel } from "@/components/admin/AdminPageHeader";

type Item = {
  dealId: string;
  dealCode: string | null;
  title: string | null;
  chainDealId: string | null;
  settleUrl: string;
  releaseAuthorityMode?: string;
  releaseAuthorityPubkey?: string | null;
  onchainStatus?: string | null;
};

export default function AdminAxPendingPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/ax-pending");
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Failed to load");
        setItems(body.items || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <AdminShell active="ax-pending" breadcrumb="Ax settle">
      <AdminPageHeader
        title="Ax awaiting authority settle"
        description="Both legs funded. Connect the authority wallet (TrustLayer admin or deal-chosen pubkey) to Release or Cancel Ax. Parties cannot release under authority policy."
      />
      {loading && <p className="text-sm text-[var(--tl-muted)]">Loading…</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!loading && items.length === 0 && !error ? (
        <AdminPanel className="px-5 py-12 text-center text-sm text-[var(--tl-muted)]">
          No Ax deals waiting for authority release.
        </AdminPanel>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={it.dealId}>
              <AdminPanel className="border-amber-500/20 p-5">
                <p className="font-semibold">{it.title || "Ax deal"}</p>
                <p className="mt-1 font-mono text-xs text-[var(--tl-muted)]">
                  {it.dealCode} · chain {it.chainDealId}
                </p>
                <p className="mt-2 text-xs text-[var(--tl-muted)]">
                  Status: {it.onchainStatus || "funded"} · Authority:{" "}
                  {it.releaseAuthorityMode || "admin"}
                </p>
                <Link
                  href={it.settleUrl}
                  className="mt-4 inline-flex rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-sm font-semibold text-amber-100 no-underline"
                >
                  Open authority settle →
                </Link>
              </AdminPanel>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}

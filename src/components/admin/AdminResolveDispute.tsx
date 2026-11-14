"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminResolveDispute({
  disputeId,
  status,
  canResolve,
  settlementKind = "one_leg",
}: {
  disputeId: string;
  status: string;
  canResolve: boolean;
  /** one_leg | ax — Ax uses same endpoint; server branches on settlement_kind */
  settlementKind?: "one_leg" | "ax" | string;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [signature, setSignature] = useState("");
  const [loading, setLoading] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function resolve(action: "release" | "refund") {
    setLoading(true);
    setError("");
    setOk("");
    try {
      const r = await fetch(
        `/api/admin/disputes/${disputeId}/resolve-onchain`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, notes }),
        }
      );
      const b = (await r.json()) as {
        error?: string;
        signature?: string;
        dbSynced?: boolean;
        warning?: string;
        ok?: boolean;
      };

      // HTTP may still be 200 when chain succeeded but DB failed
      if (b.ok === true && b.signature && b.dbSynced === false) {
        setSignature(b.signature);
        setOk(
          `On-chain ${action} confirmed (tx: ${b.signature}). Database was not fully synced — use Recover below with this signature. Do not send another transaction.`
        );
        if (b.warning) setError(b.warning);
        router.refresh();
        return;
      }

      if (!r.ok) {
        throw new Error(b.error || "Resolve failed");
      }

      setOk(
        `On-chain ${action} confirmed. Tx: ${b.signature || ""}${
          b.dbSynced === false
            ? " — DB not fully synced; use Recover if status looks wrong."
            : ""
        }`
      );
      if (b.signature) setSignature(b.signature);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Resolve failed");
    } finally {
      setLoading(false);
    }
  }

  async function reconcile() {
    setRecovering(true);
    setError("");
    setOk("");
    try {
      const r = await fetch(`/api/admin/disputes/${disputeId}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature, notes }),
      });
      const b = (await r.json()) as {
        error?: string;
        action?: string;
        signature?: string;
      };
      if (!r.ok) throw new Error(b.error || "Reconciliation failed");
      setOk(
        `Recovered ${b.action || "terminal state"} from confirmed transaction ${
          b.signature || signature
        }.`
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reconciliation failed");
    } finally {
      setRecovering(false);
    }
  }

  if (
    !canResolve &&
    !["open", "resolved_release", "resolved_refund"].includes(status)
  ) {
    return (
      <section className="rounded-xl border p-5">
        <h2 className="font-semibold">Admin resolution</h2>
        <p className="mt-2 text-sm text-gray-600">
          This dispute is {status}. No on-chain recovery action is available.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border p-5">
      <h2 className="font-semibold">Admin on-chain resolution</h2>
      <p className="mt-2 text-sm text-gray-600">
        Execution sends the existing TrustLayer instruction. Recovery only reads
        a confirmed signature and syncs the database — it never submits another
        blockchain transaction.
      </p>

      {canResolve && status === "open" && (
        <>
          <textarea
            className="mt-3 w-full rounded-lg border px-3 py-2 text-sm"
            rows={3}
            placeholder="Resolution notes (min 10 chars)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
      {settlementKind === "ax" && (
        <p className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          Ax (2-leg) dispute: on-chain status must be <strong>Disputed</strong>.
          Release performs the atomic swap; refund returns both legs (refund fee
          may apply). Parties can also reclaim their own leg after 7 days.
        </p>
      )}

            <button
              type="button"
              disabled={loading || recovering || notes.trim().length < 10}
              onClick={() => void resolve("release")}
              className="rounded-lg bg-green-700 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Release to seller
            </button>
            <button
              type="button"
              disabled={loading || recovering || notes.trim().length < 10}
              onClick={() => void resolve("refund")}
              className="rounded-lg bg-red-700 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Refund to buyer
            </button>
          </div>
        </>
      )}

      <div className="mt-5 border-t pt-4">
        <h3 className="font-medium">Recover confirmed transaction</h3>
        <p className="mt-1 text-sm text-gray-600">
          Use this when the blockchain transaction succeeded but the browser/API
          lost the final database update. Paste the Solana signature — no second
          transaction is sent.
        </p>
        <input
          className="mt-3 w-full rounded-lg border px-3 py-2 text-sm"
          placeholder="Solana transaction signature"
          value={signature}
          onChange={(e) => setSignature(e.target.value.trim())}
        />
        <button
          type="button"
          disabled={recovering || loading || signature.length < 64}
          onClick={() => void reconcile()}
          className="mt-2 rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
        >
          {recovering ? "Reconciling…" : "Reconcile confirmed transaction"}
        </button>
      </div>

      {ok && (
        <p className="mt-2 break-all text-sm text-green-700">{ok}</p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}

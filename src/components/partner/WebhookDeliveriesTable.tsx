"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Attempt = { id: string; attempt_number: number; started_at: string; completed_at: string | null; response_status: number | null; duration_ms: number | null; error: string | null };
type Row = {
  id: string;
  event_type: string;
  event_id?: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  delivered_at: string | null;
  next_attempt_at?: string | null;
  last_status_code?: number | null;
  environment?: string;
  attempt_history?: Attempt[];
};

export default function WebhookDeliveriesTable({ rows, partnerId, role }: { rows: Row[]; partnerId: string; role: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function retry(id: string) {
    if (!confirm("Replay this webhook delivery? The receiver may see the same event again, so it must deduplicate by event ID.")) return;
    setErr(null);
    setBusy(id);
    try {
      const res = await fetch("/api/partner/webhooks/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delivery_id: id, partner_id: partnerId, action: "retry" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Retry failed");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {err && (
        <p className="mb-3 text-sm text-rose-300">{err}</p>
      )}
      <div className="overflow-x-auto rounded-2xl border border-[#17334a] bg-[#071a2d]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-[#17334a] text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Attempts / HTTP</th>
              <th className="px-4 py-3">Error</th>
              <th className="px-4 py-3">Created / next retry</th>
              <th className="px-4 py-3">History</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#14304a]">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  No webhook deliveries yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-300">
                  {r.event_type}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      r.status === "delivered"
                        ? "bg-emerald-400/15 text-emerald-300"
                        : r.status === "failed" || r.status === "dead"
                          ? "bg-rose-400/15 text-rose-300"
                          : "bg-slate-500/20 text-slate-400"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-400">
                  {r.attempts}{r.last_status_code ? ` · HTTP ${r.last_status_code}` : ""}
                </td>
                <td className="max-w-[14rem] truncate px-4 py-2.5 text-xs text-slate-500">
                  {r.last_error || "—"}
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-500">
                  {new Date(r.created_at).toLocaleString()}
                  {r.next_attempt_at && (r.status === "failed" || r.status === "pending") && <span className="mt-1 block text-[10px] text-amber-200/70">Next: {new Date(r.next_attempt_at).toLocaleString()}</span>}
                </td>
                <td className="px-4 py-2.5">
                  <button type="button" onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="rounded-lg border border-[#2a3d51] px-2 py-1 text-[11px] font-semibold text-slate-300">{expanded === r.id ? "Hide" : `View ${r.attempt_history?.length || 0}`}</button>
                </td>
                <td className="px-4 py-2.5">
                  {role !== "viewer" && (r.environment !== "live" || role === "owner") && (r.status === "failed" || r.status === "dead") && (
                    <button
                      type="button"
                      disabled={busy === r.id}
                      onClick={() => retry(r.id)}
                      className="rounded-lg border border-amber-400/30 px-2 py-1 text-[11px] font-bold text-amber-200 disabled:opacity-50"
                    >
                      {busy === r.id ? "…" : "Retry"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.filter(r => expanded === r.id).map(r => <tr key={`${r.id}-history`}><td colSpan={7} className="bg-black/10 px-4 py-4"><div className="space-y-2">{(r.attempt_history||[]).length===0&&<p className="text-xs text-slate-500">No attempt details recorded.</p>}{(r.attempt_history||[]).map(a=><div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#20374b] bg-[#091827] px-3 py-2"><div><p className="text-xs font-semibold text-slate-200">Attempt {a.attempt_number}{a.response_status?` · HTTP ${a.response_status}`:""}</p><p className="mt-1 text-[10px] text-slate-500">Started {new Date(a.started_at).toLocaleString()}{a.completed_at?` · Completed ${new Date(a.completed_at).toLocaleString()}`:""}</p>{a.error&&<p className="mt-1 text-xs text-rose-200">{a.error}</p>}</div><span className="text-[10px] text-slate-500">{a.duration_ms!=null?`${a.duration_ms} ms`:"Duration unavailable"}</span></div>)}</div></td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

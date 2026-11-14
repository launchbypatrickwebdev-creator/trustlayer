"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";

type ComponentState = "operational" | "degraded" | "outage";

type ComponentResult = {
  id: string;
  name: string;
  status: ComponentState;
  detail: string;
  latencyMs: number | null;
};

type StatusPayload = {
  overall: ComponentState;
  checkedAt: string;
  cluster: string;
  components: ComponentResult[];
  note: string;
};

function tone(status: ComponentState) {
  if (status === "operational")
    return {
      dot: "bg-[var(--tl-emerald)]",
      badge:
        "border-[var(--tl-emerald)]/30 bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]",
      label: "Operational",
    };
  if (status === "degraded")
    return {
      dot: "bg-[var(--tl-warn)]",
      badge:
        "border-[var(--tl-warn)]/30 bg-[var(--tl-warning-soft)] text-[var(--tl-warn)]",
      label: "Degraded",
    };
  return {
    dot: "bg-[var(--tl-danger)]",
    badge:
      "border-[var(--tl-danger)]/30 bg-[var(--tl-danger-soft)] text-[var(--tl-danger)]",
    label: "Outage",
  };
}

export default function SystemStatusPanel() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (!res.ok) throw new Error("Status check failed.");
      const json = (await res.json()) as StatusPayload;
      setData(json);
    } catch (e) {
      setData(null);
      setError(
        e instanceof Error
          ? e.message
          : "Unable to load system status."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const overall = data?.overall ?? (error ? "outage" : "operational");
  const overallTone = tone(overall);

  return (
    <section
      id="status"
      className="scroll-mt-24 rounded-[22px] border border-[var(--tl-line)] bg-[var(--tl-card)] p-5 sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--tl-emerald)]/30 bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h2 className="text-lg font-bold text-[var(--tl-ink)]">
              System status
            </h2>
            <p className="mt-1 text-sm text-[var(--tl-muted)]">
              Live checks for web, database, and Solana settlement. Not a ticket
              form.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--tl-line)] px-3 py-2 text-xs font-bold text-[var(--tl-ink)] transition hover:bg-white/[.03] disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div
        className={`mt-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${overallTone.badge}`}
      >
        <span className={`h-2 w-2 rounded-full ${overallTone.dot}`} />
        {overallTone.label}
        {data?.cluster ? (
          <span className="font-semibold opacity-80">
            · {data.cluster}
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-sm leading-6 text-[var(--tl-muted)]">
        {error
          ? "Status API did not respond. The app may still work — try Refresh, or open a ticket if problems continue."
          : data?.note}
      </p>

      <ul className="mt-5 space-y-3">
        {(data?.components ?? []).map((c) => {
          const t = tone(c.status);
          return (
            <li
              key={c.id}
              className="rounded-2xl border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className={`h-2 w-2 rounded-full ${t.dot}`} />
                  <span className="text-sm font-bold text-[var(--tl-ink)]">
                    {c.name}
                  </span>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${t.badge}`}
                >
                  {t.label}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-5 text-[var(--tl-muted)]">
                {c.detail}
                {c.latencyMs != null && c.latencyMs > 0
                  ? ` · ${c.latencyMs} ms`
                  : ""}
              </p>
            </li>
          );
        })}
        {loading && !data && (
          <li className="rounded-2xl border border-[var(--tl-line)] px-4 py-6 text-center text-sm text-[var(--tl-muted)]">
            Checking systems…
          </li>
        )}
      </ul>

      {data?.checkedAt && (
        <p className="mt-4 text-[11px] text-[var(--tl-muted)]">
          Last checked {new Date(data.checkedAt).toLocaleString()}
        </p>
      )}
    </section>
  );
}
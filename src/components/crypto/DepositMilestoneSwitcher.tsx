"use client";

import { useState } from "react";
import TokenIcon from "@/components/TokenIcon";

type MilestoneRow = {
  milestone_index: number;
  amount: string | number;
  label?: string | null;
};

type SettlementRow = {
  milestone_index: number;
  onchain_status?: string | null;
};

export default function DepositMilestoneSwitcher({
  dealId,
  assetCode,
  currentIndex,
  milestones,
  settlements,
  disputedIndexes,
}: {
  dealId: string;
  assetCode: string;
  currentIndex: number;
  milestones: MilestoneRow[];
  settlements: SettlementRow[];
  disputedIndexes: number[];
}) {
  const [loadingIndex, setLoadingIndex] = useState<number | null>(null);
  const [error, setError] = useState("");

  const disputed = new Set(disputedIndexes);

  function statusFor(i: number) {
    const row = settlements.find((s) => Number(s.milestone_index) === i);
    return String(row?.onchain_status || "not_created");
  }

  function isFundable(i: number) {
    const st = statusFor(i);
    if (disputed.has(i)) return false;
    if (["released", "cancelled", "refunded", "funded"].includes(st)) {
      return false;
    }
    // not_created | created_unfunded (and any other non-terminal non-funded)
    return true;
  }

  async function openMilestone(i: number) {
    if (i === currentIndex) return;
    if (!isFundable(i)) return;
    setLoadingIndex(i);
    setError("");
    try {
      const response = await fetch("/api/crypto/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, milestoneIndex: i }),
      });
      const result = (await response.json()) as {
        depositUrl?: string;
        error?: string;
      };
      if (!response.ok || !result.depositUrl) {
        throw new Error(
          result.error || "Unable to open deposit for that milestone."
        );
      }
      window.location.assign(result.depositUrl);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to open deposit for that milestone."
      );
      setLoadingIndex(null);
    }
  }

  if (!milestones.length) return null;

  return (
    <div className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-card)] p-3 text-sm">
      <p className="font-medium text-[var(--tl-ink)]">Agreed milestones</p>
      <p className="mt-1 text-xs text-[var(--tl-muted)]">
        Tap another open milestone to open a new secure session for that stage
        (same rules as from the deal page).
      </p>
      <ul className="mt-2 space-y-1">
        {milestones.map((m) => {
          const i = Number(m.milestone_index);
          const st = statusFor(i);
          const active = i === currentIndex;
          const fundable = isFundable(i);
          const busy = loadingIndex === i;

          const content = (
            <>
              #{i + 1} {m.label || `Milestone ${i + 1}`} —{" "}
              <span className="inline-flex items-center gap-1">
                {m.amount}
                <TokenIcon code={assetCode} size={14} />
                {assetCode}
              </span>{" "}
              · {st}
              {busy ? " · opening…" : ""}
            </>
          );

          if (active) {
            return (
              <li
                key={i}
                className="rounded-md bg-[var(--tl-emerald-soft)] px-2 py-1.5 font-semibold text-[var(--tl-ink)]"
              >
                {content}
                <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-[var(--tl-emerald)]">
                  current
                </span>
              </li>
            );
          }

          if (fundable) {
            return (
              <li key={i}>
                <button
                  type="button"
                  disabled={loadingIndex !== null}
                  onClick={() => void openMilestone(i)}
                  className="w-full rounded-md px-2 py-1.5 text-left text-[var(--tl-muted)] transition hover:bg-white/[.04] hover:text-[var(--tl-ink)] disabled:opacity-50"
                >
                  {content}
                </button>
              </li>
            );
          }

          return (
            <li
              key={i}
              className="px-2 py-1.5 text-[var(--tl-muted)] opacity-70"
            >
              {content}
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}

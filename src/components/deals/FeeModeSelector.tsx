"use client";

import TokenIcon from "@/components/TokenIcon";
import { breakdownFee, type FeeMode } from "@/lib/domain/fee";

export default function FeeModeSelector({
  amount,
  assetOrCurrency,
  feeMode,
  onChange,
  feeBps = 250,
}: {
  amount: string;
  assetOrCurrency: string;
  feeMode: FeeMode;
  onChange: (mode: FeeMode) => void;
  feeBps?: number;
}) {
  const valid =
    /^\d+(\.\d+)?$/.test((amount || "").trim()) && Number(amount) > 0;
  const onTop = valid
    ? breakdownFee({ amount, feeMode: "on_top", feeBps })
    : null;
  const fromAmt = valid
    ? breakdownFee({ amount, feeMode: "from_amount", feeBps })
    : null;
  const unit = assetOrCurrency || "units";

  return (
    <section className="space-y-3 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--tl-ink)]">
          Platform fee ({(feeBps ?? 100) / 100}%)
          <TokenIcon code={unit} size={16} />
          <span className="text-xs font-semibold text-[var(--tl-muted)]">{unit}</span>
        </h2>
        <p className="mt-1 text-xs leading-5 text-[var(--tl-muted)]">
          Choose how the fee is paid — same idea as exchange withdrawals. Gas is
          always paid separately by your wallet.
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--tl-line)] p-3 hover:bg-[var(--tl-bg-elevated)]">
        <input
          type="radio"
          name="feeMode"
          className="mt-1"
          checked={feeMode === "on_top"}
          onChange={() => onChange("on_top")}
        />
        <span className="text-sm">
          <span className="font-semibold text-[var(--tl-ink)]">
            Pay fee on top
          </span>
          <span className="mt-1 block text-xs text-[var(--tl-muted)]">
            {onTop
              ? `Lock ${onTop.fundAmount} ${unit} · seller receives ${onTop.sellerReceives} ${unit} · fee ${onTop.platformFee} ${unit}`
              : "Enter amount to preview"}
          </span>
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--tl-line)] p-3 hover:bg-[var(--tl-bg-elevated)]">
        <input
          type="radio"
          name="feeMode"
          className="mt-1"
          checked={feeMode === "from_amount"}
          onChange={() => onChange("from_amount")}
        />
        <span className="text-sm">
          <span className="font-semibold text-[var(--tl-ink)]">
            Deduct fee from amount
          </span>
          <span className="mt-1 block text-xs text-[var(--tl-muted)]">
            {fromAmt
              ? `Lock ${fromAmt.fundAmount} ${unit} · seller receives ${fromAmt.sellerReceives} ${unit} · fee ${fromAmt.platformFee} ${unit}`
              : "Enter amount to preview"}
          </span>
        </span>
      </label>
    </section>
  );
}

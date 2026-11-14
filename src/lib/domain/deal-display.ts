/**
 * Shared human labels for 1-leg and Ax (2-leg) deals in list + detail.
 */

export type LegLike = {
  leg_index?: number | null;
  asset_code?: string | null;
  asset_type?: string | null;
  amount_base_units?: string | number | null;
  decimals?: number | null;
  amount?: string | number | null;
  nft_valuation_amount?: string | number | null;
  nft_valuation_usd?: string | number | null;
  nft_valuation_sol?: string | number | null;
  fee_amount?: string | number | null;
  fee_bps?: number | null;
};

function baseToHuman(raw: string, decimals: number): string {
  try {
    const n = BigInt(String(raw).split(".")[0] || "0");
    if (decimals <= 0) return n.toString();
    const base = 10n ** BigInt(decimals);
    const whole = n / base;
    const frac = n % base;
    if (frac === 0n) return whole.toString();
    const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
    return `${whole}.${fracStr}`;
  } catch {
    return String(raw);
  }
}

/** Single leg: "0.5 SOL" | "1 NFT ($500)" */
export function formatLegAmountLabel(leg: LegLike): string {
  const code = String(leg.asset_code || "SOL").toUpperCase();
  const assetType = String(leg.asset_type || "").toLowerCase();
  const isNft =
    assetType === "nft" ||
    code === "NFT" ||
    code === "PNFT" ||
    code === "CNFT";

  if (isNft) {
    const usd =
      leg.nft_valuation_usd != null && String(leg.nft_valuation_usd) !== ""
        ? String(leg.nft_valuation_usd)
        : null;
    const solVal =
      leg.nft_valuation_amount != null &&
      String(leg.nft_valuation_amount) !== ""
        ? String(leg.nft_valuation_amount)
        : leg.nft_valuation_sol != null
          ? String(leg.nft_valuation_sol)
          : null;
    if (usd && Number(usd) > 0) return `1 NFT ($${usd})`;
    if (solVal && Number(solVal) > 0) return `1 NFT (${solVal} SOL val)`;
    return "1 NFT";
  }

  if (leg.amount != null && String(leg.amount).trim() !== "") {
    return `${String(leg.amount).trim()} ${code}`;
  }

  const dec =
    leg.decimals != null ? Number(leg.decimals) : code === "SOL" ? 9 : 6;
  const human = baseToHuman(String(leg.amount_base_units ?? "0"), dec);
  return `${human} ${code}`;
}

export function formatLegAssetCode(leg: LegLike): string {
  return String(leg.asset_code || "SOL").toUpperCase();
}

/** Pair for list Asset column: "SOL ↔ USDC" */
export function formatAxAssetPair(legs: LegLike[]): string {
  const sorted = [...legs].sort(
    (a, b) => Number(a.leg_index ?? 0) - Number(b.leg_index ?? 0)
  );
  if (sorted.length < 2) {
    return sorted[0] ? formatLegAssetCode(sorted[0]) : "—";
  }
  return `${formatLegAssetCode(sorted[0])} ↔ ${formatLegAssetCode(sorted[1])}`;
}

/** Pair for list Amount: "0.5 SOL ↔ 4 USDC" | "1 NFT ($500) ↔ 2 SOL" */
export function formatAxAmountPair(legs: LegLike[]): string {
  const sorted = [...legs].sort(
    (a, b) => Number(a.leg_index ?? 0) - Number(b.leg_index ?? 0)
  );
  if (sorted.length < 2) {
    return sorted[0] ? formatLegAmountLabel(sorted[0]) : "—";
  }
  return `${formatLegAmountLabel(sorted[0])} ↔ ${formatLegAmountLabel(sorted[1])}`;
}

export function isAxDealRow(opts: {
  settlement_adapter?: string | null;
  settlement_kind?: string | null;
  legs?: LegLike[] | null;
}): boolean {
  const a = String(
    opts.settlement_adapter || opts.settlement_kind || ""
  ).toLowerCase();
  if (a.includes("ax") || a === "dvp" || a === "solana_ax") return true;
  return (opts.legs?.length ?? 0) >= 2;
}

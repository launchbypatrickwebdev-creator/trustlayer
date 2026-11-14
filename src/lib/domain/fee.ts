/**
 * TrustLayer platform fee helpers (decimal-safe, no float).
 * Default settle fee: 250 bps = 2.5% (1-leg fungible).
 *
 * on_top (default, matches current on-chain prepare):
 *   lock = amount + fee, seller principal = amount
 * from_amount:
 *   lock = amount, seller principal = amount - fee
 */

export type FeeMode = "on_top" | "from_amount";

export const DEFAULT_FEE_BPS = 250; // 2.5% 1-leg fungible

const SCALE = 12n;

function parseDecimalToScaled(raw: string): bigint {
  const v = (raw || "").trim();
  if (!v || !/^\d+(\.\d+)?$/.test(v)) throw new Error("Invalid amount.");
  const [whole, frac = ""] = v.split(".");
  const padded = (frac + "0".repeat(Number(SCALE))).slice(0, Number(SCALE));
  return BigInt(whole + padded);
}

function scaledToDecimalString(scaled: bigint): string {
  const neg = scaled < 0n;
  const abs = neg ? -scaled : scaled;
  const s = abs.toString().padStart(Number(SCALE) + 1, "0");
  const w = s.slice(0, -Number(SCALE)).replace(/^0+(?=\d)/, "") || "0";
  const f = s.slice(-Number(SCALE)).replace(/0+$/, "");
  const out = f ? `${w}.${f}` : w;
  return neg ? `-${out}` : out;
}

export function computePlatformFee(amount: string, feeBps: number = DEFAULT_FEE_BPS): string {
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new Error("Invalid fee basis points.");
  }
  const scaled = parseDecimalToScaled(amount);
  let feeScaled = (scaled * BigInt(feeBps)) / 10000n;
  if (feeScaled === 0n && scaled > 0n && feeBps > 0) feeScaled = 1n;
  return scaledToDecimalString(feeScaled);
}

export function addDecimalStrings(a: string, b: string): string {
  return scaledToDecimalString(parseDecimalToScaled(a) + parseDecimalToScaled(b));
}

export function subDecimalStrings(a: string, b: string): string {
  const r = parseDecimalToScaled(a) - parseDecimalToScaled(b);
  if (r < 0n) throw new Error("Amount after fee would be negative.");
  return scaledToDecimalString(r);
}

export interface FeeBreakdown {
  feeMode: FeeMode;
  feeBps: number;
  dealAmount: string;
  platformFee: string;
  fundAmount: string;
  sellerReceives: string;
  label: string;
}

export function breakdownFee(opts: {
  amount: string;
  feeMode?: FeeMode | string | null;
  feeBps?: number | null;
}): FeeBreakdown {
  const feeMode: FeeMode = opts.feeMode === "from_amount" ? "from_amount" : "on_top";
  const feeBps = opts.feeBps == null ? DEFAULT_FEE_BPS : Number(opts.feeBps);
  const dealAmount = String(opts.amount).trim();
  const platformFee = computePlatformFee(dealAmount, feeBps);

  if (feeMode === "on_top") {
    const fundAmount = addDecimalStrings(dealAmount, platformFee);
    return {
      feeMode,
      feeBps,
      dealAmount,
      platformFee,
      fundAmount,
      sellerReceives: dealAmount,
      label: `Pay fee on top — lock ${fundAmount}; seller gets ${dealAmount}`,
    };
  }

  const sellerReceives = subDecimalStrings(dealAmount, platformFee);
  return {
    feeMode,
    feeBps,
    dealAmount,
    platformFee,
    fundAmount: dealAmount,
    sellerReceives,
    label: `Deduct fee from amount — lock ${dealAmount}; seller gets ${sellerReceives}`,
  };
}

export function normalizeFeeMode(value: unknown): FeeMode {
  return value === "from_amount" ? "from_amount" : "on_top";
}


/** Program DEFAULT_SETTLEMENT_FEE_BPS = 250; fee must be > 0 and ≥ this rate. */
export const ON_CHAIN_SETTLEMENT_FEE_BPS = 250;

/**
 * Ensure settlement fee meets on-chain rules for 1-leg:
 * fee > 0 and fee ≥ amount * 100bps / 10000 (with 1 base-unit floor via computePlatformFee).
 */
export function assertSettlementFeeFloor(amount: string, fee: string, feeBps: number = ON_CHAIN_SETTLEMENT_FEE_BPS): void {
  const minFee = computePlatformFee(amount, feeBps);
  const feeScaled = parseDecimalToScaled(fee);
  const minScaled = parseDecimalToScaled(minFee);
  if (feeScaled <= 0n) throw new Error("Settlement fee must be greater than zero.");
  if (feeScaled < minScaled) {
    throw new Error(`Settlement fee must be at least ${feeBps} bps of amount (min ${minFee}).`);
  }
}

/**
 * NFT leg SOL lock at fund: settlement fee + refund reserve (fee/2) ≈ 1.5× fee.
 * Matches program: sol_fee_locked settlement + refund reserve.
 */
export function nftSolLockAmounts(settlementFeeSol: string): {
  settlementFee: string;
  refundReserve: string;
  lockedNow: string;
} {
  const fee = parseDecimalToScaled(settlementFeeSol);
  if (fee <= 0n) throw new Error("NFT settlement fee must be greater than zero.");
  const reserve = fee / 2n;
  const locked = fee + reserve;
  return {
    settlementFee: scaledToDecimalString(fee),
    refundReserve: scaledToDecimalString(reserve),
    lockedNow: scaledToDecimalString(locked),
  };
}

// ---------------------------------------------------------------------------
// Ax (2-leg): 1.25% per leg → 125 bps (full round-trip 2.5%)
// ---------------------------------------------------------------------------

/** On-chain DEFAULT_SETTLEMENT_FEE_BPS / 2 for each Ax leg (1.25% → 2.5% round-trip). */
export const AX_LEG_FEE_BPS = 125;

/** NFT leg fee: 2% of USD valuation, paid in SOL. */
export const NFT_FEE_BPS = 200;

/** Cancellation fee policy (UI + program default): 0.2%. */
export const CANCEL_FEE_BPS = 20;

/** Admin / refund policy text: 0.5% (unchanged). */
export const REFUND_FEE_BPS = 50;

/** Fallback SOL/USD when oracle unavailable (override via NEXT_PUBLIC_SOL_USD_RATE). */
export const FALLBACK_SOL_USD_RATE = 150;

/**
 * Per-leg Ax fee breakdown (same on_top / from_amount semantics as 1-leg,
 * but default 50 bps).
 */
export function breakdownAxLegFee(opts: {
  amount: string;
  feeMode?: FeeMode | string | null;
  feeBps?: number | null;
}): FeeBreakdown {
  const feeBps =
    opts.feeBps == null ? AX_LEG_FEE_BPS : Number(opts.feeBps);
  return breakdownFee({
    amount: opts.amount,
    feeMode: opts.feeMode,
    feeBps,
  });
}

/**
 * Enforce Ax leg fee floor: fee > 0 and ≥ 50 bps of that leg's amount.
 */
export function assertAxLegFeeFloor(
  amount: string,
  fee: string,
  feeBps: number = AX_LEG_FEE_BPS
): void {
  assertSettlementFeeFloor(amount, fee, feeBps);
}

// ---------------------------------------------------------------------------
// Simple NFT (classic Token): fee in SOL from valuation, clamped [0.00001, 10]
// ---------------------------------------------------------------------------

/** Program MIN_NFT_SOL_FEE_LAMPORTS = 10_000 (0.00001 SOL). */
export const MIN_NFT_SOL_FEE = "0.00001";
/** Program MAX_NFT_SOL_FEE_LAMPORTS = 10_000_000_000 (10 SOL). */
export const MAX_NFT_SOL_FEE = "10";

/**
 * Compute NFT leg platform fee in SOL from USD valuation + SOL/USD rate.
 * Fee = NFT_FEE_BPS (2%) of valuation_usd, converted to SOL, clamped [MIN, MAX].
 * Fund locks 1.5× (settlement fee + refund reserve).
 *
 * Prefer valuationUsd + solUsdRate. Legacy valuationSol still accepted as SOL-notional.
 */
export function breakdownNftLegFee(opts: {
  /** USD (USDC/USDT-equivalent) valuation of the NFT */
  valuationUsd?: string | null;
  /** SOL per 1 USD inverted: dollars per 1 SOL at snapshot */
  solUsdRate?: number | null;
  /** @deprecated Prefer valuationUsd — treated as SOL-notional if no USD given */
  valuationSol?: string | null;
  feeBps?: number | null;
}): {
  valuationUsd: string;
  valuationSol: string;
  solUsdRate: number;
  feeBps: number;
  platformFeeSol: string;
  solLockAtFund: string;
  refundReserveSol: string;
  label: string;
} {
  const feeBps = opts.feeBps == null ? NFT_FEE_BPS : Number(opts.feeBps);
  const rate =
    opts.solUsdRate != null && Number(opts.solUsdRate) > 0
      ? Number(opts.solUsdRate)
      : FALLBACK_SOL_USD_RATE;

  let valuationUsd = String(opts.valuationUsd || "").trim();
  let valuationSol: string;

  if (valuationUsd && /^\d+(\.\d+)?$/.test(valuationUsd) && Number(valuationUsd) > 0) {
    // USD → SOL notional for display; fee computed from USD then converted
    const usd = Number(valuationUsd);
    valuationSol = (usd / rate).toFixed(9).replace(/\.?0+$/, "") || "0";
  } else {
    // Legacy path: valuation already in SOL
    valuationSol = String(opts.valuationSol || "").trim();
    if (!/^\d+(\.\d+)?$/.test(valuationSol) || Number(valuationSol) <= 0) {
      throw new Error("NFT valuation must be a positive USD (or legacy SOL) amount.");
    }
    valuationUsd = (Number(valuationSol) * rate).toFixed(2);
  }

  // Fee notionally in USD, then convert to SOL
  const feeUsd = computePlatformFee(valuationUsd, feeBps);
  const feeUsdNum = Number(feeUsd);
  let feeSolStr = (feeUsdNum / rate).toFixed(9).replace(/\.?0+$/, "") || "0";
  if (!/^\d+(\.\d+)?$/.test(feeSolStr) || Number(feeSolStr) <= 0) {
    feeSolStr = MIN_NFT_SOL_FEE;
  }

  const minS = parseDecimalToScaled(MIN_NFT_SOL_FEE);
  const maxS = parseDecimalToScaled(MAX_NFT_SOL_FEE);
  let feeS = parseDecimalToScaled(feeSolStr);
  if (feeS < minS) feeS = minS;
  if (feeS > maxS) feeS = maxS;
  const fee = scaledToDecimalString(feeS);
  const lock = nftSolLockAmounts(fee);

  return {
    valuationUsd,
    valuationSol,
    solUsdRate: rate,
    feeBps,
    platformFeeSol: fee,
    solLockAtFund: lock.lockedNow,
    refundReserveSol: lock.refundReserve,
    label: `NFT · $${valuationUsd} @ $${rate}/SOL → fee ${fee} SOL (${feeBps / 100}%) · lock ${lock.lockedNow} SOL (1.5×)`,
  };
}

export function assertNftSolFeeInRange(feeSol: string): void {
  const s = parseDecimalToScaled(String(feeSol).trim());
  if (s < parseDecimalToScaled(MIN_NFT_SOL_FEE)) {
    throw new Error(`NFT SOL fee must be at least ${MIN_NFT_SOL_FEE} SOL.`);
  }
  if (s > parseDecimalToScaled(MAX_NFT_SOL_FEE)) {
    throw new Error(`NFT SOL fee must be at most ${MAX_NFT_SOL_FEE} SOL.`);
  }
}

/** Lamports helpers for on-chain encoders (9 decimals). */
export function solToLamports(sol: string): bigint {
  const [w, f = ""] = String(sol).trim().split(".");
  const frac = (f + "000000000").slice(0, 9);
  return BigInt(w + frac);
}

export function lamportsToSol(lamports: bigint | string | number): string {
  const n = BigInt(lamports);
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const s = abs.toString().padStart(10, "0");
  const whole = s.slice(0, -9).replace(/^0+(?=\d)/, "") || "0";
  const frac = s.slice(-9).replace(/0+$/, "");
  const out = frac ? `${whole}.${frac}` : whole;
  return neg ? `-${out}` : out;
}



/**
 * Snapshot SOL/USD for NFT fee conversion.
 * Order: NEXT_PUBLIC_SOL_USD_RATE env → Jupiter price API → FALLBACK_SOL_USD_RATE.
 */
export async function getSolUsdRate(): Promise<number> {
  const env = process.env.NEXT_PUBLIC_SOL_USD_RATE || process.env.SOL_USD_RATE;
  if (env && Number(env) > 0) return Number(env);
  try {
    const ctrl = AbortSignal.timeout?.(4_000);
    const res = await fetch(
      "https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112",
      { signal: ctrl, next: { revalidate: 60 } as RequestInit["next"] }
    );
    if (res.ok) {
      const body = (await res.json()) as {
        data?: Record<string, { price?: number }>;
      };
      const price =
        body?.data?.["So11111111111111111111111111111111111111112"]?.price;
      if (price && Number(price) > 0) return Number(price);
    }
  } catch {
    /* fall through */
  }
  return FALLBACK_SOL_USD_RATE;
}

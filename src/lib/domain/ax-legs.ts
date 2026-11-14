/**
 * Ax (2-leg) settlement leg model + agreement snapshot.
 *
 * Party mapping (locked policy):
 * - Party A = buyer_id  (signs on-chain create; payer == user_a)
 * - Party B = seller_id
 * Both wallets must be bound before create_ax_split.
 *
 * Fees:
 * - Fungible: 125 bps (1.25%) per leg → 2.5% round-trip, fee in leg asset
 * - Simple NFT (classic Token): fee in SOL from USD valuation (NFT_FEE_BPS = 2%),
 *   clamped [0.00001, 10] SOL; fund locks 1.5× fee (settlement + refund reserve)
 * - pNFT / cNFT: rejected at create (unavailable this wave)
 */

import { createHash } from "crypto";
import {
  assertAxLegFeeFloor,
  AX_LEG_FEE_BPS,
  NFT_FEE_BPS,
  FALLBACK_SOL_USD_RATE,
  breakdownAxLegFee,
  breakdownNftLegFee,
  assertNftSolFeeInRange,
  solToLamports,
  type FeeMode,
} from "@/lib/domain/fee";
import type { CryptoAssetCode } from "@/lib/crypto/solana";
import { assetMeta, isCryptoAssetCode, isNftAssetCode } from "@/lib/crypto/solana";

export type AxPartyRole = "buyer" | "seller";

export type AxLegKind = "fungible" | "nft";

export type AxLegInput = {
  /** 0 = party A (buyer), 1 = party B (seller) */
  legIndex?: 0 | 1;
  partyRole?: AxPartyRole;
  /** SOL | USDC | … | NFT (classic Token 1/1) */
  assetCode: string;
  /** Human decimal amount; NFT legs use "1" */
  amount: string;
  /** NFT only: agreed valuation in USD (positive decimal) */
  valuationUsd?: string | null;
  /** @deprecated use valuationUsd — still accepted as SOL-notional */
  valuationSol?: string | null;
  /** SOL/USD rate frozen at create/accept */
  solUsdRate?: number | null;
  /** NFT only: mint address (classic Token, decimals 0, supply 1) */
  mint?: string | null;
  feeMode?: FeeMode;
};

export type AxLegResolved = {
  legIndex: 0 | 1;
  partyRole: AxPartyRole;
  assetType: "native_sol" | "spl" | "nft";
  assetCode: string;
  mint: string | null;
  decimals: number;
  amountBaseUnits: string;
  /** Fee base units: same asset for fungible; SOL lamports for NFT */
  feeAmountBaseUnits: string;
  feeAssetCode: string;
  feeBps: number;
  feePayer: "funder";
  amount: string;
  feeAmount: string;
  fundAmount: string;
  /** NFT valuation USD when assetType === "nft" */
  nftValuationUsd?: string | null;
  /** Legacy SOL-notional of valuation */
  nftValuationSol?: string | null;
  solUsdRate?: number | null;
  /** SOL locked at fund for NFT leg ≈ 1.5× fee */
  solLockAtFund?: string | null;
  refundReserveSol?: string | null;
};

function rejectUnavailableNftFamily(code: string): void {
  const c = code.toUpperCase();
  if (c === "PNFT" || c === "CNFT") {
    throw new Error(
      `${c} is not available yet. Use classic Token NFT (asset NFT) only.`
    );
  }
}

/**
 * Resolve two Ax legs. Supports SOL↔SPL, SPL↔SPL, SOL/SPL↔NFT, NFT↔NFT.
 * Same SPL mint on both legs is rejected. pNFT/cNFT rejected.
 */
export function resolveAxLegs(input: {
  legA: AxLegInput;
  legB: AxLegInput;
  feeMode?: FeeMode | string | null;
}): AxLegResolved[] {
  const feeMode = (input.feeMode === "from_amount" ? "from_amount" : "on_top") as FeeMode;

  const build = (
    legIndex: 0 | 1,
    raw: AxLegInput,
    role: AxPartyRole
  ): AxLegResolved => {
    const code = String(raw.assetCode || "").toUpperCase().trim();
    rejectUnavailableNftFamily(code);

    if (code === "NFT" || isNftAssetCode(code)) {
      const mint = (raw.mint || "").trim();
      if (!mint || mint.length < 32) {
        throw new Error(`Leg ${legIndex} (NFT): mint address is required.`);
      }
      const valuationUsd = String(raw.valuationUsd || raw.valuationSol || "").trim();
      if (!valuationUsd || Number(valuationUsd) <= 0) {
        throw new Error(
          `Leg ${legIndex} (NFT): positive USD valuation is required (fee paid in SOL).`
        );
      }
      const rate =
        raw.solUsdRate != null && Number(raw.solUsdRate) > 0
          ? Number(raw.solUsdRate)
          : FALLBACK_SOL_USD_RATE;
      const nftFee = breakdownNftLegFee({
        valuationUsd,
        solUsdRate: rate,
        feeBps: NFT_FEE_BPS,
      });
      assertNftSolFeeInRange(nftFee.platformFeeSol);
      const feeLamports = solToLamports(nftFee.platformFeeSol).toString();

      return {
        legIndex,
        partyRole: role,
        assetType: "nft",
        assetCode: "NFT",
        mint,
        decimals: 0,
        amountBaseUnits: "1",
        feeAmountBaseUnits: feeLamports,
        feeAssetCode: "SOL",
        feeBps: NFT_FEE_BPS,
        feePayer: "funder",
        amount: "1",
        feeAmount: nftFee.platformFeeSol,
        fundAmount: "1",
        nftValuationUsd: nftFee.valuationUsd,
        nftValuationSol: nftFee.valuationSol,
        solUsdRate: nftFee.solUsdRate,
        solLockAtFund: nftFee.solLockAtFund,
        refundReserveSol: nftFee.refundReserveSol,
      };
    }

    if (!isCryptoAssetCode(code)) {
      throw new Error(`Unsupported asset code: ${code}`);
    }
    const meta = assetMeta(code as CryptoAssetCode);
    const amount = String(raw.amount || "").trim();
    if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) {
      throw new Error(`Leg ${legIndex}: amount must be a positive decimal.`);
    }
    const breakdown = breakdownAxLegFee({
      amount,
      feeMode,
      feeBps: AX_LEG_FEE_BPS,
    });
    assertAxLegFeeFloor(amount, breakdown.platformFee, AX_LEG_FEE_BPS);

    const decimals = meta.decimals;
    const toBase = (human: string): string => {
      const [w, f = ""] = human.split(".");
      const frac = (f + "0".repeat(decimals)).slice(0, decimals);
      return BigInt(w + frac).toString();
    };

    return {
      legIndex,
      partyRole: role,
      assetType: meta.assetType === 0 ? "native_sol" : "spl",
      assetCode: code,
      mint: meta.assetType === 0 ? null : meta.mint.toBase58(),
      decimals,
      amountBaseUnits: toBase(amount),
      feeAmountBaseUnits: toBase(breakdown.platformFee),
      feeAssetCode: code,
      feeBps: AX_LEG_FEE_BPS,
      feePayer: "funder",
      amount: breakdown.dealAmount,
      feeAmount: breakdown.platformFee,
      fundAmount: breakdown.fundAmount,
      nftValuationSol: null,
      solLockAtFund: null,
      refundReserveSol: null,
    };
  };

  const legs = [
    build(0, input.legA, "buyer"),
    build(1, input.legB, "seller"),
  ];

  // Reject same SPL mint on both legs
  if (
    legs[0].assetType === "spl" &&
    legs[1].assetType === "spl" &&
    legs[0].mint &&
    legs[0].mint === legs[1].mint
  ) {
    throw new Error("SPL legs must use different mints (e.g. USDC ↔ USDT).");
  }

  return legs;
}

/**
 * Canonical JSON for hashing (stable key order).
 * Store hash on deals.agreement_snapshot_hash and deal_settlement_snapshots.
 */
export function buildAxSnapshotPayload(terms: {
  dealId?: string;
  legs: AxLegResolved[];
  partyAWallet: string;
  partyBWallet: string;
  expiryTimestamp: number;
  earliestSettlementTimestamp: number;
  feeMode: FeeMode;
  releaseMode?: string;
}): Record<string, unknown> {
  return {
    settlement_adapter: "solana_ax",
    chain: "solana",
    release_mode: terms.releaseMode || "parties",
    fee_mode: terms.feeMode,
    expiry_timestamp: terms.expiryTimestamp,
    earliest_settlement_timestamp: terms.earliestSettlementTimestamp,
    party_a_wallet: terms.partyAWallet,
    party_b_wallet: terms.partyBWallet,
    legs: terms.legs.map((l) => ({
      leg_index: l.legIndex,
      party_role: l.partyRole,
      asset_type: l.assetType,
      asset_code: l.assetCode,
      mint: l.mint,
      decimals: l.decimals,
      amount_base_units: l.amountBaseUnits,
      fee_amount_base_units: l.feeAmountBaseUnits,
      fee_asset_code: l.feeAssetCode,
      fee_bps: l.feeBps,
      fee_payer: l.feePayer,
      nft_valuation_sol: l.nftValuationSol ?? null,
      sol_lock_at_fund: l.solLockAtFund ?? null,
      refund_reserve_sol: l.refundReserveSol ?? null,
    })),
  };
}

export function hashAxSnapshot(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  return createHash("sha256").update(json, "utf8").digest("hex");
}

/**
 * Both wallets required before on-chain create_ax_split.
 * Party A (buyer) must sign create (payer == user_a on-chain).
 */
export function assertAxWalletsBound(input: {
  partyAWallet?: string | null;
  partyBWallet?: string | null;
}): { partyAWallet: string; partyBWallet: string } {
  const a = (input.partyAWallet || "").trim();
  const b = (input.partyBWallet || "").trim();
  if (!a || !b) {
    throw new Error(
      "Both party wallets must be linked before creating an Ax settlement on-chain."
    );
  }
  if (a === b) {
    throw new Error("Party A and Party B wallets must differ.");
  }
  return { partyAWallet: a, partyBWallet: b };
}

/** Rows ready for deal_settlement_legs insert (service role). */
export function legsToDbRows(
  dealId: string,
  legs: AxLegResolved[]
): Array<Record<string, unknown>> {
  return legs.map((l) => ({
    deal_id: dealId,
    leg_index: l.legIndex,
    party_role: l.partyRole,
    asset_type: l.assetType,
    asset_code: l.assetCode,
    mint: l.mint,
    amount_base_units: l.amountBaseUnits,
    decimals: l.decimals,
    fee_amount: l.feeAmountBaseUnits,
    fee_asset_code: l.feeAssetCode,
    fee_bps: l.feeBps,
    fee_payer: l.feePayer,
    nft_valuation_amount: l.nftValuationSol ? l.nftValuationSol : null,
    nft_valuation_asset: l.assetType === "nft" ? "SOL" : null,
    nft_valuation_accepted_at: null,
  }));
}

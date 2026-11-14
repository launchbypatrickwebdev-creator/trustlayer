import { breakdownFee, normalizeFeeMode } from "@/lib/domain/fee";

/** What the buyer must lock (display + prepare face amount source of truth helpers). */
export function dealFundAmount(deal: {
  amount: string | number;
  fee_mode?: string | null;
  fee_bps?: number | null;
  fund_amount?: string | number | null;
}): string {
  if (deal.fund_amount != null && String(deal.fund_amount).trim() !== "") {
    return String(deal.fund_amount).trim();
  }
  return breakdownFee({
    amount: String(deal.amount),
    feeMode: normalizeFeeMode(deal.fee_mode),
    feeBps: deal.fee_bps,
  }).fundAmount;
}

export function dealSellerReceives(deal: {
  amount: string | number;
  fee_mode?: string | null;
  fee_bps?: number | null;
}): string {
  return breakdownFee({
    amount: String(deal.amount),
    feeMode: normalizeFeeMode(deal.fee_mode),
    feeBps: deal.fee_bps,
  }).sellerReceives;
}

import type { FiatProvider, FiatProviderStatus } from "@/lib/settlement/providers";

export type FiatSettlementRecord = {
  dealId: string;
  provider: FiatProvider;
  country: string;
  currency: string;
  amount: string;
  providerReference: string | null;
  collectionReference: string | null;
  payoutReference: string | null;
  providerStatus: FiatProviderStatus;
  settlementStatus: "not_started" | "collecting" | "collected" | "paying_out" | "settled" | "failed" | "refunded";
};

export function isProviderSuccess(status: FiatProviderStatus) {
  return status === "successful";
}

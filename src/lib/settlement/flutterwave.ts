import type { FiatSettlementProvider, FiatSettlementRequest, FiatSettlementResult } from "@/lib/settlement/providers";

/**
 * Phase 2 provider boundary for Flutterwave.
 * Live collection/payout is intentionally not enabled here. When commercial
 * provider approval and exact product limits are confirmed, this adapter can
 * be registered without changing the deal engine.
 */
export const flutterwaveProvider: FiatSettlementProvider = {
  name: "flutterwave",
  async createCollection(_input: FiatSettlementRequest): Promise<FiatSettlementResult> {
    throw new Error("Flutterwave fiat settlement is not enabled yet.");
  },
  async getStatus(_providerReference: string): Promise<FiatSettlementResult> {
    throw new Error("Flutterwave fiat settlement is not enabled yet.");
  },
  async verifyWebhook(_headers: Headers, _rawBody: string) {
    throw new Error("Flutterwave webhook verification is not enabled yet.");
  },
};

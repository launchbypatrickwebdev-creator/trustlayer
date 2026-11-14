export type FiatProvider = "flutterwave" | "paystack" | "interswitch" | (string & {});
export type FiatProviderStatus = "created" | "pending" | "successful" | "failed" | "cancelled" | "refunded";

export type FiatSettlementRequest = {
  dealId: string;
  amount: string;
  currency: string;
  countryCode: string;
  reference: string;
  returnUrl?: string;
  metadata?: Record<string, unknown>;
};

export type FiatSettlementResult = {
  provider: FiatProvider;
  providerReference: string;
  status: FiatProviderStatus;
  checkoutUrl?: string;
  raw?: unknown;
};

export interface FiatSettlementProvider {
  readonly name: FiatProvider;
  createCollection(input: FiatSettlementRequest): Promise<FiatSettlementResult>;
  getStatus(providerReference: string): Promise<FiatSettlementResult>;
  verifyWebhook(headers: Headers, rawBody: string): Promise<boolean>;
}

/** Provider-neutral registry. Live money movement stays disabled until a provider is explicitly configured. */
export const fiatProviders = new Map<FiatProvider, FiatSettlementProvider>();

export function getFiatProvider(name: string) {
  return fiatProviders.get(name as FiatProvider) ?? null;
}

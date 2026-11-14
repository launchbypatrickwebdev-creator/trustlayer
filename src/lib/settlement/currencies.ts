export type SupportedFiatCurrency = {
  code: string;
  countryCodes: string[];
  enabled: boolean;
  providerReviewRequired: boolean;
};

/** NGN is the first planned fiat launch currency; the model is intentionally multi-currency. */
export const FIAT_CURRENCIES: SupportedFiatCurrency[] = [
  { code: "NGN", countryCodes: ["NG"], enabled: true, providerReviewRequired: true },
];

export function getFiatCurrency(code: string) {
  return FIAT_CURRENCIES.find((currency) => currency.code === code.toUpperCase()) ?? null;
}

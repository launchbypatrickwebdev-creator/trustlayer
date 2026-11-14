export type VerificationLevel = 0 | 1 | 2 | 3;
export type EligibilityRail = "crypto" | "fiat";

export type FiatLimit = {
  currency: string;
  level: VerificationLevel;
  singleDeal: string;
  openExposure: string;
  label: string;
  requirements: string[];
};

/** TrustLayer product policy for NGN (not Flutterwave provider limits). */
export const NGN_LIMITS: Record<VerificationLevel, FiatLimit> = {
  0: {
    currency: "NGN",
    level: 0,
    singleDeal: "100000",
    openExposure: "200000",
    label: "Account",
    requirements: ["Verified TrustLayer account"],
  },
  1: {
    currency: "NGN",
    level: 1,
    singleDeal: "500000",
    openExposure: "1000000",
    label: "Basic identity",
    requirements: ["Basic identity verification"],
  },
  2: {
    currency: "NGN",
    level: 2,
    singleDeal: "2000000",
    openExposure: "5000000",
    label: "Identity + liveness",
    requirements: [
      "Government ID",
      "Live face verification",
      "Applicable NIN/BVN",
    ],
  },
  3: {
    currency: "NGN",
    level: 3,
    singleDeal: "10000000",
    openExposure: "25000000",
    label: "Enhanced",
    requirements: [
      "Level 2 verification",
      "Address verification / enhanced review",
    ],
  },
};

export function getFiatLimit(
  currency: string,
  level: VerificationLevel
): FiatLimit | null {
  const code = currency.trim().toUpperCase();
  if (code !== "NGN") return null;
  return NGN_LIMITS[level];
}

export function formatMoney(amount: string | number, currency: string) {
  const code = currency.toUpperCase();
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${amount} ${code}`;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: code,
    maximumFractionDigits: code === "NGN" ? 0 : 2,
  }).format(n);
}
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { getFiatLimit, type VerificationLevel } from "@/lib/compliance/limits";

export type FinancialEligibility = {
  rail: "crypto" | "fiat";
  currency: string;
  verificationLevel: VerificationLevel;
  singleDealLimit: string | null;
  openExposureLimit: string | null;
  openExposure: string;
  requiresEnhancedReview: boolean;
  requirements: string[];
};

const ACTIVE_STATUSES = [
  "awaiting_counterparty",
  "accepted",
  "awaiting_payment",
  "funded",
  "awaiting_delivery",
  "refund_pending",
  "disputed",
];

async function currentLevel(
  userId: string,
  rail: "crypto" | "fiat"
): Promise<VerificationLevel> {
  const admin = createSupabaseAdminClient();
  const { data } = await (admin as any)
    .from("verification_profiles")
    .select("crypto_level,fiat_level")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return 0;
  const raw = rail === "crypto" ? data.crypto_level : data.fiat_level;
  return ([0, 1, 2, 3].includes(Number(raw))
    ? Number(raw)
    : 0) as VerificationLevel;
}

export async function getFinancialEligibility(
  currency: string,
  rail: "crypto" | "fiat",
  userId?: string
): Promise<FinancialEligibility> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = userId || user?.id;
  if (!uid) throw new Error("Authentication required.");

  const code = currency.trim().toUpperCase();
  const level = await currentLevel(uid, rail);

  if (rail === "crypto") {
    return {
      rail,
      currency: code,
      verificationLevel: level,
      singleDealLimit: null,
      openExposureLimit: null,
      openExposure: "0",
      requiresEnhancedReview: false,
      requirements: [
        "TrustLayer account",
        "Normal wallet and blockchain verification",
      ],
    };
  }

  const policy = getFiatLimit(code, level);
  if (!policy) {
    return {
      rail,
      currency: code,
      verificationLevel: level,
      singleDealLimit: null,
      openExposureLimit: null,
      openExposure: "0",
      requiresEnhancedReview: true,
      requirements: ["Currency/jurisdiction eligibility review"],
    };
  }

  const { data: deals } = await supabase
    .from("deals")
    .select("amount,currency,status,rail")
    .or(
      `created_by.eq.${uid},buyer_id.eq.${uid},seller_id.eq.${uid}`
    )
    .eq("rail", "fiat")
    .eq("currency", code)
    .in("status", ACTIVE_STATUSES);

  const exposure = (deals ?? []).reduce(
    (sum, d) => sum + Number(d.amount || 0),
    0
  );

  return {
    rail,
    currency: code,
    verificationLevel: level,
    singleDealLimit: policy.singleDeal,
    openExposureLimit: policy.openExposure,
    openExposure: String(exposure),
    requiresEnhancedReview:
      Number(policy.singleDeal) >= 10_000_000 ||
      Number(policy.openExposure) >= 25_000_000,
    requirements: policy.requirements,
  };
}

export async function enforceFinancialEligibility(
  amount: string,
  currency: string,
  rail: "crypto" | "fiat"
) {
  // Crypto keeps existing on-chain controls only.
  if (rail === "crypto") return;

  const eligibility = await getFinancialEligibility(currency, rail);
  if (!eligibility.singleDealLimit || !eligibility.openExposureLimit) {
    throw new Error(
      `Fiat ${currency.toUpperCase()} eligibility requires jurisdiction and provider review.`
    );
  }
  if (Number(amount) > Number(eligibility.singleDealLimit)) {
    throw new Error(
      `This deal exceeds your current ${currency.toUpperCase()} single-deal limit of ${Number(eligibility.singleDealLimit).toLocaleString("en-NG")}. Complete the next verification level or request enhanced review.`
    );
  }
  if (
    Number(eligibility.openExposure) + Number(amount) >
    Number(eligibility.openExposureLimit)
  ) {
    throw new Error(
      `This deal would exceed your current ${currency.toUpperCase()} open-exposure limit of ${Number(eligibility.openExposureLimit).toLocaleString("en-NG")}.`
    );
  }
}
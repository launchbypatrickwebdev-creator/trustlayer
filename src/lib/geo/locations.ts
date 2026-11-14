/** Lightweight country list for profile (expand later). States for common markets. */
export const COUNTRIES = [
  { code: "NG", name: "Nigeria" },
  { code: "GH", name: "Ghana" },
  { code: "KE", name: "Kenya" },
  { code: "ZA", name: "South Africa" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "IN", name: "India" },
  { code: "SG", name: "Singapore" },
  { code: "AU", name: "Australia" },
] as const;

export const STATES_BY_COUNTRY: Record<string, { code: string; name: string }[]> = {
  NG: [
    { code: "AB", name: "Abia" },
    { code: "FC", name: "FCT — Abuja" },
    { code: "LA", name: "Lagos" },
    { code: "RI", name: "Rivers" },
    { code: "KN", name: "Kano" },
    { code: "OY", name: "Oyo" },
    { code: "KD", name: "Kaduna" },
    { code: "IM", name: "Imo" },
    { code: "AN", name: "Anambra" },
    { code: "ED", name: "Edo" },
    { code: "EN", name: "Enugu" },
    { code: "PL", name: "Plateau" },
    { code: "OG", name: "Ogun" },
    { code: "ON", name: "Ondo" },
    { code: "OS", name: "Osun" },
    { code: "DE", name: "Delta" },
    { code: "AK", name: "Akwa Ibom" },
    { code: "CR", name: "Cross River" },
    { code: "BO", name: "Borno" },
    { code: "SO", name: "Sokoto" },
  ],
  US: [
    { code: "CA", name: "California" },
    { code: "NY", name: "New York" },
    { code: "TX", name: "Texas" },
    { code: "FL", name: "Florida" },
    { code: "IL", name: "Illinois" },
    { code: "WA", name: "Washington" },
    { code: "MA", name: "Massachusetts" },
    { code: "GA", name: "Georgia" },
  ],
  GB: [
    { code: "ENG", name: "England" },
    { code: "SCT", name: "Scotland" },
    { code: "WLS", name: "Wales" },
    { code: "NIR", name: "Northern Ireland" },
  ],
};

/** ID types by country — verification UI is country-aware, not NIN/BVN-only. */
export const ID_TYPES_BY_COUNTRY: Record<string, string[]> = {
  NG: ["National ID (NIN)", "Bank Verification (BVN)", "Driver’s licence", "Passport"],
  GH: ["Ghana Card", "Passport"],
  KE: ["National ID", "Passport"],
  ZA: ["Smart ID", "Passport"],
  US: ["Driver’s licence", "State ID", "Passport"],
  GB: ["Passport", "Driving licence"],
  DEFAULT: ["Government ID", "Passport", "Proof of address"],
};

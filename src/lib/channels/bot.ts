export type BotChannel = "telegram" | "whatsapp" | "discord";

export type BotCapabilities = {
  getUserIdentity: true;
  getVerificationStatus: true;
  getFinancialEligibility: true;
  createDeal: true;
  getDeal: true;
  listDeals: true;
  getSettlement: true;
  getActivity: true;
  generateWebLink: true;
};

/**
 * Channel-neutral contract. Telegram/WhatsApp/Discord adapters translate their
 * native messages into these operations; they never own deal or settlement rules.
 */
export type BotOperation = keyof BotCapabilities;
export type BotWebLink = { path: string; token?: string };

export const BOT_OPERATIONS: readonly BotOperation[] = [
  "getUserIdentity", "getVerificationStatus", "getFinancialEligibility",
  "createDeal", "getDeal", "listDeals", "getSettlement", "getActivity", "generateWebLink",
] as const;

export function buildBotWebLink(path: string, token?: string): BotWebLink {
  return { path: path.startsWith("/") ? path : `/${path}`, token };
}

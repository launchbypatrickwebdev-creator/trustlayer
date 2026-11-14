/**
 * Settlement routing for TrustLayer deals.
 * rail  = crypto | fiat
 * chain = solana | ethereum | other
 * settlement_adapter = concrete executor used by the backend
 *
 * - solana_escrow — 1-leg Anchor program
 * - solana_ax     — 2-leg atomic exchange
 * - ethereum_escrow / fiat — reserved
 *
 * Legacy DB value "dvp" normalizes to solana_ax (not a live adapter name).
 */

export type DealRail = "crypto" | "fiat";
export type DealChain = "solana" | "ethereum" | "other";

export type SettlementAdapter =
  | "solana_escrow"
  | "solana_ax"
  | "ethereum_escrow"
  | "fiat";

export const DEFAULT_CHAIN: DealChain = "solana";
export const DEFAULT_CRYPTO_ADAPTER: SettlementAdapter = "solana_escrow";

const CHAINS: DealChain[] = ["solana", "ethereum", "other"];
const ADAPTERS: SettlementAdapter[] = [
  "solana_escrow",
  "solana_ax",
  "ethereum_escrow",
  "fiat",
];

export function normalizeChain(raw: string | null | undefined): DealChain {
  const c = String(raw || DEFAULT_CHAIN).toLowerCase().trim();
  if ((CHAINS as string[]).includes(c)) return c as DealChain;
  return DEFAULT_CHAIN;
}

export function normalizeSettlementAdapter(
  raw: string | null | undefined
): SettlementAdapter | null {
  if (raw == null || raw === "") return null;
  const a = String(raw).toLowerCase().trim();
  if (a === "dvp") return "solana_ax";
  if ((ADAPTERS as string[]).includes(a)) return a as SettlementAdapter;
  return null;
}

export function resolveSettlementAdapter(input: {
  rail: DealRail | string;
  chain?: string | null;
  settlementAdapter?: string | null;
}): { chain: DealChain | null; settlement_adapter: SettlementAdapter } {
  const rail = String(input.rail || "crypto").toLowerCase();

  if (rail === "fiat") {
    return { chain: null, settlement_adapter: "fiat" };
  }

  const explicit = normalizeSettlementAdapter(input.settlementAdapter);
  const chain = normalizeChain(input.chain);

  if (explicit === "fiat") {
    return { chain: null, settlement_adapter: "fiat" };
  }
  if (explicit === "solana_ax") {
    return { chain: "solana", settlement_adapter: "solana_ax" };
  }
  if (explicit === "solana_escrow") {
    return { chain: "solana", settlement_adapter: "solana_escrow" };
  }
  if (explicit === "ethereum_escrow") {
    return { chain: "ethereum", settlement_adapter: "ethereum_escrow" };
  }

  return { chain: "solana", settlement_adapter: "solana_escrow" };
}

export function isSettlementImplemented(adapter: SettlementAdapter): boolean {
  return adapter === "solana_escrow" || adapter === "solana_ax";
}

export function isAxAdapter(adapter: string | null | undefined): boolean {
  const a = String(adapter || "").toLowerCase();
  return a === "solana_ax" || a === "dvp" || a.includes("ax");
}

/** Partner API operation gates (not the same as on-chain/web support). */
export function isPartnerAxCreateEnabled(): boolean {
  return true;
}

export function isPartnerAxFundSessionEnabled(): boolean {
  return true;
}

export function isPartnerAxEventsEnabled(): boolean {
  return true;
}

/**
 * Partner-facing adapter support for create.
 * solana_ax requires partner_ax_create; ethereum/fiat still blocked.
 */
export function assertPartnerSettlementSupported(
  adapter: SettlementAdapter
): void {
  if (adapter === "solana_escrow") return;
  if (adapter === "solana_ax") {
    if (!isPartnerAxCreateEnabled()) {
      throw new Error(
        'settlement_adapter "solana_ax" is not enabled for Partner API yet.'
      );
    }
    return;
  }
  throw new Error(
    `settlement_adapter "${adapter}" is not available on Partner API. Use solana_escrow or solana_ax.`
  );
}

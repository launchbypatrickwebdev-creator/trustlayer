import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Enforce an owner's delegated execution grant for an agent-linked deal.
 * This authorizes policy only; the connected wallet must still sign the
 * unsigned transaction produced by TrustLayer's existing Solana route.
 */
export async function authorizeAgentDealExecution(input: {
  client: SupabaseClient;
  transactionId: string;
  scope: "deal:create" | "settlement:create" | "settlement:fund";
  assetCode: string;
  settlementType: "solana_escrow" | "solana_ax";
  walletAddress: string;
}): Promise<void> {
  const { data, error } = await input.client.rpc("tl_agent_authorize_execution", {
    p_transaction_id: input.transactionId,
    p_scope: input.scope,
    p_asset_code: input.assetCode.toUpperCase(),
    p_settlement_type: input.settlementType,
    p_wallet_address: input.walletAddress,
  });
  if (error || !data || (data as { allowed?: boolean }).allowed !== true) {
    throw new Error(error?.message || "Agent execution grant does not authorize this operation.");
  }
}

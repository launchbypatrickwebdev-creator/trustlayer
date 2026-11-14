/**
 * Public Partner API deal shape — stable contract, not raw DB columns.
 * 1-leg and Ax: settlements may include ax_leg_index; legs[] when Ax.
 */

export function serializePartnerDeal(
  deal: Record<string, unknown>,
  extras?: {
    external_id?: string | null;
    milestones?: unknown[];
    settlements?: unknown[];
    legs?: unknown[];
    actions?: Record<string, string>;
    buyer?: {
      external_id: string;
      user_id: string | null;
      claim_url?: string | null;
      claim_pending?: boolean;
    };
    seller?: {
      external_id: string;
      user_id: string | null;
      claim_url?: string | null;
      claim_pending?: boolean;
    };
  }
) {
  const id = String(deal.id);
  let openUrl: string | undefined;
  try {
    const configuredSite = process.env.NEXT_PUBLIC_SITE_URL;
    if (configuredSite) {
      const siteUrl = new URL(configuredSite);
      if (process.env.NODE_ENV !== "production" || siteUrl.protocol === "https:")
        openUrl = new URL(`/deals/${id}`, siteUrl).toString();
    }
  } catch {
    /* omit */
  }
  const rail = String(deal.rail || "crypto");
  const adapter = String(
    deal.settlement_adapter ??
      (rail === "fiat" ? "fiat" : "solana_escrow")
  );

  const settlements = (extras?.settlements ?? []).map((s: any) => {
    const status = String(s.onchain_status || s.status || "unknown");
    const base: Record<string, unknown> = {
      milestone_index: Number(s.milestone_index ?? 0),
      status,
      funded: Boolean(s.funded),
      rail,
      asset_code: s.asset_code ?? deal.asset_code ?? null,
    };
    if (s.ax_leg_index != null && s.ax_leg_index !== "") {
      base.ax_leg_index = Number(s.ax_leg_index);
    }
    if (rail === "crypto") {
      base.blockchain = {
        network: deal.chain || "solana",
        transaction_signature:
          s.last_tx_signature || s.release_tx_signature || s.fund_tx_signature || null,
        escrow_pda: s.escrow_pda || null,
      };
    } else {
      base.provider = { reference: s.provider_reference || null };
    }
    return base;
  });

  const legs = (extras?.legs ?? []).map((l: any) => {
    const decimals = Number(l.decimals ?? 0);
    let amount = l.amount != null ? String(l.amount) : null;
    if (amount == null && l.amount_base_units != null) {
      try {
        const units = BigInt(String(l.amount_base_units));
        const scale = 10n ** BigInt(Math.max(0, decimals));
        const whole = units / scale;
        const rem = (units % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
        amount = rem ? `${whole}.${rem}` : String(whole);
      } catch {
        amount = String(l.amount_base_units);
      }
    }
    return {
      leg_index: Number(l.leg_index),
      party_role: l.party_role ?? null,
      asset_code: l.asset_code ?? null,
      asset_type: l.asset_type ?? null,
      amount: amount ?? "0",
      decimals,
      fee_bps: l.fee_bps != null ? Number(l.fee_bps) : null,
      mint: l.mint ?? null,
    };
  });

  return {
    id,
    external_id: extras?.external_id ?? null,
    status: deal.status,
    title: deal.title,
    description: deal.description ?? null,
    amount: String(deal.amount ?? ""),
    currency: deal.currency ?? null,
    asset_code: deal.asset_code ?? null,
    rail,
    chain: deal.chain ?? (rail === "crypto" ? "solana" : null),
    settlement_adapter: adapter === "dvp" ? "solana_ax" : adapter,
    escrow_type: deal.escrow_type,
    agreed_deadline: deal.agreed_deadline ?? null,
    created_at: deal.created_at,
    updated_at: deal.updated_at ?? deal.created_at,
    milestones: extras?.milestones ?? [],
    legs,
    settlements,
    buyer: extras?.buyer ?? null,
    seller: extras?.seller ?? null,
    actions: {
      ...(openUrl ? { open: openUrl } : {}),
      ...(extras?.actions || {}),
    },
  };
}

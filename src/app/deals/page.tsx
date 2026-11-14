import { listMyDeals } from "@/lib/domain/deals";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import AuthenticatedShell from "@/components/layout/AuthenticatedShell";
import DealsWorkspace from "@/components/deals/DealsWorkspace";
import type { LegLike } from "@/lib/domain/deal-display";

export default async function DealsPage() {
  const deals = await listMyDeals();
  const ids = deals.map((d) => d.id);

  const legsByDeal: Record<string, LegLike[]> = {};
  if (ids.length > 0) {
    const admin = createSupabaseAdminClient();
    const { data: legRows } = await admin
      .from("deal_settlement_legs")
      .select(
        "deal_id, leg_index, asset_code, asset_type, amount_base_units, decimals, fee_amount, fee_bps, nft_valuation_amount"
      )
      .in("deal_id", ids)
      .order("leg_index", { ascending: true });
    for (const row of legRows || []) {
      const id = String((row as { deal_id: string }).deal_id);
      if (!legsByDeal[id]) legsByDeal[id] = [];
      legsByDeal[id].push(row as LegLike);
    }
  }

  return (
    <AuthenticatedShell>
      <DealsWorkspace
        deals={deals.map((d) => {
          const legs = legsByDeal[d.id] || [];
          const adapter = String(
            (d as { settlement_adapter?: string }).settlement_adapter ||
              (d as { settlement_kind?: string }).settlement_kind ||
              ""
          );
          return {
            id: d.id,
            deal_code: d.deal_code,
            title: d.title,
            amount: String(d.amount ?? ""),
            currency: String(d.currency ?? ""),
            asset_code: d.asset_code ? String(d.asset_code) : null,
            rail: String(d.rail ?? "crypto"),
            status: String(d.status ?? ""),
            created_at: d.created_at,
            updated_at: d.updated_at,
            settlement_adapter: adapter || null,
            legs,
          };
        })}
      />
    </AuthenticatedShell>
  );
}

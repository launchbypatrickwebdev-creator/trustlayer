import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { PartnerApiError } from "@/lib/api/errors";

export function mapPartnerEventType(internal: string): string {
  const map: Record<string, string> = {
    agreement_created: "deal.created",
    partner_deal_created: "deal.created",
    partner_api_deal_created: "deal.created",
    partner_deal_finalized: "deal.finalized",
    partner_api_deal_finalized: "deal.finalized",
    agreement_finalized: "deal.finalized",
    invitation_accepted: "deal.accepted",
    invitation_declined: "deal.declined",
    deal_funded: "deal.funded",
    settlement_funded: "settlement.funded",
    escrow_funded: "settlement.funded",
    release_confirmed: "settlement.released",
    cancel_confirmed: "settlement.cancelled",
    refund_confirmed: "settlement.refunded",
    admin_onchain_resolve_release: "settlement.released",
    admin_onchain_resolve_refund: "settlement.refunded",
    dispute_opened: "dispute.opened",
    dispute_resolved: "dispute.resolved",
    admin_review_deadline_extended: "dispute.review_extended",
    // Ax
    ax_created: "ax.created",
    ax_leg_funded: "ax.leg.funded",
    ax_ready: "ax.ready",
    ax_released: "ax.released",
    ax_cancelled: "ax.cancelled",
    ax_reclaimed: "ax.reclaimed",
    fund_ax_confirmed: "ax.leg.funded",
    release_ax_confirmed: "ax.released",
    cancel_ax_confirmed: "ax.cancelled",
  };
  return map[String(internal || "")] || `deal.event.${String(internal || "unknown")}`;
}

export type PartnerEvent = {
  id: string;
  type: string;
  deal_id: string;
  external_id: string | null;
  occurred_at: string;
  data: Record<string, unknown>;
};

export function encodeCursor(createdAt: string, id: string) {
  return Buffer.from(`${createdAt}|${id}`, "utf8").toString("base64url");
}
export function decodeCursor(cursor: string | null) {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const split = raw.lastIndexOf("|");
    if (split <= 0) return null;
    const createdAt = raw.slice(0, split);
    const id = raw.slice(split + 1);
    if (!Number.isFinite(Date.parse(createdAt)) || !/^\d+$/.test(id)) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

const SAFE_EVENT_FIELDS = new Set([
  "status",
  "milestone_index",
  "amount",
  "asset_code",
  "rail",
  "escrow_type",
  "transaction_signature",
  "tx_signature",
  "leg_index",
  "ax_leg_index",
  "party_role",
  "settlement_adapter",
  "funded_a",
  "funded_b",
  "chain",
]);

export function sanitizePartnerEventData(
  metadata: unknown,
  actorType: unknown,
  eventType: string
) {
  const safe: Record<string, unknown> = {
    internal_event_type: eventType,
    actor_type: actorType || "system",
  };
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    for (const [key, value] of Object.entries(
      metadata as Record<string, unknown>
    )) {
      if (
        SAFE_EVENT_FIELDS.has(key) &&
        (typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean" ||
          value === null)
      ) {
        safe[key] = value;
      }
    }
  }
  return safe;
}

export async function listPartnerEvents(opts: {
  partnerId: string;
  cursor?: string | null;
  limit?: number;
  environment?: "test" | "live";
}): Promise<{ events: PartnerEvent[]; next_cursor: string | null }> {
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 100);
  const decoded = decodeCursor(opts.cursor ?? null);
  if (opts.cursor && !decoded)
    throw new PartnerApiError("INVALID_REQUEST", "Invalid event cursor.", 400);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("partner_api_list_events", {
    p_partner_id: opts.partnerId,
    p_environment: opts.environment || "test",
    p_after_created_at: decoded?.createdAt || null,
    p_after_id: decoded ? Number(decoded.id) : null,
    p_limit: limit + 1,
  });
  if (error)
    throw new PartnerApiError("INTERNAL", "Unable to load partner events.", 500);
  const rows = (data || []) as any[];
  const page = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const events: PartnerEvent[] = page.map((row) => ({
    id: `evt_${row.event_id}`,
    type: mapPartnerEventType(row.event_type),
    deal_id: row.deal_id,
    external_id: row.external_id ?? null,
    occurred_at: row.created_at,
    data: sanitizePartnerEventData(
      row.metadata,
      row.actor_type,
      row.event_type
    ),
  }));
  const last = page[page.length - 1];
  return {
    events,
    next_cursor:
      hasMore && last ? encodeCursor(last.created_at, last.event_id) : null,
  };
}

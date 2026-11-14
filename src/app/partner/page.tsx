import Link from "next/link";
import PartnerShell from "@/components/partner/PartnerShell";
import { requirePartnerMember } from "@/lib/domain/partner-api/partner-console";

const STATUSES = [
  "draft",
  "awaiting_counterparty",
  "accepted",
  "awaiting_payment",
  "funded",
  "disputed",
  "completed",
  "released",
  "cancelled",
  "refunded",
];

type LegRow = {
  deal_id: string;
  leg_index: number;
  party_role: string | null;
  asset_code: string | null;
  amount_base_units: string | number | null;
  decimals: number | null;
};

function formatLegAmount(
  base: string | number | null | undefined,
  decimals: number | null | undefined,
  code: string | null | undefined
) {
  const d = Number(decimals ?? 0);
  const raw = Number(base ?? 0);
  if (!Number.isFinite(raw)) return `— ${code || ""}`.trim();
  const human = d > 0 ? raw / 10 ** d : raw;
  const text =
    human >= 1
      ? human.toLocaleString(undefined, { maximumFractionDigits: Math.min(d, 6) })
      : human.toFixed(Math.min(Math.max(d, 0), 9)).replace(/\.?0+$/, "");
  return `${text} ${code || ""}`.trim();
}

function isAxAdapter(adapter: string | null | undefined) {
  const a = String(adapter || "").toLowerCase();
  return a === "solana_ax" || a.includes("ax");
}

export default async function PartnerDealsPage({
  searchParams,
}: {
  searchParams: Promise<{
    partner?: string;
    environment?: string;
    search?: string;
    status?: string;
    cursor?: string;
  }>;
}) {
  const sp = await searchParams;
  const { membership, memberships, admin } = await requirePartnerMember({
    partnerIdQuery: sp.partner,
    allowedRoles: ["owner", "developer", "viewer"],
  });
  const environment = sp.environment === "live" ? "live" : "test";
  const search = (sp.search || "").trim();
  const status = STATUSES.includes(sp.status || "") ? sp.status : "";

  let query = admin
    .from("partner_deals")
    .select(
      "id,deal_id,external_id,environment,created_at,deals!inner(title,status,amount,currency,rail,asset_code,updated_at,settlement_adapter,chain)"
    )
    .eq("partner_id", membership.partnerId)
    .eq("environment", environment)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(26);

  if (search) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        search
      );
    query = isUuid
      ? query.eq("deal_id", search)
      : query.ilike("external_id", `%${search.replace(/[%_]/g, "\\$&")}%`);
  }
  if (status) query = query.eq("deals.status", status);

  if (sp.cursor) {
    try {
      const c = JSON.parse(
        Buffer.from(sp.cursor, "base64url").toString("utf8")
      ) as { created_at: string; id: string };
      query = query.or(
        `created_at.lt.${c.created_at},and(created_at.eq.${c.created_at},id.lt.${c.id})`
      );
    } catch {
      /* ignore bad cursor */
    }
  }

  const { data, error } = await query;
  const rows = (data || []) as any[];
  const hasMore = rows.length > 25;
  const shown = rows.slice(0, 25);
  const last = shown[shown.length - 1];
  const next =
    hasMore && last
      ? Buffer.from(
          JSON.stringify({ created_at: last.created_at, id: last.id })
        ).toString("base64url")
      : null;

  const dealIds = shown.map((r) => r.deal_id).filter(Boolean);
  const legsByDeal = new Map<string, LegRow[]>();
  if (dealIds.length) {
    const { data: legs } = await admin
      .from("deal_settlement_legs")
      .select(
        "deal_id,leg_index,party_role,asset_code,amount_base_units,decimals"
      )
      .in("deal_id", dealIds)
      .order("leg_index");
    for (const leg of (legs || []) as LegRow[]) {
      const list = legsByDeal.get(leg.deal_id) || [];
      list.push(leg);
      legsByDeal.set(leg.deal_id, list);
    }
  }

  const href = (extra: Record<string, string>) => {
    const p = new URLSearchParams({
      partner: membership.partnerId,
      environment,
      ...(search ? { search } : {}),
      ...(status ? { status } : {}),
      ...extra,
    });
    return `/partner/deals?${p.toString()}`;
  };

  return (
    <PartnerShell
      active="deals"
      partnerName={membership.partnerName}
      partnerId={membership.partnerId}
      memberships={memberships}
      role={membership.role}
      environmentHint={environment}
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Deals
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Partner-scoped deals for the{" "}
            <span className="font-semibold text-slate-200">{environment}</span>{" "}
            environment. Ax deals show both legs (not a single amount).
          </p>
        </div>
      </div>

      <form
        className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-[#1b3045] bg-[#0a1726] p-4"
        method="get"
      >
        <input type="hidden" name="partner" value={membership.partnerId} />
        <input type="hidden" name="environment" value={environment} />
        <label className="min-w-[12rem] flex-1 text-xs text-slate-400">
          Search
          <input
            name="search"
            defaultValue={search}
            placeholder="External ID or deal UUID"
            className="mt-1 w-full rounded-lg border border-[#1b3045] bg-[#0c1b2a] px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500/40"
          />
        </label>
        <label className="text-xs text-slate-400">
          Status
          <select
            name="status"
            defaultValue={status || ""}
            className="mt-1 block rounded-lg border border-[#1b3045] bg-[#0c1b2a] px-3 py-2 text-sm text-slate-200"
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-bold text-[#05201e]"
        >
          Apply filters
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-[#1b3045] bg-[#0a1726]">
        <div className="flex items-center justify-between border-b border-[#1b3045] px-5 py-4">
          <h2 className="text-sm font-bold text-white">
            {environment.toUpperCase()} deals
          </h2>
          <span className="text-xs text-slate-500">Latest 25 per page</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-[#1b3045] text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                {["Deal", "Settlement", "Amount / legs", "Status", "Updated"].map(
                  (h) => (
                    <th key={h} className="px-4 py-3">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#172a3d]">
              {error && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-rose-300"
                  >
                    Unable to load deals. Check the database migration and retry.
                  </td>
                </tr>
              )}
              {!error && shown.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-sm text-slate-500"
                  >
                    No deals match these filters.
                  </td>
                </tr>
              )}
              {shown.map((r: any) => {
                const d = Array.isArray(r.deals) ? r.deals[0] : r.deals;
                const adapter = String(d?.settlement_adapter || "");
                const ax = isAxAdapter(adapter);
                const legs = (legsByDeal.get(r.deal_id) || []).sort(
                  (a, b) => Number(a.leg_index) - Number(b.leg_index)
                );
                const amountLabel =
                  ax && legs.length >= 2
                    ? legs
                        .map((leg) =>
                          formatLegAmount(
                            leg.amount_base_units,
                            leg.decimals,
                            leg.asset_code
                          )
                        )
                        .join(" ↔ ")
                    : `${d?.amount ?? "—"} ${d?.currency || d?.asset_code || ""}`.trim();

                return (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/partner/deals/${r.deal_id}?partner=${membership.partnerId}`}
                        className="font-semibold text-slate-200 no-underline hover:text-emerald-200"
                      >
                        {d?.title || "Untitled deal"}
                      </Link>
                      <p className="mt-1 font-mono text-[11px] text-slate-500">
                        External ID: {r.external_id}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-slate-600">
                        {r.deal_id}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {ax ? (
                        <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-cyan-200">
                          Ax
                        </span>
                      ) : (
                        <span className="rounded-full border border-slate-500/30 bg-slate-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-300">
                          Escrow
                        </span>
                      )}
                      <p className="mt-1 text-[10px] uppercase text-slate-500">
                        {d?.rail || "—"}
                        {d?.chain ? ` · ${d.chain}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-200">
                      <span className="text-sm">{amountLabel}</span>
                      {!ax && d?.asset_code ? (
                        <p className="mt-1 text-[10px] text-slate-500">
                          {d.asset_code}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-500/15 px-2 py-1 text-[10px] font-bold uppercase text-slate-300">
                        {String(d?.status || "unknown").replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {d?.updated_at
                        ? new Date(d.updated_at).toLocaleString()
                        : new Date(r.created_at).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-[#1b3045] px-5 py-4">
          <span className="text-xs text-slate-500">
            Lifecycle status is not proof of on-chain settlement. Open a deal for
            leg-level fund state.
          </span>
          {next && (
            <Link
              href={href({ cursor: next })}
              className="rounded-lg border border-[#2a3d51] px-3 py-2 text-xs font-semibold text-slate-200 no-underline"
            >
              Next page →
            </Link>
          )}
        </div>
      </div>
    </PartnerShell>
  );
}

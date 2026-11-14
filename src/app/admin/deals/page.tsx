import TokenIcon from "@/components/TokenIcon";
import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import AdminPageHeader, { AdminPanel } from "@/components/admin/AdminPageHeader";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/domain/admin";

function formatBaseUnits(
  raw: string | number | null | undefined,
  decimals: number,
  code: string
): string {
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n)) return `0 ${code}`;
  const v = n / 10 ** (decimals || 0);
  const fixed = v >= 100 ? v.toFixed(2) : v >= 1 ? v.toFixed(4) : v.toFixed(6);
  return `${fixed.replace(/\.?0+$/, "")} ${code}`;
}

function humanStatus(s: string) {
  return String(s || "—").replaceAll("_", " ");
}

export default async function AdminDealsPage() {
  try {
    const { admin } = await requireAdminUser();
    const { data, error } = await admin
      .from("deals")
      .select(
        "id, deal_code, title, status, amount, currency, asset_code, rail, settlement_adapter, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const deals = data ?? [];
    const ids = deals.map((d: { id: string }) => d.id);
    const { data: legRows } = ids.length
      ? await admin
          .from("deal_settlement_legs")
          .select("deal_id, leg_index, asset_code, amount_base_units, decimals")
          .in("deal_id", ids)
          .order("leg_index", { ascending: true })
      : { data: [] };

    const legsByDeal = new Map<string, any[]>();
    for (const row of legRows ?? []) {
      const list = legsByDeal.get(row.deal_id) || [];
      list.push(row);
      legsByDeal.set(row.deal_id, list);
    }

    function amountCell(d: any) {
      const legs = legsByDeal.get(d.id) || [];
      const isAx =
        String(d.settlement_adapter || "").includes("ax") || legs.length >= 2;
      if (isAx && legs.length >= 2) {
        const a = legs.find((l: any) => Number(l.leg_index) === 0) || legs[0];
        const b = legs.find((l: any) => Number(l.leg_index) === 1) || legs[1];
        const codeA = String(a.asset_code || "SOL").toUpperCase();
        const codeB = String(b.asset_code || "SOL").toUpperCase();
        return (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <TokenIcon code={codeA} size={14} />
            <span>
              {formatBaseUnits(a.amount_base_units, Number(a.decimals ?? 9), codeA)}
            </span>
            <span className="text-[var(--tl-muted)]">↔</span>
            <TokenIcon code={codeB} size={14} />
            <span>
              {formatBaseUnits(b.amount_base_units, Number(b.decimals ?? 6), codeB)}
            </span>
          </span>
        );
      }
      const code = String(d.asset_code || d.currency || "SOL").toUpperCase();
      return (
        <span className="inline-flex items-center gap-1">
          {d.amount} <TokenIcon code={code} size={14} /> {code}
        </span>
      );
    }

    return (
      <AdminShell active="deals" breadcrumb="Deals">
        <AdminPageHeader
          title="Platform deals"
          description="All TrustLayer deals (admin service role). Ax rows show both legs."
        />
        <AdminPanel>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--tl-bg-elevated)] text-xs uppercase tracking-wide text-[var(--tl-muted)]">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Asset / amount</th>
                  <th className="px-4 py-3">Rail</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--tl-line)]">
                {deals.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-[var(--tl-muted)]">
                      No deals on the platform yet.
                    </td>
                  </tr>
                ) : (
                  deals.map((d: any) => (
                    <tr key={d.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-mono text-xs text-[var(--tl-emerald)]">
                        {d.deal_code}
                      </td>
                      <td className="px-4 py-3 font-semibold">{d.title}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] px-2.5 py-0.5 text-xs font-bold capitalize">
                          {humanStatus(d.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">{amountCell(d)}</td>
                      <td className="px-4 py-3 text-xs capitalize text-[var(--tl-muted)]">
                        {d.rail}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--tl-muted)]">
                        {d.created_at
                          ? new Date(d.created_at).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/deals/${d.id}`}
                          className="text-sm font-bold text-[var(--tl-emerald)] no-underline"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </AdminPanel>
      </AdminShell>
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required.")
      redirect("/login");
    if (error instanceof Error && error.message === "Admin access required.")
      redirect("/dashboard");
    throw error;
  }
}

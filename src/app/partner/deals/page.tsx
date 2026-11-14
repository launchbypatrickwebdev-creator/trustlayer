import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import PartnerShell from "@/components/partner/PartnerShell";
import { requirePartnerMember } from "@/lib/domain/partner-api/partner-console";

function isAxAdapter(adapter: string | null | undefined) {
  const a = String(adapter || "").toLowerCase();
  return a === "solana_ax" || a.includes("ax");
}

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

export default async function PartnerDealDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ partner?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { membership, memberships, admin } = await requirePartnerMember({
    partnerIdQuery: sp.partner,
    allowedRoles: ["owner", "developer", "viewer"],
  });

  const { data: link } = await admin
    .from("partner_deals")
    .select("id,deal_id,external_id,environment,created_at")
    .eq("partner_id", membership.partnerId)
    .eq("deal_id", id)
    .maybeSingle();
  if (!link) notFound();

  const [
    { data: deal },
    { data: milestones },
    { data: settlements },
    { data: legs },
    { data: events },
  ] = await Promise.all([
    admin
      .from("deals")
      .select(
        "id,deal_code,title,description,amount,currency,rail,asset_code,status,escrow_type,milestone_count,created_at,updated_at,deadline,agreed_deadline,settlement_adapter,chain,ax_release_authority,creator_checklist"
      )
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("deal_milestones")
      .select("milestone_index,label,amount")
      .eq("deal_id", id)
      .order("milestone_index"),
    admin
      .from("crypto_settlements")
      .select(
        "milestone_index,ax_leg_index,onchain_status,funded,asset_code,amount_base_units,create_tx_signature,fund_tx_signature,last_tx_signature,escrow_pda,release_tx_signature,cancel_tx_signature"
      )
      .eq("deal_id", id)
      .order("ax_leg_index", { ascending: true, nullsFirst: true }),
    admin
      .from("deal_settlement_legs")
      .select(
        "leg_index,party_role,asset_code,asset_type,amount_base_units,decimals,fee_amount,fee_bps,fee_asset_code,mint"
      )
      .eq("deal_id", id)
      .order("leg_index"),
    admin
      .from("deal_events")
      .select("id,event_type,created_at,metadata,actor_type")
      .eq("deal_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  if (!deal) notFound();

  const q = `?partner=${membership.partnerId}`;
  const ax = isAxAdapter(
    (deal as { settlement_adapter?: string }).settlement_adapter
  );
  const legRows = (legs || []) as any[];
  const settlementRows = (settlements || []) as any[];

  const leg0 = legRows.find((l) => Number(l.leg_index) === 0);
  const leg1 = legRows.find((l) => Number(l.leg_index) === 1);
  const settle0 =
    settlementRows.find((s) => s.ax_leg_index === 0) ||
    settlementRows.find((s) => s.ax_leg_index == null);
  const settle1 = settlementRows.find((s) => s.ax_leg_index === 1);

  const fundedA = Boolean(settle0?.funded);
  const fundedB = Boolean(settle1?.funded);
  const bothFunded = ax ? fundedA && fundedB : settlementRows.some((s) => s.funded);

  const onchainStatuses = [
    ...new Set(
      settlementRows.map((s) => String(s.onchain_status || "")).filter(Boolean)
    ),
  ];
  const aggregateOnchain =
    onchainStatuses.length === 0
      ? "not_created"
      : onchainStatuses.includes("disputed")
        ? "disputed"
        : onchainStatuses.includes("funded") && bothFunded
          ? "funded"
          : onchainStatuses[0];

  const checklist = (deal as { creator_checklist?: any }).creator_checklist;
  const releaseMode =
    typeof checklist === "object" && checklist
      ? String(checklist.releaseAuthorityMode || checklist.release_authority_mode || "admin")
      : "admin";
  const releaseAuthority =
    String(
      (deal as { ax_release_authority?: string }).ax_release_authority ||
        (typeof checklist === "object" && checklist
          ? checklist.releaseAuthorityPubkey || checklist.release_authority_pubkey
          : "") ||
        ""
    ).trim() || null;

  return (
    <PartnerShell
      active="deals"
      partnerName={membership.partnerName}
      partnerId={membership.partnerId}
      memberships={memberships}
      role={membership.role}
      environmentHint={link.environment}
    >
      <Link
        href={`/partner/deals${q}`}
        className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-slate-400 no-underline hover:text-white"
      >
        <ArrowLeft size={14} /> Back to deals
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-white">
              {deal.title || "Deal"}
            </h1>
            {ax ? (
              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase text-cyan-200">
                Atomic exchange
              </span>
            ) : (
              <span className="rounded-full border border-slate-500/30 bg-slate-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase text-slate-300">
                One-leg escrow
              </span>
            )}
          </div>
          <p className="mt-2 font-mono text-xs text-slate-500">
            {deal.deal_code || deal.id} · External {link.external_id}
          </p>
          {deal.description ? (
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              {deal.description}
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <span className="rounded-full bg-slate-500/15 px-3 py-1 text-[11px] font-bold uppercase text-slate-300">
            {String(deal.status || "unknown").replaceAll("_", " ")}
          </span>
          <p className="mt-2 text-[11px] text-slate-500">
            Env: {link.environment}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-[#1b3045] bg-[#0a1726] p-5 lg:col-span-1">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-300" />
            <h2 className="text-sm font-bold text-white">Summary</h2>
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-[10px] uppercase text-slate-500">Rail</dt>
              <dd className="mt-0.5 text-slate-200">
                {deal.rail || "—"}
                {(deal as any).chain ? ` · ${(deal as any).chain}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase text-slate-500">Adapter</dt>
              <dd className="mt-0.5 font-mono text-xs text-emerald-200">
                {(deal as any).settlement_adapter || "—"}
              </dd>
            </div>
            {!ax && (
              <div>
                <dt className="text-[10px] uppercase text-slate-500">Amount</dt>
                <dd className="mt-0.5 text-slate-200">
                  {deal.amount} {deal.currency || deal.asset_code || ""}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-[10px] uppercase text-slate-500">
                On-chain (aggregate)
              </dt>
              <dd className="mt-0.5 text-slate-200">{aggregateOnchain}</dd>
            </div>
            {ax && (
              <div>
                <dt className="text-[10px] uppercase text-slate-500">
                  Release policy
                </dt>
                <dd className="mt-0.5 text-xs leading-5 text-slate-300">
                  Authority only ({releaseMode}
                  {releaseAuthority
                    ? ` · ${releaseAuthority.slice(0, 8)}…`
                    : " · TrustLayer admin"}
                  ). Parties do not release Ax from Partner Console.
                </dd>
              </div>
            )}
          </dl>
        </section>

        <section className="rounded-2xl border border-[#1b3045] bg-[#0a1726] p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-300" />
            <h2 className="text-sm font-bold text-white">
              {ax ? "Legs & fund status" : "Settlements"}
            </h2>
          </div>

          {ax ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                { leg: leg0, settle: settle0, index: 0, label: "Leg A · buyer" },
                { leg: leg1, settle: settle1, index: 1, label: "Leg B · seller" },
              ].map(({ leg, settle, index, label }) => (
                <div
                  key={index}
                  className="rounded-xl border border-[#1b3045] bg-[#0c1b2a] p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                      {label}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        settle?.funded
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-slate-500/15 text-slate-400"
                      }`}
                    >
                      {settle?.funded ? "Funded" : "Unfunded"}
                    </span>
                  </div>
                  <p className="mt-3 text-lg font-semibold text-white">
                    {leg
                      ? formatLegAmount(
                          leg.amount_base_units,
                          leg.decimals,
                          leg.asset_code
                        )
                      : "—"}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    On-chain: {settle?.onchain_status || "not_created"}
                    {leg?.fee_bps != null ? ` · fee ${leg.fee_bps} bps` : ""}
                  </p>
                  {settle?.fund_tx_signature ? (
                    <p className="mt-2 break-all font-mono text-[10px] text-emerald-200">
                      Fund tx: {settle.fund_tx_signature}
                    </p>
                  ) : null}
                  {settle?.create_tx_signature ? (
                    <p className="mt-1 break-all font-mono text-[10px] text-slate-500">
                      Create: {settle.create_tx_signature}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {settlementRows.length === 0 && (
                <p className="text-sm text-slate-500">No settlement rows yet.</p>
              )}
              {settlementRows.map((s: any, i: number) => (
                <div
                  key={i}
                  className="rounded-xl border border-[#1b3045] bg-[#0c1b2a] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-200">
                      Milestone {Number(s.milestone_index ?? 0) + 1}
                    </p>
                    <span className="text-xs text-slate-300">
                      {s.onchain_status || "unknown"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Funded: {s.funded ? "Yes" : "No"} · Asset:{" "}
                    {s.asset_code || deal.asset_code || "—"}
                  </p>
                  {(s.last_tx_signature || s.release_tx_signature) && (
                    <p className="mt-2 break-all font-mono text-[10px] text-emerald-200">
                      Transaction: {s.last_tx_signature || s.release_tx_signature}
                    </p>
                  )}
                  {s.escrow_pda && (
                    <p className="mt-1 break-all font-mono text-[10px] text-slate-500">
                      Escrow PDA: {s.escrow_pda}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {ax && bothFunded && (
            <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs leading-5 text-amber-100">
              Both legs funded. Settlement is <strong>authority-only</strong>{" "}
              (admin or deal authority wallet). Partner Console does not offer
              party Release / Cancel Ax. Parties may open a dispute from the
              TrustLayer app; authority settles from the admin / authority
              session.
            </div>
          )}
        </section>
      </div>

      {!ax && (
        <section className="mt-6 rounded-2xl border border-[#1b3045] bg-[#0a1726] p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-300" />
            <h2 className="text-sm font-bold text-white">Milestones</h2>
          </div>
          <div className="mt-4 space-y-2">
            {(milestones || []).length === 0 && (
              <p className="text-sm text-slate-500">No milestone rows found.</p>
            )}
            {(milestones || []).map((m: any) => (
              <div
                key={m.milestone_index}
                className="flex items-center justify-between gap-3 rounded-xl border border-[#1b3045] bg-[#0c1b2a] p-3"
              >
                <div>
                  <p className="text-xs font-semibold text-slate-200">
                    {m.label || `Milestone ${Number(m.milestone_index) + 1}`}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Index {m.milestone_index}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-200">
                    {m.amount} {deal.currency}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6 overflow-hidden rounded-2xl border border-[#1b3045] bg-[#0a1726]">
        <div className="border-b border-[#1b3045] px-5 py-4">
          <h2 className="text-sm font-bold text-white">Deal event timeline</h2>
        </div>
        <div className="divide-y divide-[#172a3d]">
          {(events || []).length === 0 && (
            <p className="px-5 py-8 text-sm text-slate-500">
              No event history found.
            </p>
          )}
          {(events || []).map((e: any) => (
            <div key={e.id} className="flex items-start gap-3 px-5 py-4">
              <span className="mt-0.5 rounded-lg bg-emerald-300/10 p-2 text-emerald-200">
                <Clock3 size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-200">
                  {e.event_type}
                </p>
                <p className="mt-1 text-[10px] text-slate-500">
                  {new Date(e.created_at).toLocaleString()} ·{" "}
                  {e.actor_type || "system"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-4 text-[11px] text-slate-600">
        Created {new Date(deal.created_at).toLocaleString()} · Updated{" "}
        {new Date(deal.updated_at).toLocaleString()} ·{" "}
        <Link
          href="/developers"
          className="text-emerald-300 no-underline"
        >
          API reference <ExternalLink className="inline" size={11} />
        </Link>
      </p>
    </PartnerShell>
  );
}

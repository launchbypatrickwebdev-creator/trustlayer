import TokenIcon from "@/components/TokenIcon";
import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { redirect } from "next/navigation";
import { Gavel } from "lucide-react";
import { requireAdminUser } from "@/lib/domain/admin";
import LiveAdminSync from "@/components/realtime/LiveAdminSync";

type Row = {
  dispute_id: string;
  deal_id: string;
  milestone_index: number;
  deal_code: string;
  title: string;
  amount: string | number;
  currency: string;
  asset_code?: string | null;
  rail?: string;
  dispute_status: string;
  deal_status?: string;
  reason?: string;
  opened_at?: string;
};

function statusTone(status?: string | null) {
  const s = String(status || "").toLowerCase();
  if (s.startsWith("resolved")) return "bg-amber-500/15 text-amber-200";
  if (s === "open") return "bg-red-500/15 text-red-300";
  return "bg-white/5 text-[var(--tl-muted)]";
}

function isOpen(status?: string | null) {
  return String(status || "").toLowerCase() === "open";
}

export default async function AdminDisputesPage() {
  try {
    const { user, admin } = await requireAdminUser();
    const { data, error } = await (admin.rpc as any)("admin_list_disputes", {
      p_admin_user_id: user.id,
    });
    if (error) throw new Error(error.message);

    const disputes = (data ?? []) as Row[];
    const open = disputes.filter((d) => isOpen(d.dispute_status));
    const closed = disputes.filter((d) => !isOpen(d.dispute_status));

    return (
      <AdminShell
        active="disputes"
        breadcrumb="Disputes"
        openDisputes={open.length}
      >
        <LiveAdminSync />
        <AdminPageHeader
          eyebrow="Operations"
          title="Dispute queue"
          description="Open items first. Resolve on-chain from the dispute detail — release, refund, or reconcile a confirmed signature."
          actions={
            <div className="flex gap-2">
              <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-300">
                {open.length} open
              </span>
              <span className="rounded-full border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] px-2.5 py-1 text-xs font-bold text-[var(--tl-muted)]">
                {closed.length} closed
              </span>
            </div>
          }
        />

        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--tl-muted)]">
            Open
          </h2>
          {open.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--tl-line)] px-5 py-10 text-center text-sm text-[var(--tl-muted)]">
              No open disputes.
            </div>
          ) : (
            <div className="grid gap-3">
              {open.map((d) => (
                <DisputeCard key={d.dispute_id} d={d} />
              ))}
            </div>
          )}
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--tl-muted)]">
            Resolved / closed
          </h2>
          {closed.length === 0 ? (
            <p className="text-sm text-[var(--tl-muted)]">None yet.</p>
          ) : (
            <div className="grid gap-3">
              {closed.map((d) => (
                <DisputeCard key={d.dispute_id} d={d} muted />
              ))}
            </div>
          )}
        </section>
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

function DisputeCard({ d, muted }: { d: Row; muted?: boolean }) {
  const asset = d.asset_code || d.currency || "";
  const st = d.dispute_status || "unknown";
  return (
    <Link
      href={`/admin/disputes/${d.dispute_id}`}
      className={`block rounded-2xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-5 no-underline transition hover:border-[var(--tl-emerald)] ${
        muted ? "opacity-85" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-[var(--tl-muted)]">{d.deal_code}</p>
          <h3 className="mt-1 text-lg font-black">{d.title || "Deal"}</h3>
          <p className="mt-1 text-sm text-[var(--tl-muted)]">
            Milestone {Number(d.milestone_index) + 1}
            {d.amount != null ? (
              <span className="inline-flex items-center gap-1">
                {" "}
                · {d.amount} <TokenIcon code={asset} size={14} /> {asset}
              </span>
            ) : null}
          </p>
          {d.reason ? (
            <p className="mt-2 text-sm">{d.reason}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusTone(st)}`}>
            {String(st).replaceAll("_", " ")}
          </span>
          {isOpen(st) ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--tl-emerald-soft)] px-2.5 py-1 text-xs font-bold text-[var(--tl-emerald)]">
              <Gavel size={12} /> Needs action
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

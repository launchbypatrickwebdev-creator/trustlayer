import AdminShell from "@/components/admin/AdminShell";
import PartnersAdminPanel from "@/components/admin/PartnersAdminPanel";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { requireAdminUser } from "@/lib/domain/admin";
import { redirect } from "next/navigation";

export default async function AdminPartnersPage() {
  try {
    const { admin } = await requireAdminUser();
    const { data: partners, error: pErr } = await admin
      .from("api_partners")
      .select("id, name, status, created_at")
      .order("created_at", { ascending: false });
    if (pErr) throw new Error(pErr.message);

    const partnerIds = (partners ?? []).map((p: { id: string }) => p.id);
    const { data: credentials, error: cErr } = partnerIds.length
      ? await admin
          .from("api_credentials")
          .select(
            "id, partner_id, key_prefix, environment, status, scopes, last_used_at, created_at, revoked_at"
          )
          .in("partner_id", partnerIds)
          .order("created_at", { ascending: false })
      : { data: [], error: null };
    if (cErr) throw new Error(cErr.message);

    const rows = (partners ?? []).map((p: any) => ({
      ...p,
      credentials: (credentials ?? []).filter((c: any) => c.partner_id === p.id),
    }));
    const allCreds = credentials ?? [];
    const stats = {
      partners: rows.length,
      keys: allCreds.length,
      active: allCreds.filter((c: any) => c.status === "active").length,
      revoked: allCreds.filter((c: any) => c.status === "revoked").length,
    };

    return (
      <AdminShell active="partners" breadcrumb="Partners">
        <AdminPageHeader
          title="Partners"
          description="API partners, test/live keys, and revoke. Secrets show once at issue time."
        />
        <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Partners", value: stats.partners },
            { label: "Total keys", value: stats.keys },
            { label: "Active", value: stats.active },
            { label: "Revoked", value: stats.revoked },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-4"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--tl-muted)]">
                {s.label}
              </p>
              <p className="mt-2 text-2xl font-black">{s.value}</p>
            </div>
          ))}
        </div>
        <PartnersAdminPanel initialPartners={rows} />
      </AdminShell>
    );
  } catch {
    redirect("/login?next=/admin/partners");
  }
}

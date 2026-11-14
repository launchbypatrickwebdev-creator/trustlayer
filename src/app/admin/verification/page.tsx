import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import AdminPageHeader, { AdminPanel } from "@/components/admin/AdminPageHeader";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/domain/admin";

export default async function AdminVerificationPage() {
  try {
    const { admin } = await requireAdminUser();
    let data: any[] = [];
    try {
      const res = await admin
        .from("user_verification")
        .select("user_id, verification_status, fiat_level, updated_at")
        .order("updated_at", { ascending: false })
        .limit(100);
      if (!res.error) data = res.data ?? [];
      else {
        const res2 = await admin
          .from("profiles")
          .select("id, created_at")
          .limit(50);
        data = (res2.data ?? []).map((p: any) => ({
          user_id: p.id,
          verification_status: "unverified",
          fiat_level: 0,
          updated_at: p.created_at,
        }));
      }
    } catch {
      data = [];
    }

    return (
      <AdminShell active="verification" breadcrumb="Verification">
        <AdminPageHeader
          eyebrow="Compliance operations"
          title="Verification queue"
          description="Fiat eligibility levels. Country-specific ID checks apply when fiat rails go live — not required for non-custodial crypto."
        />
        <AdminPanel>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--tl-bg-elevated)] text-xs uppercase tracking-wide text-[var(--tl-muted)]">
                <tr>
                  <th className="px-5 py-4">User</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Fiat</th>
                  <th className="px-5 py-4">Crypto note</th>
                  <th className="px-5 py-4">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--tl-line)]">
                {data.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-10 text-center text-[var(--tl-muted)]"
                    >
                      No verification profiles yet.
                    </td>
                  </tr>
                ) : (
                  data.map((v: any) => (
                    <tr key={v.user_id} className="hover:bg-white/[0.02]">
                      <td className="px-5 py-4 font-mono text-xs">
                        <Link
                          href={`/admin/users/${v.user_id}`}
                          className="text-[var(--tl-emerald)] no-underline"
                        >
                          {v.user_id}
                        </Link>
                      </td>
                      <td className="px-5 py-4 capitalize">
                        {String(v.verification_status || "—").replaceAll(
                          "_",
                          " "
                        )}
                      </td>
                      <td className="px-5 py-4 font-bold">L{v.fiat_level ?? 0}</td>
                      <td className="px-5 py-4 text-[var(--tl-muted)]">
                        wallet-authorized
                      </td>
                      <td className="px-5 py-4 text-xs text-[var(--tl-muted)]">
                        {v.updated_at
                          ? new Date(v.updated_at).toLocaleString()
                          : "—"}
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

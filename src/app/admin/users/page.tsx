import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import AdminPageHeader, { AdminPanel } from "@/components/admin/AdminPageHeader";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/domain/admin";

export default async function AdminUsersPage() {
  try {
    const { admin } = await requireAdminUser();
    const { data: profiles, error } = await admin
      .from("profiles")
      .select(
        "id, username, display_name, full_name, country, account_status, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const ids = (profiles ?? []).map((p: any) => p.id);
    const { data: devices } = ids.length
      ? await (admin as any)
          .from("device_bindings")
          .select("user_id")
          .in("user_id", ids)
      : { data: [] };
    const deviceCount = new Map<string, number>();
    for (const d of devices ?? []) {
      deviceCount.set(d.user_id, (deviceCount.get(d.user_id) || 0) + 1);
    }

    return (
      <AdminShell active="users" breadcrumb="Users">
        <AdminPageHeader
          title="Users"
          description="Platform accounts, status, and device signals. Open a user for full detail."
        />
        <AdminPanel>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--tl-bg-elevated)] text-xs uppercase tracking-wide text-[var(--tl-muted)]">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Country</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Devices</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--tl-line)]">
                {(profiles ?? []).map((p: any) => {
                  const name =
                    p.display_name || p.full_name || p.username || p.id;
                  const handle = p.username ? `@${p.username}` : p.id.slice(0, 8);
                  return (
                    <tr key={p.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <div className="font-semibold">{name}</div>
                        <div className="text-xs text-[var(--tl-muted)]">{handle}</div>
                      </td>
                      <td className="px-4 py-3 text-[var(--tl-muted)]">
                        {p.country || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-[var(--tl-emerald)]/30 bg-[var(--tl-emerald-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--tl-emerald)]">
                          {p.account_status || "active"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--tl-muted)]">
                        {deviceCount.get(p.id) || 0}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--tl-muted)]">
                        {p.created_at
                          ? new Date(p.created_at).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/users/${p.id}`}
                          className="text-sm font-bold text-[var(--tl-emerald)] no-underline"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
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

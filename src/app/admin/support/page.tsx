import AdminShell from "@/components/admin/AdminShell";
import AdminPageHeader, { AdminPanel } from "@/components/admin/AdminPageHeader";
import { requireAdminUser } from "@/lib/domain/admin";
import { redirect } from "next/navigation";

export default async function AdminSupportPage() {
  try {
    await requireAdminUser();
    return (
      <AdminShell active="support" breadcrumb="Support">
        <AdminPageHeader
          eyebrow="Customer operations"
          title="Support queue"
          description="User inquiries and issue reports, linked to the same TrustLayer account and deal context."
        />
        <AdminPanel className="px-5 py-14 text-center text-sm text-[var(--tl-muted)]">
          No support requests yet.
        </AdminPanel>
      </AdminShell>
    );
  } catch {
    redirect("/login?next=/admin/support");
  }
}

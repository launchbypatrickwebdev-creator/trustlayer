import AdminShell from "@/components/admin/AdminShell";
import AdminPageHeader, { AdminPanel } from "@/components/admin/AdminPageHeader";
import AdminReconcileForm from "@/components/admin/AdminReconcileForm";
import { requireAdminUser } from "@/lib/domain/admin";
import { redirect } from "next/navigation";

export default async function AdminReconcilePage() {
  try {
    await requireAdminUser();
    return (
      <AdminShell active="reconcile" breadcrumb="Reconciliation">
        <AdminPageHeader
          title="Reconcile from chain"
          description="Use when Solana confirmed a release, cancel, or admin resolve but the database did not update. Paste dispute id + signature — no new blockchain transaction is submitted."
        />
        <AdminPanel className="p-6 sm:p-8">
          <AdminReconcileForm />
        </AdminPanel>
      </AdminShell>
    );
  } catch {
    redirect("/login?next=/admin/reconcile");
  }
}

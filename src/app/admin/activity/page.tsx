import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/domain/admin";

export default async function AdminActivityPage() {
  try {
    const { admin } = await requireAdminUser();
    const { data, error } = await admin
      .from("deal_events")
      .select(
        "id, deal_id, event_type, actor_type, actor_user_id, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(150);
    if (error) throw new Error(error.message);

    const dealIds = [
      ...new Set((data ?? []).map((e: any) => e.deal_id).filter(Boolean)),
    ];
    const { data: deals } = dealIds.length
      ? await admin.from("deals").select("id, deal_code, title").in("id", dealIds)
      : { data: [] };
    const dealMap = new Map((deals ?? []).map((d: any) => [d.id, d]));

    return (
      <AdminShell active="activity" breadcrumb="Activity">
        <AdminPageHeader
          title="Platform activity"
          description="Global deal_events stream (all users). Same event model the bot/API will consume."
        />
        <ul className="space-y-3">
          {(data ?? []).length === 0 ? (
            <li className="rounded-2xl border border-dashed border-[var(--tl-line)] px-5 py-10 text-center text-sm text-[var(--tl-muted)]">
              No events yet.
            </li>
          ) : (
            (data ?? []).map((e: any) => {
              const deal = dealMap.get(e.deal_id);
              return (
                <li
                  key={e.id}
                  className="rounded-2xl border border-[var(--tl-line)] bg-[var(--tl-card)] px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold">
                      {String(e.event_type || "").replaceAll("_", " ")}
                    </p>
                    <p className="text-xs text-[var(--tl-muted)]">
                      {e.created_at
                        ? new Date(e.created_at).toLocaleString()
                        : ""}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-[var(--tl-muted)]">
                    {deal ? (
                      <Link
                        href={`/deals/${e.deal_id}`}
                        className="font-semibold text-[var(--tl-emerald)] no-underline"
                      >
                        {deal.deal_code} · {deal.title}
                      </Link>
                    ) : (
                      <span className="font-mono text-xs">{e.deal_id}</span>
                    )}
                    {" · "}
                    {e.actor_type || "system"}
                  </p>
                </li>
              );
            })
          )}
        </ul>
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

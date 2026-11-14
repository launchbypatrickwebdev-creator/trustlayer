import PartnerShell from "@/components/partner/PartnerShell";
import PartnerTaskManager from "@/components/partner/PartnerTaskManager";
import { requirePartnerMember } from "@/lib/domain/partner-api/partner-console";

export default async function PartnerTasksPage({ searchParams }: { searchParams: Promise<{ partner?: string }> }) {
  const sp = await searchParams;
  const { membership, memberships, admin } = await requirePartnerMember({ partnerIdQuery: sp.partner, allowedRoles: ["owner", "operator"] });
  let taskQuery = admin.from("partner_tasks").select("id,partner_id,title,description,status,priority,assigned_to,created_by,due_at,related_reference,completion_note,completed_at,created_at,updated_at").eq("partner_id", membership.partnerId).order("created_at", { ascending: false }).limit(200);
  if (membership.role !== "owner") taskQuery = taskQuery.eq("assigned_to", membership.userId);
  const [{ data: tasks, error: taskError }, { data: memberRows }] = await Promise.all([
    taskQuery,
    admin.from("partner_members").select("user_id,role").eq("partner_id", membership.partnerId).eq("role", "operator"),
  ]);
  const operatorIds = (memberRows || []).map((m: any) => m.user_id);
  const { data: profiles } = operatorIds.length ? await admin.from("profiles").select("id,full_name,display_name,username,account_status").in("id", operatorIds) : { data: [] as any[] };
  const activeProfiles = (profiles || []).filter((p: any) => p.account_status === "active");
  const profileMap = new Map(activeProfiles.map((p: any) => [String(p.id), String(p.display_name || p.full_name || p.username || p.id)]));
  const operators = operatorIds.filter((user_id: string) => profileMap.has(user_id)).map((user_id: string) => ({ user_id, label: `${profileMap.get(user_id)} · ${user_id.slice(0, 8)}` }));
  return <PartnerShell active="tasks" partnerName={membership.partnerName} partnerId={membership.partnerId} memberships={memberships} role={membership.role} environmentHint="all">
    <div className="mb-6"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">Workspace operations</p><h1 className="mt-1 text-3xl font-black tracking-tight text-white">{membership.role === "operator" ? "My assigned tasks" : "Team tasks"}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Assign bounded work to employees without giving them access to the full Partner Console. Task-only operators can see and update only tasks assigned to their own account.</p></div>
    {taskError ? <div className="rounded-2xl border border-amber-300/20 bg-amber-300/5 p-5"><h2 className="text-sm font-bold text-amber-100">Task storage migration required</h2><p className="mt-2 text-sm leading-6 text-amber-100/70">Apply `supabase/migrations/20261020_partner_task_roles_and_scopes.sql` before using team tasks. No task data was changed.</p></div> : <PartnerTaskManager partnerId={membership.partnerId} role={membership.role} tasks={(tasks || []) as any[]} operators={operators} />}
  </PartnerShell>;
}

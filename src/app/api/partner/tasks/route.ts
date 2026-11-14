import { NextResponse } from "next/server";
import { getPartnerSession, writePartnerAuditEvent } from "@/lib/domain/partner-api/partner-session";

const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const partnerId = url.searchParams.get("partner_id") || "";
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });
  const session = await getPartnerSession(request, partnerId, ["owner", "operator"]);
  if ("error" in session) return session.error;

  let query = session.admin.from("partner_tasks")
    .select("id,partner_id,title,description,status,priority,assigned_to,created_by,due_at,related_reference,completion_note,completed_at,created_at,updated_at")
    .eq("partner_id", partnerId).order("created_at", { ascending: false }).limit(200);
  if (session.member.role !== "owner") query = query.eq("assigned_to", session.user.id);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Could not load tasks. Confirm the partner task migration has been applied." }, { status: 500 });
  return NextResponse.json({ data: data || [] });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
  const partnerId = typeof body.partner_id === "string" ? body.partner_id : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const assignedTo = typeof body.assigned_to === "string" ? body.assigned_to : "";
  const priority = typeof body.priority === "string" ? body.priority : "normal";
  const dueAt = typeof body.due_at === "string" && body.due_at ? body.due_at : null;
  const relatedReference = typeof body.related_reference === "string" ? body.related_reference.trim() : "";
  if (!partnerId || !title || title.length > 140 || description.length > 4000 || !assignedTo || !PRIORITIES.includes(priority as any) || relatedReference.length > 160) {
    return NextResponse.json({ error: "Provide partner_id, a title (max 140 chars), assigned operator, valid priority and valid optional details." }, { status: 400 });
  }
  if (dueAt && (!Number.isFinite(Date.parse(dueAt)) || new Date(dueAt).getTime() <= Date.now())) return NextResponse.json({ error: "due_at must be a future ISO date/time" }, { status: 400 });
  const session = await getPartnerSession(request, partnerId, ["owner"]);
  if ("error" in session) return session.error;

  const { data: assignee } = await session.admin.from("partner_members")
    .select("id,role").eq("partner_id", partnerId).eq("user_id", assignedTo).maybeSingle();
  if (!assignee || assignee.role !== "operator") return NextResponse.json({ error: "Tasks can only be assigned to an active task-only operator in this workspace." }, { status: 400 });
  const { data: assigneeProfile } = await session.admin.from("profiles").select("account_status").eq("id", assignedTo).maybeSingle();
  if (!assigneeProfile || assigneeProfile.account_status !== "active") return NextResponse.json({ error: "The selected operator account is not active." }, { status: 400 });

  const { data: task, error } = await session.admin.from("partner_tasks").insert({
    partner_id: partnerId, title, description, status: "open", priority,
    assigned_to: assignedTo, created_by: session.user.id, due_at: dueAt,
    related_reference: relatedReference || null,
  }).select("id,partner_id,title,description,status,priority,assigned_to,created_by,due_at,related_reference,completion_note,completed_at,created_at,updated_at").single();
  if (error || !task) return NextResponse.json({ error: "Could not create task. Confirm the partner task migration has been applied." }, { status: 500 });
  try {
    await writePartnerAuditEvent({ partnerId, actorUserId: session.user.id, action: "task.created", targetType: "partner_task", targetId: task.id, metadata: { assigned_to: assignedTo, priority, due_at: dueAt } });
  } catch {
    await session.admin.from("partner_tasks").delete().eq("id", task.id).eq("partner_id", partnerId);
    return NextResponse.json({ error: "Audit logging failed; task creation was rolled back." }, { status: 500 });
  }
  return NextResponse.json({ data: task }, { status: 201 });
}

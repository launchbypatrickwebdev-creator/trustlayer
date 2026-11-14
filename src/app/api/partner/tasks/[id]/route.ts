import { NextResponse } from "next/server";
import { getPartnerSession, writePartnerAuditEvent } from "@/lib/domain/partner-api/partner-session";

const STATUSES = ["open", "in_progress", "blocked", "completed", "cancelled"] as const;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
  const partnerId = typeof body.partner_id === "string" ? body.partner_id : "";
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });
  const session = await getPartnerSession(request, partnerId, ["owner", "operator"]);
  if ("error" in session) return session.error;

  const { data: current, error: readError } = await session.admin.from("partner_tasks")
    .select("id,partner_id,title,description,status,priority,assigned_to,created_by,due_at,related_reference,completion_note,completed_at")
    .eq("id", id).eq("partner_id", partnerId).maybeSingle();
  if (readError || !current) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  const isOwner = session.member.role === "owner";
  if (!isOwner && current.assigned_to !== session.user.id) return NextResponse.json({ error: "This task is not assigned to you" }, { status: 403 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (isOwner) {
    if (typeof body.title === "string") {
      const title = body.title.trim();
      if (!title || title.length > 140) return NextResponse.json({ error: "title must contain 1–140 characters" }, { status: 400 });
      update.title = title;
    }
    if (typeof body.description === "string") {
      if (body.description.length > 4000) return NextResponse.json({ error: "description is too long" }, { status: 400 });
      update.description = body.description.trim();
    }
    if (typeof body.priority === "string") {
      if (!( ["low", "normal", "high", "urgent"] as string[]).includes(body.priority)) return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
      update.priority = body.priority;
    }
    if (typeof body.assigned_to === "string") {
      const { data: assignee } = await session.admin.from("partner_members").select("role").eq("partner_id", partnerId).eq("user_id", body.assigned_to).maybeSingle();
      if (!assignee || assignee.role !== "operator") return NextResponse.json({ error: "Tasks can only be assigned to an active task-only operator" }, { status: 400 });
      const { data: assigneeProfile } = await session.admin.from("profiles").select("account_status").eq("id", body.assigned_to).maybeSingle();
      if (!assigneeProfile || assigneeProfile.account_status !== "active") return NextResponse.json({ error: "The selected operator account is not active." }, { status: 400 });
      update.assigned_to = body.assigned_to;
    }
    if (body.due_at === null || body.due_at === "") update.due_at = null;
    else if (typeof body.due_at === "string") {
      if (!Number.isFinite(Date.parse(body.due_at))) return NextResponse.json({ error: "due_at must be a valid ISO date/time" }, { status: 400 });
      update.due_at = body.due_at;
    }
    if (typeof body.related_reference === "string" || body.related_reference === null) {
      const reference = typeof body.related_reference === "string" ? body.related_reference.trim() : "";
      if (reference.length > 160) return NextResponse.json({ error: "related_reference is too long" }, { status: 400 });
      update.related_reference = reference || null;
    }
  }

  if (typeof body.status === "string") {
    if (!(STATUSES as readonly string[]).includes(body.status)) return NextResponse.json({ error: "Invalid task status" }, { status: 400 });
    if (!isOwner) {
      const allowed: Record<string, string[]> = { open: ["in_progress", "blocked", "completed"], in_progress: ["blocked", "completed"], blocked: ["in_progress", "completed"] };
      if (!allowed[String(current.status)]?.includes(body.status)) return NextResponse.json({ error: "That task status transition is not allowed" }, { status: 409 });
    }
    update.status = body.status;
    update.completed_at = body.status === "completed" ? new Date().toISOString() : null;
  }
  if (typeof body.completion_note === "string" || body.completion_note === null) {
    const note = typeof body.completion_note === "string" ? body.completion_note.trim() : "";
    if (note.length > 4000) return NextResponse.json({ error: "completion_note is too long" }, { status: 400 });
    update.completion_note = note || null;
  }
  if (Object.keys(update).length === 1) return NextResponse.json({ error: "No supported task changes supplied" }, { status: 400 });

  const { data: task, error } = await session.admin.from("partner_tasks").update(update).eq("id", id).eq("partner_id", partnerId).select("id,partner_id,title,description,status,priority,assigned_to,created_by,due_at,related_reference,completion_note,completed_at,created_at,updated_at").single();
  if (error || !task) return NextResponse.json({ error: "Could not update task" }, { status: 500 });
  try {
    await writePartnerAuditEvent({ partnerId, actorUserId: session.user.id, action: isOwner ? "task.updated" : "task.status_updated", targetType: "partner_task", targetId: id, metadata: { changed_fields: Object.keys(update).filter(k => k !== "updated_at"), from_status: current.status, to_status: task.status } });
  } catch {
    return NextResponse.json({ error: "Task was updated but audit logging failed; contact workspace owner" }, { status: 500 });
  }
  return NextResponse.json({ data: task });
}

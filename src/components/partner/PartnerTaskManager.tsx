"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Task = { id: string; title: string; description: string; status: string; priority: string; assigned_to: string | null; due_at: string | null; related_reference: string | null; completion_note: string | null; created_at: string; completed_at: string | null };
type Operator = { user_id: string; label: string };
const STATUSES = ["open", "in_progress", "blocked", "completed", "cancelled"];
function human(value: string) { return value.replaceAll("_", " "); }

export default function PartnerTaskManager({ partnerId, role, tasks, operators }: { partnerId: string; role: string; tasks: Task[]; operators: Operator[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [assignedTo, setAssignedTo] = useState(operators[0]?.user_id || ""); const [priority, setPriority] = useState("normal"); const [dueAt, setDueAt] = useState(""); const [reference, setReference] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  async function send(url: string, method: string, body: Record<string, unknown>) {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Task request failed");
    return result;
  }
  async function createTask() {
    setBusy(true); setError(""); setNotice("");
    try { await send("/api/partner/tasks", "POST", { partner_id: partnerId, title, description, assigned_to: assignedTo, priority, due_at: dueAt ? new Date(dueAt).toISOString() : null, related_reference: reference }); setTitle(""); setDescription(""); setReference(""); setDueAt(""); setNotice("Task assigned."); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not create task"); } finally { setBusy(false); }
  }
  async function updateTask(task: Task, body: Record<string, unknown>) {
    setBusy(true); setError(""); setNotice("");
    try { await send(`/api/partner/tasks/${task.id}`, "PATCH", { partner_id: partnerId, ...body }); setNotice("Task updated."); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update task"); } finally { setBusy(false); }
  }
  const isOwner = role === "owner";
  return <div className="space-y-5">
    {error && <p role="alert" className="rounded-xl border border-rose-300/20 bg-rose-300/5 p-3 text-sm text-rose-200">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-3 text-sm text-emerald-200">{notice}</p>}
    {isOwner && <section className="rounded-2xl border border-[#1b3045] bg-[#0a1726] p-5">
      <h2 className="text-sm font-bold text-white">Assign a task</h2><p className="mt-1 text-xs leading-5 text-slate-500">Task-only operators can access their assigned tasks, not API keys, webhooks, deal dashboards or workspace administration.</p>
      {operators.length === 0 ? <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-sm text-amber-100">No task-only operators yet. Invite a teammate as “Task-only operator” on the Team page first.</p> : <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-400 sm:col-span-2">Task title<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={140} placeholder="Review settlement exception" className="mt-1 block w-full rounded-xl border border-[#2a3d51] bg-[#07111f] px-3 py-2.5 text-sm text-white"/></label>
        <label className="text-xs text-slate-400 sm:col-span-2">Instructions<textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={4000} rows={3} placeholder="Describe the task and expected outcome…" className="mt-1 block w-full rounded-xl border border-[#2a3d51] bg-[#07111f] px-3 py-2.5 text-sm text-white"/></label>
        <label className="text-xs text-slate-400">Assign to<select value={assignedTo} onChange={e=>setAssignedTo(e.target.value)} className="mt-1 block w-full rounded-xl border border-[#2a3d51] bg-[#07111f] px-3 py-2.5 text-sm text-white">{operators.map(op=><option key={op.user_id} value={op.user_id}>{op.label}</option>)}</select></label>
        <label className="text-xs text-slate-400">Priority<select value={priority} onChange={e=>setPriority(e.target.value)} className="mt-1 block w-full rounded-xl border border-[#2a3d51] bg-[#07111f] px-3 py-2.5 text-sm text-white">{["low","normal","high","urgent"].map(x=><option key={x} value={x}>{human(x)}</option>)}</select></label>
        <label className="text-xs text-slate-400">Due date (optional)<input type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)} className="mt-1 block w-full rounded-xl border border-[#2a3d51] bg-[#07111f] px-3 py-2.5 text-sm text-white"/></label>
        <label className="text-xs text-slate-400">Related reference (optional)<input value={reference} onChange={e=>setReference(e.target.value)} maxLength={160} placeholder="Ticket, order or internal reference" className="mt-1 block w-full rounded-xl border border-[#2a3d51] bg-[#07111f] px-3 py-2.5 text-sm text-white"/></label>
        <button disabled={busy || !title.trim() || !assignedTo} onClick={createTask} className="rounded-xl bg-emerald-300 px-4 py-2.5 text-sm font-bold text-[#05201e] disabled:opacity-50 sm:col-span-2">{busy ? "Working…" : "Assign task"}</button>
      </div>}
    </section>}
    <section className="overflow-hidden rounded-2xl border border-[#1b3045] bg-[#0a1726]">
      <div className="border-b border-[#1b3045] px-5 py-4"><h2 className="text-sm font-bold text-white">{isOwner ? "Workspace tasks" : "Tasks assigned to you"}</h2><p className="mt-1 text-xs text-slate-500">{tasks.length} task{tasks.length===1?"":"s"} · updates are recorded in the workspace audit trail</p></div>
      <div className="divide-y divide-[#172a3d]">{tasks.length===0 && <p className="px-5 py-10 text-center text-sm text-slate-500">No tasks here yet.</p>}
        {tasks.map(task => <article key={task.id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold text-white">{task.title}</h3><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${task.priority==="urgent"||task.priority==="high"?"bg-amber-300/10 text-amber-200":"bg-slate-500/15 text-slate-300"}`}>{task.priority}</span></div>{task.description&&<p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-400">{task.description}</p>}<p className="mt-2 text-[10px] text-slate-600">Created {new Date(task.created_at).toLocaleString()}{task.due_at?` · Due ${new Date(task.due_at).toLocaleString()}`:""}{task.related_reference?` · Ref ${task.related_reference}`:""}</p></div><span className="rounded-full border border-[#2a3d51] px-2.5 py-1 text-[10px] font-bold uppercase text-slate-300">{human(task.status)}</span></div>
          {isOwner ? <div className="mt-3 flex flex-wrap items-center gap-2"><label className="text-[10px] text-slate-500">Assignee<select value={task.assigned_to || ""} disabled={busy || operators.length===0} onChange={e=>{if(e.target.value)updateTask(task,{assigned_to:e.target.value})}} className="ml-2 rounded-lg border border-[#2a3d51] bg-[#07111f] px-2 py-1.5 text-xs text-slate-200">{!task.assigned_to&&<option value="">Unassigned</option>}{task.assigned_to&&!operators.some(op=>op.user_id===task.assigned_to)&&<option value={task.assigned_to}>Inactive operator</option>}{operators.map(op=><option key={op.user_id} value={op.user_id}>{op.label}</option>)}</select></label>{task.status!=="completed"&&task.status!=="cancelled"&&<><button disabled={busy} onClick={()=>updateTask(task,{status:"completed"})} className="rounded-lg border border-emerald-300/20 px-3 py-1.5 text-xs font-semibold text-emerald-200 disabled:opacity-50">Mark complete</button><button disabled={busy} onClick={()=>updateTask(task,{status:"cancelled"})} className="rounded-lg border border-rose-300/20 px-3 py-1.5 text-xs font-semibold text-rose-200 disabled:opacity-50">Cancel task</button></>}</div> : <div className="mt-4 grid gap-2 sm:grid-cols-[180px_1fr_auto]">
            <label className="text-xs text-slate-400">Update status<select value={task.status} disabled={busy||task.status==="completed"||task.status==="cancelled"} onChange={e=>updateTask(task,{status:e.target.value,completion_note:notes[task.id]??task.completion_note})} className="mt-1 block w-full rounded-xl border border-[#2a3d51] bg-[#07111f] px-3 py-2 text-sm text-white">{STATUSES.map(x=><option key={x} value={x} disabled={!([task.status, ...(task.status==="open"?["in_progress","blocked","completed"]:task.status==="in_progress"?["blocked","completed"]:task.status==="blocked"?["in_progress","completed"]:[])].includes(x))}>{human(x)}</option>)}</select></label>
            <label className="text-xs text-slate-400">Completion / progress note<textarea value={notes[task.id]??task.completion_note??""} onChange={e=>setNotes(old=>({...old,[task.id]:e.target.value}))} maxLength={4000} rows={2} placeholder="Add a progress note…" className="mt-1 block w-full rounded-xl border border-[#2a3d51] bg-[#07111f] px-3 py-2 text-sm text-white"/></label>
            <button disabled={busy} onClick={()=>updateTask(task,{completion_note:notes[task.id]??task.completion_note})} className="self-end rounded-xl border border-[#2a3d51] px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-50">Save note</button>
          </div>}
          {task.completion_note&&<p className="mt-3 rounded-xl border border-[#1b3045] bg-[#081524] p-3 text-xs leading-5 text-slate-400"><span className="font-bold text-slate-300">Latest note: </span>{task.completion_note}</p>}
        </article>)}
      </div>
    </section>
  </div>;
}

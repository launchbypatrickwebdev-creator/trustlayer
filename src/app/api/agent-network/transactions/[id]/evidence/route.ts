import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;
const allowed = new Set(["image/jpeg", "image/png", "application/pdf", "text/plain"]);

function extension(type: string) {
  return type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : type === "application/pdf" ? "pdf" : "txt";
}

function validContent(type: string, bytes: Uint8Array): boolean {
  if (type === "image/jpeg") return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.length > 8 && bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10";
  if (type === "application/pdf") return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  if (type === "text/plain") {
    if (bytes.some((b) => b === 0)) return false;
    try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); return true; }
    catch { return false; }
  }
  return false;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await createSupabaseServerClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data, error } = await s.from("trustlayer_agent_evidence").select("*")
    .eq("transaction_id", id).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  const rows = (data ?? []) as Array<Record<string, any>>;
  const evidence = await Promise.all(rows.map(async (row) => {
    if (!row.storage_path) return { ...row, signedUrl: null };
    const { data: signed } = await s.storage.from("agent-evidence").createSignedUrl(row.storage_path, 60);
    return { ...row, signedUrl: signed?.signedUrl ?? null };
  }));
  return NextResponse.json({ evidence });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await createSupabaseServerClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  let path: string | null = null;
  const { data: participant } = await s.from("trustlayer_agent_transactions").select("id,deal_id").eq("id", id).maybeSingle();
  if (!participant) return NextResponse.json({ error: "Transaction not found or not accessible." }, { status: 404 });
  const admin = createSupabaseAdminClient();
  try {
    const form = await req.formData();
    const description = String(form.get("description") ?? "").trim();
    const file = form.get("file");
    if (description.length < 3 || !(file instanceof File)) {
      return NextResponse.json({ error: "A description and evidence file are required." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_BYTES || !allowed.has(file.type)) {
      return NextResponse.json({ error: "Evidence must be a JPEG, PNG, PDF or plain-text file no larger than 10 MB." }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!validContent(file.type, bytes)) return NextResponse.json({ error: "File content does not match its declared type." }, { status: 400 });
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    path = `${id}/${user.id}/${randomUUID()}.${extension(file.type)}`;
    const { error: uploadError } = await admin.storage.from("agent-evidence").upload(path, bytes, {
      contentType: file.type, cacheControl: "0", upsert: false,
      metadata: { sha256 },
    });
    if (uploadError) throw new Error(uploadError.message);
    const { data, error } = await s.rpc("tl_agent_submit_evidence", {
      p_transaction_id: id, p_description: description,
      p_storage_path: path, p_external_url: null, p_sha256: sha256,
    });
    if (error) throw new Error(error.message);
    if (participant.deal_id) {
      const { error: dealEventError } = await admin.from("deal_events").insert({
        deal_id: participant.deal_id, actor_user_id: user.id, actor_type: "user",
        event_type: "agent_evidence_submitted",
        metadata: { agent_transaction_id: id, evidence_id: data.id, sha256, storage_path: path },
      });
      if (dealEventError) console.error("Unable to mirror agent evidence event to linked deal:", dealEventError.message);
    }
    return NextResponse.json({ evidence: data, sha256, dealId: participant.deal_id ?? null }, { status: 201 });
  } catch (e) {
    if (path) await admin.storage.from("agent-evidence").remove([path]);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Evidence upload failed." }, { status: 400 });
  }
}

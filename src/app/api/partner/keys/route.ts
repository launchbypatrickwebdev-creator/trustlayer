import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getPartnerSession, writePartnerAuditEvent } from "@/lib/domain/partner-api/partner-session";

const ALLOWED_SCOPES = ["deals:read", "deals:create", "deals:finalize", "funding:initiate", "settlement:execute", "transactions:cancel", "users:link", "events:read", "webhooks:manage"];
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
  const partnerId = String(body.partner_id || "");
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });
  const session = await getPartnerSession(request, partnerId, ["owner", "developer"]);
  if ("error" in session) return session.error;
  const environment = body.environment === "live" ? "live" : body.environment === "test" ? "test" : null;
  if (!environment) return NextResponse.json({ error: "environment must be test or live" }, { status: 400 });
  if (environment === "live" && session.member.role !== "owner") return NextResponse.json({ error: "Only workspace owners can create live keys" }, { status: 403 });
  const rotatesKeyId = typeof body.rotates_key_id === "string" ? body.rotates_key_id : null;
  if (rotatesKeyId) {
    if (session.member.role !== "owner") return NextResponse.json({ error: "Only workspace owners can rotate keys" }, { status: 403 });
    const { data: oldKey } = await session.admin.from("api_credentials").select("id,environment,status").eq("id", rotatesKeyId).eq("partner_id", partnerId).maybeSingle();
    if (!oldKey || oldKey.status !== "active" || oldKey.environment !== environment) return NextResponse.json({ error: "The key to rotate must be an active key in the same environment" }, { status: 400 });
  }
  const label = String(body.label || "").trim().slice(0, 80);
  if (!label) return NextResponse.json({ error: "A key label is required" }, { status: 400 });
  const scopes = Array.isArray(body.scopes) ? [...new Set(body.scopes.filter((s: unknown): s is string => typeof s === "string" && ALLOWED_SCOPES.includes(s)))] : ["deals:read", "events:read"];
  if (!scopes.length) return NextResponse.json({ error: "Select at least one valid scope" }, { status: 400 });
  const secret = randomBytes(32).toString("base64url");
  const prefix = `tl_${environment}_${randomBytes(8).toString("hex")}`;
  const { data: credential, error } = await session.admin.from("api_credentials").insert({
    partner_id: partnerId, key_prefix: prefix,
    secret_hash: createHash("sha256").update(secret, "utf8").digest("hex"),
    environment, scopes, status: "active", label,
  }).select("id, key_prefix, environment, scopes, status, label, created_at").single();
  if (error || !credential) return NextResponse.json({ error: "Could not create API key" }, { status: 500 });
  try {
    await writePartnerAuditEvent({ partnerId, actorUserId: session.user.id, action: rotatesKeyId ? "api_key.rotated" : "api_key.created", targetType: "api_credential", targetId: credential.id, metadata: { environment, scopes, label, ...(rotatesKeyId ? { rotated_from: rotatesKeyId } : {}) } });
  } catch {
    await session.admin.from("api_credentials").update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("id", credential.id);
    return NextResponse.json({ error: "Audit logging failed; key creation was rolled back" }, { status: 500 });
  }
  return NextResponse.json({ credential, api_key: `${prefix}.${secret}`, note: "Copy this key now. Its secret will not be shown again." }, { status: 201 });
}

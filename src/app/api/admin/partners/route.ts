import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/domain/admin";

const DEFAULT_SCOPES = [
  "deals:read",
  "deals:create",
  "users:link",
  "events:read",
  "webhooks:manage",
];

function mintKey(environment: "test" | "live") {
  const secret = randomBytes(24).toString("base64url");
  const prefix = `tl_${environment}_${randomBytes(8).toString("hex")}`;
  const secretHash = createHash("sha256").update(secret, "utf8").digest("hex");
  const fullKey = `${prefix}.${secret}`;
  return { secret, prefix, secretHash, fullKey };
}

export async function GET() {
  try {
    const { admin } = await requireAdminUser();
    const { data, error } = await admin
      .from("api_partners")
      .select("id, name, status, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { admin } = await requireAdminUser();
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    const environment =
      body.environment === "live" ? ("live" as const) : ("test" as const);

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const { data: partner, error: e1 } = await admin
      .from("api_partners")
      .insert({ name, status: "active" })
      .select("id, name, status, created_at")
      .single();
    if (e1) {
      return NextResponse.json({ error: e1.message }, { status: 500 });
    }

    const { prefix, secretHash, fullKey } = mintKey(environment);
    const { data: credential, error: e2 } = await admin
      .from("api_credentials")
      .insert({
        partner_id: partner.id,
        key_prefix: prefix,
        secret_hash: secretHash,
        environment,
        scopes: DEFAULT_SCOPES,
        status: "active",
      })
      .select(
        "id, partner_id, key_prefix, environment, status, scopes, last_used_at, created_at, revoked_at"
      )
      .single();
    if (e2) {
      return NextResponse.json({ error: e2.message }, { status: 500 });
    }

    return NextResponse.json({
      partner,
      credential,
      api_key: fullKey,
      note: "Store api_key now; secret is not recoverable.",
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

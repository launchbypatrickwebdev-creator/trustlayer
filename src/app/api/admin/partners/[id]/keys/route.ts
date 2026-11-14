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
  return {
    prefix,
    secretHash,
    fullKey: `${prefix}.${secret}`,
  };
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { admin } = await requireAdminUser();
    const { id: partnerId } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const environment =
      body.environment === "live" ? ("live" as const) : ("test" as const);

    const { data: partner, error: pErr } = await admin
      .from("api_partners")
      .select("id, status")
      .eq("id", partnerId)
      .maybeSingle();
    if (pErr || !partner) {
      return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    }
    if (partner.status !== "active") {
      return NextResponse.json(
        { error: "Partner is not active" },
        { status: 400 }
      );
    }

    const { prefix, secretHash, fullKey } = mintKey(environment);
    const { data: credential, error } = await admin
      .from("api_credentials")
      .insert({
        partner_id: partnerId,
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
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      credential,
      api_key: fullKey,
      note: "Store api_key now; secret is not recoverable.",
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/domain/admin";

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { admin } = await requireAdminUser();
    const { id } = await ctx.params;

    const { data, error } = await admin
      .from("api_credentials")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, status, revoked_at")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

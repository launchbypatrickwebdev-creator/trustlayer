import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { claimPartnerToken } from "@/lib/domain/partner-api/claim-tokens";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { token?: string; next?: string };
    const token = String(body.token || "").trim();
    if (!token) return NextResponse.json({ error: "Missing token." }, { status: 400 });
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const result = await claimPartnerToken(token, user.id);
    const next =
      typeof body.next === "string" && body.next.startsWith("/") && !body.next.startsWith("//")
        ? body.next
        : `/deals/${result.dealId}`;
    return NextResponse.json({
      ok: true,
      ...result,
      redirectTo: next.includes(result.dealId) ? next : `/deals/${result.dealId}`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unable to claim partner deal.";
    console.error("[partner-claim]", message);
    return NextResponse.json({ error: message }, { status: message === "Authentication required." ? 401 : 400 });
  }
}

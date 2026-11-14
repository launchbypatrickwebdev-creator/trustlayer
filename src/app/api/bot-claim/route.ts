import { NextResponse } from "next/server";
import { claimBotIdentity } from "@/lib/domain/claim-bot";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { token?: string; next?: string };
    const token = String(body.token || "").trim();
    if (!token) {
      return NextResponse.json({ error: "Missing token." }, { status: 400 });
    }
    const result = await claimBotIdentity(token);
    const next =
      typeof body.next === "string" &&
      body.next.startsWith("/") &&
      !body.next.startsWith("//")
        ? body.next
        : "/dashboard";
    return NextResponse.json({
      ok: true,
      ...result,
      redirectTo: next,
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Unable to claim bot identity.";
    const status = message === "Authentication required." ? 401 : 400;
    console.error("[bot-claim]", message);
    return NextResponse.json({ error: message }, { status });
  }
}

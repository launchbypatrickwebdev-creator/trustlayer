import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { claimInviteByToken } from "@/lib/domain/claim-invite";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { token?: string };
    const token = (body.token || "").trim();
    if (!token) {
      return NextResponse.json(
        { error: "Invitation token is required." },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Sign in or register first, then open the invite link again." },
        { status: 401 }
      );
    }

    const result = await claimInviteByToken(token, user.id);
    return NextResponse.json({
      ok: true,
      ...result,
      redirectTo: `/deals/${result.dealId}`,
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Unable to claim invitation.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

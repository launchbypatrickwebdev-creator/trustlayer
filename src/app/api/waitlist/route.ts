import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string };
    const email = String(body.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("waitlist_signups").upsert(
      { email, source: "homepage", created_at: new Date().toISOString() },
      { onConflict: "email" }
    );

    // If table missing, still accept so UI works during setup
    if (error && !/relation .* does not exist/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unable to join waitlist." },
      { status: 500 }
    );
  }
}
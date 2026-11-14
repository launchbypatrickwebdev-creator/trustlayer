import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const body = await request.json();
    const subject = String(body.subject || "").trim();
    const message = String(body.message || "").trim();
    const category = String(body.category || "general").trim();
    const dealCode = String(body.dealCode || "").trim() || null;
    if (!subject || !message) return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
    if (subject.length > 160 || message.length > 5000) return NextResponse.json({ error: "Request is too long." }, { status: 400 });
    const { error } = await (supabase as any).from("support_tickets").insert({ user_id: user.id, category, subject, message, deal_code: dealCode });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to submit support request." }, { status: 500 });
  }
}

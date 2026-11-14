import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { registerDeviceBinding } from "@/lib/risk/device";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const body = await request.json();
    const deviceKey = String(body.deviceKey || "");
    const result = await registerDeviceBinding(user.id, deviceKey, {
      userAgent: String(request.headers.get("user-agent") || "").slice(0, 500),
    });
    return NextResponse.json({ device: result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to register device." }, { status: 400 });
  }
}

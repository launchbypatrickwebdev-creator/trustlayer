import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";

function makeToken() {
  // Readable one-time token for Telegram paste
  return randomBytes(24).toString("base64url");
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();
    const { data: conn } = await (admin as any)
      .from("channel_connections")
      .select("id, channel_user_id, status, metadata")
      .eq("user_id", user.id)
      .eq("channel", "telegram")
      .maybeSingle();

    const { data: profile } = await admin
      .from("profiles")
      .select("telegram_user_id, telegram_username")
      .eq("id", user.id)
      .maybeSingle();

    return NextResponse.json({
      connected: Boolean(conn || profile?.telegram_user_id),
      channelUserId: conn?.channel_user_id || profile?.telegram_user_id || null,
      telegramUsername: profile?.telegram_username || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load status." },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();
    const token = makeToken();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    // Invalidate prior unused telegram tokens for this user
    await (admin as any)
      .from("channel_link_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("channel", "telegram")
      .is("used_at", null);

    const { error } = await (admin as any).from("channel_link_tokens").insert({
      token,
      user_id: user.id,
      channel: "telegram",
      expires_at: expiresAt,
      metadata: {
        purpose: "web_profile_sync",
        issued_via: "profile",
        fingerprint: createHash("sha256").update(token).digest("hex").slice(0, 16),
      },
    });

    if (error) {
      if (String(error.message).includes("channel_link_tokens") || error.code === "42P01") {
        return NextResponse.json(
          {
            error:
              "channel_link_tokens table missing. Run sql/channel_link_tokens.sql in Supabase.",
          },
          { status: 500 }
        );
      }
      throw new Error(error.message);
    }

    return NextResponse.json({
      ok: true,
      token,
      expiresAt,
      instructions: "In Telegram bot send: /sync " + token,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create sync token.",
      },
      { status: 500 }
    );
  }
}

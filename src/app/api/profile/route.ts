import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";

export async function PATCH(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const displayName = String(body.displayName || "").trim().slice(0, 120);
    const phone = String(body.phone || "").trim().slice(0, 40) || null;
    const fullName = String(body.fullName || "").trim().slice(0, 160);
    const country =
      String(body.country || "").trim().toUpperCase().slice(0, 2) || null;
    const region = String(body.region || "").trim().slice(0, 64) || null;
    let username = String(body.username || "")
      .trim()
      .toLowerCase()
      .replace(/^@/, "")
      .slice(0, 32);

    if (!fullName || fullName.length < 2) {
      return NextResponse.json(
        { error: "Full legal name is required." },
        { status: 400 }
      );
    }
    if (!displayName || displayName.length < 1) {
      return NextResponse.json(
        { error: "Display name is required." },
        { status: 400 }
      );
    }
    if (!username || !/^[a-z0-9_]{3,32}$/.test(username)) {
      return NextResponse.json(
        {
          error:
            "Username is required (3–32 characters: lowercase letters, numbers, underscore).",
        },
        { status: 400 }
      );
    }

    const admin = createSupabaseAdminClient();
    const { data: clash } = await admin
      .from("profiles")
      .select("id")
      .ilike("username", username)
      .neq("id", user.id)
      .maybeSingle();
    if (clash) {
      return NextResponse.json(
        { error: "That username is already taken." },
        { status: 409 }
      );
    }

    const patch: Record<string, string | null> = {
      display_name: displayName,
      phone,
      full_name: fullName,
      country,
      region,
      username,
    };

    const { data, error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", user.id)
      .select(
        "username,display_name,full_name,phone,country,region,created_at"
      )
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ profile: data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to update profile.",
      },
      { status: 400 }
    );
  }
}

export async function DELETE() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const admin = createSupabaseAdminClient();

    const { data: activeDeals } = await admin
      .from("deals")
      .select("id")
      .or(
        `created_by.eq.${user.id},buyer_id.eq.${user.id},seller_id.eq.${user.id}`
      )
      .in("status", [
        "awaiting_payment",
        "funded",
        "disputed",
        "awaiting_delivery",
        "awaiting_counterparty",
      ])
      .limit(1);

    if ((activeDeals?.length ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            "Close or complete active deals (and funded escrows) before deleting your profile.",
        },
        { status: 409 }
      );
    }

    await admin
      .from("profiles")
      .update({
        display_name: "Deleted user",
        full_name: null,
        phone: null,
        username: null,
        account_status: "deleted",
      })
      .eq("id", user.id);

    await supabase.auth.signOut();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to delete profile.",
      },
      { status: 400 }
    );
  }
}

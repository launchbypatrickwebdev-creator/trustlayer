import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";

/**
 * Discard a draft deal.
 * deal_events is append-only — never DELETE from it.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
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

    const { id } = await context.params;
    const admin = createSupabaseAdminClient();

    const { data: deal, error } = await admin
      .from("deals")
      .select("id, status, created_by, buyer_id, seller_id, deal_code, title")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!deal) {
      return NextResponse.json({ error: "Deal not found." }, { status: 404 });
    }

    const isParty =
      deal.created_by === user.id ||
      deal.buyer_id === user.id ||
      deal.seller_id === user.id;
    if (!isParty) {
      return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    }

    if (String(deal.status).toLowerCase() !== "draft") {
      return NextResponse.json(
        {
          error:
            "Only draft deals can be discarded. Active deals use cancel / release flows.",
        },
        { status: 400 }
      );
    }

    await admin
      .from("deal_invitations")
      .update({ status: "expired" })
      .eq("deal_id", id)
      .eq("status", "pending");

    const { error: updErr } = await admin
      .from("deals")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "draft");
    if (updErr) throw new Error(updErr.message);

    await admin.from("deal_events").insert({
      deal_id: id,
      actor_user_id: user.id,
      actor_type: "user",
      event_type: "draft_discarded",
      metadata: {
        deal_code: deal.deal_code,
        title: deal.title,
        reason: "user_discarded_draft",
      },
    });

    return NextResponse.json({
      ok: true,
      discarded: id,
      status: "cancelled",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to discard draft.",
      },
      { status: 500 }
    );
  }
}
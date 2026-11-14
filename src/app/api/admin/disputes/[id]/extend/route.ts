import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { requireAdminUser } from "@/lib/domain/admin";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: disputeId } = await context.params;
    const body = (await request.json()) as { adminReviewDeadline?: string };
    if (!body.adminReviewDeadline) {
      return NextResponse.json(
        { error: "adminReviewDeadline ISO string is required." },
        { status: 400 }
      );
    }
    const when = new Date(body.adminReviewDeadline);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "adminReviewDeadline must be a future time." },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    await requireAdminUser();

    const admin = createSupabaseAdminClient();
    const { data: dispute, error: dErr } = await admin
      .from("deal_disputes")
      .select("id, deal_id, status")
      .eq("id", disputeId)
      .maybeSingle();
    if (dErr || !dispute) {
      return NextResponse.json({ error: "Dispute not found." }, { status: 404 });
    }
    if (dispute.status !== "open") {
      return NextResponse.json({ error: "Only an open dispute can have its admin review window extended." }, { status: 409 });
    }

    const { error: uErr } = await admin
      .from("deals")
      .update({ admin_review_deadline: when.toISOString() })
      .eq("id", dispute.deal_id);
    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 500 });
    }

    await admin.from("deal_events").insert({
      deal_id: dispute.deal_id,
      actor_user_id: user.id,
      actor_type: "admin",
      event_type: "admin_review_deadline_extended",
      metadata: {
        dispute_id: disputeId,
        admin_review_deadline: when.toISOString(),
      },
    });

    return NextResponse.json({
      ok: true,
      adminReviewDeadline: when.toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unable to extend review window." },
      { status: 500 }
    );
  }
}

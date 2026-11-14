/**
 * POST /api/crypto/ax/accept-valuation
 * Party accepts NFT valuation on a leg.
 */
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const dealId = String(body.dealId || "");
    const legIndex = body.legIndex === 1 || body.legIndex === "1" ? 1 : 0;
    if (!dealId) {
      return NextResponse.json({ error: "dealId required" }, { status: 400 });
    }
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: deal } = await supabase
      .from("deals")
      .select("id, buyer_id, seller_id")
      .eq("id", dealId)
      .single();
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }
    if (user.id !== deal.buyer_id && user.id !== deal.seller_id) {
      return NextResponse.json({ error: "Not a party" }, { status: 403 });
    }
    const admin = createSupabaseAdminClient();
    const { data: leg } = await admin
      .from("deal_settlement_legs")
      .select("*")
      .eq("deal_id", dealId)
      .eq("leg_index", legIndex)
      .maybeSingle();
    if (!leg) {
      return NextResponse.json({ error: "Leg not found" }, { status: 404 });
    }
    if (String(leg.asset_type).toLowerCase() !== "nft") {
      return NextResponse.json(
        { error: "Valuation acceptance applies only to NFT legs." },
        { status: 400 }
      );
    }
    const now = new Date().toISOString();
    if (leg.nft_valuation_accepted_at) {
      return NextResponse.json({
        ok: true,
        alreadyAccepted: true,
        acceptedAt: leg.nft_valuation_accepted_at,
      });
    }
    const { error: upErr } = await admin
      .from("deal_settlement_legs")
      .update({ nft_valuation_accepted_at: now })
      .eq("id", leg.id)
      .is("nft_valuation_accepted_at", null);
    await admin.from("deal_events").insert({
      deal_id: dealId,
      actor_user_id: user.id,
      actor_type: "user",
      event_type: "nft_valuation_accepted",
      metadata: {
        leg_index: legIndex,
        valuation: leg.nft_valuation_amount,
        accepted_at: now,
        via: upErr ? "event_snapshot" : "leg_row",
      },
    });
    if (upErr) {
      const { data: existingSnap } = await admin
        .from("deals")
        .select("nft_valuation_snapshot")
        .eq("id", dealId)
        .single();
      const snap =
        (existingSnap?.nft_valuation_snapshot as Record<string, unknown>) || {};
      const key = `leg_${legIndex}`;
      await admin
        .from("deals")
        .update({
          nft_valuation_snapshot: {
            ...snap,
            [key]: {
              valuation: leg.nft_valuation_amount,
              accepted_by: user.id,
              accepted_at: now,
            },
          },
        })
        .eq("id", dealId);
      return NextResponse.json({
        ok: true,
        acceptedAt: now,
        via: "event_and_snapshot",
      });
    }
    return NextResponse.json({ ok: true, acceptedAt: now, via: "leg_row" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Accept valuation failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

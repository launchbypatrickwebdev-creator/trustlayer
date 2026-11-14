import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await createSupabaseServerClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data, error } = await s.from("trustlayer_agent_procurement_profiles").select("*")
    .eq("owner_user_id", user.id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profiles: data ?? [] });
}

export async function POST(req: Request) {
  const s = await createSupabaseServerClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const b = await req.json() as Record<string, unknown>;
    const strings = (v: unknown) => Array.isArray(v) ? v.map(String).map((x) => x.trim()).filter(Boolean) : [];
    const { data, error } = await s.rpc("tl_agent_upsert_procurement_profile", {
      p_buyer_agent_id: String(b.buyerAgentId ?? ""),
      p_business_name: String(b.businessName ?? ""),
      p_approved_supplier_handles: strings(b.approvedSupplierHandles),
      p_allowed_categories: strings(b.allowedCategories),
      p_max_purchase_usd: Number(b.maxPurchaseUsd),
      p_daily_budget_usd: Number(b.dailyBudgetUsd),
      p_approval_threshold_usd: Number(b.approvalThresholdUsd),
      p_repeat_purchases_allowed: b.repeatPurchasesAllowed === true,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ profile: data }, { status: 201 });
  } catch { return NextResponse.json({ error: "Invalid procurement profile." }, { status: 400 }); }
}

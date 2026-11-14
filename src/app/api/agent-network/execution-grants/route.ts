import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await createSupabaseServerClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data, error } = await s.from("trustlayer_agent_execution_grants").select("*")
    .eq("owner_user_id", user.id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ grants: data ?? [] });
}

export async function POST(req: Request) {
  const s = await createSupabaseServerClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const b = await req.json() as Record<string, unknown>;
    const agentId = String(b.agentId ?? "");
    const scopes = Array.isArray(b.scopes) ? b.scopes.map(String) : [];
    const assets = Array.isArray(b.allowedAssets) ? b.allowedAssets.map((x) => String(x).toUpperCase()) : [];
    const wallets = Array.isArray(b.allowedWallets) ? b.allowedWallets.map(String) : [];
    const types = Array.isArray(b.allowedSettlementTypes) ? b.allowedSettlementTypes.map(String) : [];
    const max = Number(b.maxTransactionUsd);
    const daily = Number(b.dailyLimitUsd);
    const approval = Number(b.approvalThresholdUsd);
    if (!agentId || !scopes.length || !assets.length || !wallets.length || !types.length ||
        scopes.some((x) => !["deal:create","settlement:create","settlement:fund"].includes(x)) ||
        assets.some((x) => !["SOL","USDC"].includes(x)) ||
        types.some((x) => !["solana_escrow","solana_ax"].includes(x)) ||
        ![max,daily,approval].every(Number.isFinite) || max <= 0 || daily <= 0 || approval < 0 || approval > max) {
      return NextResponse.json({ error: "Agent, scopes, asset allowlist, settlement types and valid limits are required." }, { status: 400 });
    }
    if (wallets.some((w) => { try { return new PublicKey(w).toBase58() !== w; } catch { return true; } })) return NextResponse.json({ error: "Wallet allowlist contains an invalid Solana public key." }, { status: 400 });
    const { data, error } = await s.rpc("tl_agent_create_execution_grant", {
      p_agent_id: agentId, p_label: String(b.label ?? "Agent execution grant"),
      p_scopes: scopes, p_allowed_assets: assets, p_allowed_wallets: wallets,
      p_allowed_settlement_types: types, p_max_transaction_usd: max,
      p_daily_limit_usd: daily, p_approval_threshold_usd: approval,
      p_expires_at: b.expiresAt ? String(b.expiresAt) : null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ grant: data }, { status: 201 });
  } catch { return NextResponse.json({ error: "Invalid execution grant." }, { status: 400 }); }
}

export async function DELETE(req: Request) {
  const s = await createSupabaseServerClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const b = await req.json() as { grantId?: unknown };
    const { data, error } = await s.rpc("tl_agent_revoke_execution_grant", { p_grant_id: String(b.grantId ?? "") });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ revoked: data === true });
  } catch { return NextResponse.json({ error: "Invalid revocation request." }, { status: 400 }); }
}

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";

const ASSETS = new Set(["SOL", "USDC", "USDT"]);

/** Known Solana wallet apps — UI labels only; more can be added anytime. */
export const SOLANA_WALLET_PROVIDERS = [
  { id: "phantom", label: "Phantom" },
  { id: "solflare", label: "Solflare" },
  { id: "other", label: "Other Solana wallet" },
] as const;

function looksLikeSolanaAddress(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim());
}

/**
 * Link or update a wallet on the shared wallets table (same as bot /linkwallet).
 *
 * Multi-wallet model:
 *   (user, network, asset, address) is unique
 *   → same address can hold SOL + USDC + USDT as separate rows
 *   → different addresses can each hold SOL / USDC / USDT
 *   → at most one is_primary per (user, network, asset)
 */
export async function POST(request: Request) {
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

    const body = (await request.json()) as {
      assetCode?: string;
      address?: string;
      network?: string;
      isPrimary?: boolean;
      label?: string | null;
      provider?: string | null;
    };

    const assetCode = String(body.assetCode || "")
      .trim()
      .toUpperCase();
    const address = String(body.address || "").trim();
    const network =
      String(body.network || process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet")
        .trim()
        .toLowerCase() || "devnet";
    const label = body.label ? String(body.label).trim().slice(0, 64) : null;
    const provider = body.provider
      ? String(body.provider).trim().toLowerCase().slice(0, 32)
      : null;

    if (!ASSETS.has(assetCode)) {
      return NextResponse.json(
        { error: "Asset must be SOL, USDC, or USDT." },
        { status: 400 }
      );
    }
    if (!looksLikeSolanaAddress(address)) {
      return NextResponse.json(
        { error: "Invalid Solana address." },
        { status: 400 }
      );
    }

    const admin = createSupabaseAdminClient();

    // Primary is per asset (user can have Phantom SOL primary + Solflare SOL non-primary)
    if (body.isPrimary !== false) {
      await admin
        .from("wallets")
        .update({ is_primary: false })
        .eq("user_id", user.id)
        .eq("network", network)
        .eq("asset_code", assetCode);
    }

    // Upsert by exact (user, network, asset, address) — allows multi-address + multi-asset
    const { data: existing } = await admin
      .from("wallets")
      .select("id")
      .eq("user_id", user.id)
      .eq("asset_code", assetCode)
      .eq("network", network)
      .eq("address", address)
      .maybeSingle();

    const patch: Record<string, unknown> = {
      address,
      is_primary: body.isPrimary !== false,
      updated_at: new Date().toISOString(),
    };
    if (label !== null) patch.label = label;
    if (provider !== null) patch.provider = provider;

    let row;
    if (existing?.id) {
      const { data, error } = await admin
        .from("wallets")
        .update(patch)
        .eq("id", existing.id)
        .select(
          "id, network, asset_code, address, is_primary, label, provider"
        )
        .single();
      if (error) throw new Error(error.message);
      row = data;
    } else {
      const { data, error } = await admin
        .from("wallets")
        .insert({
          user_id: user.id,
          network,
          asset_code: assetCode,
          address,
          is_primary: body.isPrimary !== false,
          label,
          provider,
        })
        .select(
          "id, network, asset_code, address, is_primary, label, provider"
        )
        .single();
      if (error) throw new Error(error.message);
      row = data;
    }

    return NextResponse.json({ wallet: row });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unable to save wallet." },
      { status: 400 }
    );
  }
}

export async function GET() {
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
    const { data, error } = await supabase
      .from("wallets")
      .select(
        "id, network, asset_code, address, is_primary, label, provider"
      )
      .eq("user_id", user.id)
      .order("is_primary", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({
      wallets: data || [],
      providers: SOLANA_WALLET_PROVIDERS,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unable to load wallets." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
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
    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing wallet id." }, { status: 400 });
    }
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("wallets")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unable to remove wallet." },
      { status: 400 }
    );
  }
}

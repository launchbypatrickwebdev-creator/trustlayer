/**
 * Load enabled assets from public.crypto_assets (DB), with code-level fallback
 * via assetMeta when the table is empty or the row is missing.
 */
import { PublicKey } from "@solana/web3.js";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import {
  assetMeta,
  isCryptoAssetCode,
  type CryptoAssetCode,
} from "@/lib/crypto/solana";

export type DbCryptoAsset = {
  code: string;
  name: string;
  asset_type: "native_sol" | "spl" | "nft" | string;
  mint: string | null;
  decimals: number;
  token_program: string | null;
  network: string;
  enabled: boolean;
};

export async function listEnabledCryptoAssets(
  network?: string
): Promise<DbCryptoAsset[]> {
  const admin = createSupabaseAdminClient();
  let q = admin
    .from("crypto_assets")
    .select(
      "code, name, asset_type, mint, decimals, token_program, network, enabled"
    )
    .eq("enabled", true);
  if (network) q = q.eq("network", network);
  const { data, error } = await q.order("code");
  if (error) {
    console.warn("[crypto_assets] list failed:", error.message);
    return [];
  }
  return (data || []) as DbCryptoAsset[];
}

export type ResolvedAsset = {
  code: string;
  assetType: "native_sol" | "spl" | "nft";
  mint: PublicKey | null;
  decimals: number;
  tokenProgram: string | null;
  source: "db" | "fallback";
};

/** Prefer DB row; fall back to hardcoded assetMeta. */
export async function resolveCryptoAsset(
  code: string,
  network?: string
): Promise<ResolvedAsset> {
  const c = String(code || "").toUpperCase().trim();
  const admin = createSupabaseAdminClient();
  let q = admin
    .from("crypto_assets")
    .select("code, asset_type, mint, decimals, token_program, network, enabled")
    .eq("code", c)
    .eq("enabled", true)
    .limit(1);
  if (network) q = q.eq("network", network);
  const { data } = await q.maybeSingle();

  if (data) {
    const at = String(data.asset_type || "");
    let mint: PublicKey | null = null;
    if (data.mint) {
      try {
        mint = new PublicKey(String(data.mint));
      } catch {
        mint = null;
      }
    }
    const assetType: "native_sol" | "spl" | "nft" =
      at === "native_sol" || at === "nft" || at === "spl"
        ? (at as "native_sol" | "spl" | "nft")
        : c === "SOL"
          ? "native_sol"
          : "spl";
    return {
      code: c,
      assetType,
      mint,
      decimals: Number(data.decimals ?? 0),
      tokenProgram: data.token_program ? String(data.token_program) : null,
      source: "db",
    };
  }

  if (c === "NFT") {
    return {
      code: "NFT",
      assetType: "nft",
      mint: null,
      decimals: 0,
      tokenProgram: null,
      source: "fallback",
    };
  }
  if (!isCryptoAssetCode(c)) {
    throw new Error(`Unsupported asset: ${c}`);
  }
  const meta = assetMeta(c as CryptoAssetCode);
  return {
    code: c,
    assetType: meta.assetType === 0 ? "native_sol" : "spl",
    mint: meta.assetType === 0 ? null : meta.mint,
    decimals: meta.decimals,
    tokenProgram: null,
    source: "fallback",
  };
}

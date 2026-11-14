import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { getSupportedTokens } from "@/lib/cross-chain/provider/aurora/deposits-client";
import { destinationAsset } from "@/lib/cross-chain/asset-registry";

export const dynamic = "force-dynamic";

type DestinationAssetRow =
  | {
      code: "SOL" | "USDC" | "USDT";
      enabled: true;
      mint: string | null;
      decimals: number;
      auroraAssetId: string;
    }
  | {
      code: "SOL" | "USDC" | "USDT";
      enabled: false;
      reason: string;
      mint: null;
      decimals: null;
      auroraAssetId: null;
    };

export async function GET() {
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

  try {
    const providerTokens = await getSupportedTokens();
    const codes = ["SOL", "USDC", "USDT"] as const;
    const destinationAssets: DestinationAssetRow[] = codes.map((code) => {
      try {
        const a = destinationAsset(code);
        return {
          code,
          enabled: true as const,
          mint: a.mint,
          decimals: a.decimals,
          auroraAssetId: a.auroraAssetId,
        };
      } catch {
        return {
          code,
          enabled: false as const,
          reason:
            "Exact Aurora Solana destination asset ID is not configured.",
          mint: null,
          decimals: null,
          auroraAssetId: null,
        };
      }
    });

    return NextResponse.json({
      provider: "aurora_intents",
      product: "intents_deposits",
      destinationChain: "solana",
      destinationAssets,
      sourceAssets: providerTokens,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Unable to load Aurora assets.",
      },
      { status: 503 }
    );
  }
}

import { NextResponse } from "next/server";
import { getSolUsdRate, FALLBACK_SOL_USD_RATE } from "@/lib/domain/fee";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Public SOL/USD snapshot for NFT valuation fee conversion. */
export async function GET() {
  try {
    const rate = await getSolUsdRate();
    return NextResponse.json({
      rate,
      source:
        process.env.NEXT_PUBLIC_SOL_USD_RATE || process.env.SOL_USD_RATE
          ? "env"
          : rate === FALLBACK_SOL_USD_RATE
            ? "fallback"
            : "jupiter",
      updatedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({
      rate: FALLBACK_SOL_USD_RATE,
      source: "fallback",
      updatedAt: new Date().toISOString(),
    });
  }
}

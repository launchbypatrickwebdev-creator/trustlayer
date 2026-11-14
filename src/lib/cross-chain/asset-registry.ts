import { SOLANA_CLUSTER, USDC_MINT, USDT_MINT } from "@/lib/crypto/solana";
import type { FungibleAssetCode } from "./types";
export type DestinationAsset = { code:FungibleAssetCode; mint:string|null; decimals:number; auroraAssetId:string };
export function destinationAsset(code:string): DestinationAsset {
 const c=code.toUpperCase() as FungibleAssetCode;
 const env = c === "SOL" ? process.env.AURORA_SOLANA_SOL_ASSET_ID : c === "USDC" ? process.env.AURORA_SOLANA_USDC_ASSET_ID : c === "USDT" ? process.env.AURORA_SOLANA_USDT_ASSET_ID : undefined;
 if (!env) throw new Error(`Aurora destination asset ID for ${c} is not configured; route is disabled until its exact Solana asset ID is verified.`);
 if (c === "SOL") return {code:c,mint:null,decimals:9,auroraAssetId:env};
 if (c === "USDC") return {code:c,mint:USDC_MINT.toBase58(),decimals:6,auroraAssetId:env};
 if (c === "USDT" && USDT_MINT) return {code:c,mint:USDT_MINT.toBase58(),decimals:6,auroraAssetId:env};
 throw new Error(c === "USDT" ? `USDT is not configured for ${SOLANA_CLUSTER}.` : "Unsupported destination asset.");
}
export function isFungibleAsset(code:string): code is FungibleAssetCode { return ["SOL","USDC","USDT"].includes(code.toUpperCase()); }

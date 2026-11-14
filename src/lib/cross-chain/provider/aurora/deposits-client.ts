import type { AuroraQuote } from "../../types";
const BASE = "https://intents-api.aurora.dev/api";
function appKey() { const key = process.env.AURORA_INTENTS_APP_KEY || process.env.NEXT_PUBLIC_AURORA_INTENTS_APP_KEY; if (!key) throw new Error("Aurora Intents app key is not configured."); return key; }
async function parse<T>(res: Response): Promise<T> { const body = await res.text(); if (!res.ok) throw new Error(`Aurora API ${res.status}: ${body.slice(0, 300)}`); try { return JSON.parse(body) as T; } catch { throw new Error("Aurora returned invalid JSON."); } }
export async function getSupportedTokens(): Promise<unknown> { return parse(await fetch(`${BASE}/tokens/${encodeURIComponent(appKey())}`, { cache: "no-store" })); }
export async function requestDepositQuote(input: { originAsset: string; destinationAsset: string; amount: string; recipient: string; refundTo: string; deadline: string; slippageTolerance?: number }): Promise<AuroraQuote> {
 const res = await fetch(`${BASE}/quote/${encodeURIComponent(appKey())}`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ dry:false, swapType:"EXACT_INPUT", slippageTolerance:input.slippageTolerance ?? 100, originAsset:input.originAsset, depositType:"ORIGIN_CHAIN", destinationAsset:input.destinationAsset, amount:input.amount, recipient:input.recipient, recipientType:"DESTINATION_CHAIN", refundTo:input.refundTo, refundType:"ORIGIN_CHAIN", deadline:input.deadline }), cache:"no-store" });
 const data = await parse<Record<string, unknown>>(res); const q = (data.quote && typeof data.quote === "object" ? data.quote : data) as Record<string, unknown>; if (!q.depositAddress) throw new Error("Aurora quote did not return a deposit address."); return q as AuroraQuote;
}
export async function getTransactions(walletAddress: string): Promise<any[]> { const u = `${BASE}/transactions/${encodeURIComponent(appKey())}?walletAddress=${encodeURIComponent(walletAddress)}`; const data = await parse<any>(await fetch(u,{cache:"no-store"})); return Array.isArray(data) ? data : Array.isArray(data.data) ? data.data : []; }

/** Find an exact assetId in Aurora's supported-token response; no symbol guessing. */
export function findAuroraTokenByAssetId(payload:unknown,assetId:string):Record<string,unknown>|null {
 const seen=new Set<unknown>(); const visit=(v:unknown):Record<string,unknown>|null=>{
  if(!v||typeof v!=="object"||seen.has(v))return null; seen.add(v);
  if(Array.isArray(v)){for(const x of v){const hit=visit(x);if(hit)return hit;}return null;}
  const o=v as Record<string,unknown>; if(String(o.assetId??o.asset_id??"")===assetId)return o;
  for(const x of Object.values(o)){const hit=visit(x);if(hit)return hit;} return null;
 }; return visit(payload);
}

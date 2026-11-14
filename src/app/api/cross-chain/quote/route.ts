import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { destinationAsset } from "@/lib/cross-chain/asset-registry";
import { requestDepositQuote, getSupportedTokens, findAuroraTokenByAssetId } from "@/lib/cross-chain/provider/aurora/deposits-client";
export const dynamic="force-dynamic";
export async function POST(req:Request){
 try {
  const supabase=await createSupabaseServerClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const idem=String(req.headers.get("idempotency-key")||"").trim(); if(!idem || idem.length<16 || idem.length>128)return NextResponse.json({error:"A valid Idempotency-Key header (16–128 characters) is required."},{status:400});
  const body=await req.json(); const dealId=String(body.dealId||""); const legIndex=body.legIndex===1?1:body.legIndex===0?0:null; const sourceAssetId=String(body.sourceAssetId||"").trim(); const sourceAmount=String(body.sourceAmount||"").trim(); const refundTo=String(body.refundTo||"").trim();
  if(!dealId||!sourceAssetId||!/^\d+$/.test(sourceAmount)||BigInt(sourceAmount)<=0n||!refundTo)return NextResponse.json({error:"dealId, Aurora sourceAssetId, positive base-unit sourceAmount and source-chain refundTo are required."},{status:400});
  const admin=createSupabaseAdminClient(); const {data:prior}=await (admin as any).from("cross_chain_funding_orders").select("id,provider_deposit_address,provider_deposit_memo,destination_asset_code,destination_wallet,expected_amount,quote_expires_at,source_asset_id,source_amount").eq("participant_id",user.id).eq("idempotency_key",idem).maybeSingle(); if(prior)return NextResponse.json({order:{id:prior.id,depositAddress:prior.provider_deposit_address,depositMemo:prior.provider_deposit_memo,depositAddressAndMemo:prior.provider_deposit_address,sourceAssetId:prior.source_asset_id,sourceAmount:prior.source_amount,destinationAsset:prior.destination_asset_code,recipient:prior.destination_wallet,expectedAmount:prior.expected_amount,expiresAt:prior.quote_expires_at,provider:"aurora_intents"}});
  const {data:deal}=await admin.from("deals").select("id,buyer_id,seller_id,rail,chain,asset_code,status,amount,settlement_adapter").eq("id",dealId).maybeSingle();
  if(!deal)return NextResponse.json({error:"Deal not found."},{status:404}); if(deal.rail!=="crypto" || !["accepted","awaiting_payment","funded"].includes(String(deal.status)))return NextResponse.json({error:"Deal is not eligible for crypto funding."},{status:409});
  let participantId:string|null=null; let assetCode=""; let dealLegId:string|null=null;
  if(legIndex!==null){
   const {data:leg}=await admin.from("deal_settlement_legs").select("id,deal_id,leg_index,party_role,asset_code,asset_type,mint,amount_base_units,decimals").eq("deal_id",dealId).eq("leg_index",legIndex).maybeSingle();
   if(!leg)return NextResponse.json({error:"Ax leg not found."},{status:404});
   participantId=leg.party_role==="buyer"?deal.buyer_id:deal.seller_id; assetCode=String(leg.asset_code).toUpperCase(); dealLegId=leg.id;
  } else {
   participantId=deal.buyer_id; assetCode=String(deal.asset_code||"").toUpperCase();
   const {data:settlement}=await admin.from("crypto_settlements").select("amount_base_units,mint,asset_code,asset_type").eq("deal_id",dealId).eq("milestone_index",0).is("ax_leg_index",null).maybeSingle();
   if(!settlement)return NextResponse.json({error:"The existing TrustLayer escrow settlement must be prepared before cross-chain funding."},{status:409});
   assetCode=String(settlement.asset_code||assetCode).toUpperCase();
  }
  if(!participantId || participantId!==user.id)return NextResponse.json({error:"Only the participant responsible for this funding leg can create its cross-chain order."},{status:403});
  if(!["SOL","USDC","USDT"].includes(assetCode))return NextResponse.json({error:"Aurora Intents Deposits integration currently accepts fungible SOL, USDC or USDT destinations only. NFT cross-chain transfer is not enabled until an NFT transfer provider is verified."},{status:422});
  // Primary preferred; any linked Solana address is fine (schema may lack is_primary).
  let destinationWallet="";
  {
    const cluster=process.env.NEXT_PUBLIC_SOLANA_CLUSTER||"devnet";
    const {data:wallets}=await admin.from("wallets").select("address,asset_code,network").eq("user_id",user.id).limit(20);
    const rows=wallets||[];
    const pick=rows.find((w:any)=>String(w.address||"").trim().length>=32 && (String(w.network||"").toLowerCase()===cluster || !w.network) && String(w.asset_code||"SOL").toUpperCase()==="SOL")
      || rows.find((w:any)=>String(w.address||"").trim().length>=32);
    if(!pick?.address)return NextResponse.json({error:"Link a Solana wallet on your TrustLayer profile before requesting a cross-chain quote."},{status:409});
    destinationWallet=String(pick.address).trim();
  }
  const destination=destinationAsset(assetCode);
  const supported=await getSupportedTokens(); const sourceToken=findAuroraTokenByAssetId(supported,sourceAssetId); if(!sourceToken)return NextResponse.json({error:"The source asset ID is not present in Aurora supported tokens."},{status:422});
  const deadline=new Date(Date.now()+15*60_000).toISOString();
  const quote=await requestDepositQuote({originAsset:sourceAssetId,destinationAsset:destination.auroraAssetId,amount:sourceAmount,recipient:destinationWallet,refundTo,deadline,slippageTolerance:100});
  const orderId=randomUUID(); const expiresAt=String(quote.deadline||deadline);
  const row={id:orderId,deal_id:dealId,deal_leg_id:dealLegId,participant_id:user.id,participant_wallet:destinationWallet,provider:"aurora_intents",provider_product:"intents_deposits",provider_deposit_address:quote.depositAddress,provider_deposit_memo:quote.depositMemo??null,source_chain:String(sourceToken.chainName||sourceToken.chain||sourceToken.network||body.sourceChain||"unknown"),source_asset_id:sourceAssetId,source_amount:sourceAmount,refund_to:refundTo,destination_chain:"solana",destination_asset_id:destination.auroraAssetId,destination_asset_code:assetCode,destination_mint:destination.mint,destination_wallet:destinationWallet,expected_amount:quote.amountOut??null,minimum_amount:quote.amountOut??null,provider_status:"PENDING_DEPOSIT",verification_status:"pending",funding_status:"awaiting_deposit",quote_expires_at:expiresAt,idempotency_key:idem,metadata:{aurora_quote:quote}};
  const {error}=await (admin as any).from("cross_chain_funding_orders").insert(row); if(error)throw new Error(`Unable to persist funding order: ${error.message}`);
  return NextResponse.json({order:{id:orderId,depositAddress:quote.depositAddress,depositMemo:quote.depositMemo??null,depositAddressAndMemo:quote.depositAddressAndMemo??quote.depositAddress,sourceAssetId,sourceAmount,destinationAsset:assetCode,recipient:destinationWallet,expectedAmount:quote.amountOut??null,expiresAt,provider:"aurora_intents"}}, {status:201});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Cross-chain quote failed."},{status:502});}
}

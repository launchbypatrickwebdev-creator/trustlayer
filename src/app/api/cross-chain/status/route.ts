import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { getTransactions } from "@/lib/cross-chain/provider/aurora/deposits-client";
import { mapAuroraStatus } from "@/lib/cross-chain/provider/aurora/status-mapper";
import { verifySolanaDelivery } from "@/lib/cross-chain/solana/delivery-verifier";
export const dynamic="force-dynamic";
export async function GET(req:Request){
 const supabase=await createSupabaseServerClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
 const orderId=new URL(req.url).searchParams.get("orderId"); if(!orderId)return NextResponse.json({error:"orderId required."},{status:400}); const admin=createSupabaseAdminClient();
 const {data:order,error}=await (admin as any).from("cross_chain_funding_orders").select("*").eq("id",orderId).eq("participant_id",user.id).maybeSingle(); if(error)return NextResponse.json({error:error.message},{status:500}); if(!order)return NextResponse.json({error:"Funding order not found."},{status:404});
 if(order.funding_status==="asset_delivered"||order.funding_status==="escrow_funded")return NextResponse.json({order:{id:order.id,providerStatus:order.provider_status,verificationStatus:order.verification_status,fundingStatus:order.funding_status,destinationTxSignature:order.destination_tx_signature}});
 try{
  const txs=await getTransactions(order.destination_wallet); const tx=txs.find((x:any)=>x.depositAddress===order.provider_deposit_address || (x.depositAddressAndMemo && String(x.depositAddressAndMemo).startsWith(String(order.provider_deposit_address))));
  if(!tx)return NextResponse.json({order:{id:order.id,providerStatus:order.provider_status,verificationStatus:order.verification_status,fundingStatus:order.funding_status}});
  const mapped=mapAuroraStatus(tx.status); const hashes=Array.isArray(tx.destinationChainTxHashes)?tx.destinationChainTxHashes:[]; const signature=hashes.length?String(hashes[hashes.length-1]):null;
  let verification="pending", funding=mapped.funding, actual=null, failureReason=null;
  if(mapped.provider==="SUCCESS"){
   if(!signature){funding="processing";failureReason="Aurora reports success but has not supplied a Solana destination transaction signature. TrustLayer funding remains blocked.";}
   else {
    const min=String(order.minimum_amount||order.expected_amount||"0"); const result=await verifySolanaDelivery({signature,wallet:order.destination_wallet,mint:order.destination_mint,minimumRaw:min});
    if(result.ok){verification="verified";funding="asset_delivered";actual=result.actualRaw||null;} else {verification="failed";funding="failed";failureReason=result.reason||"Solana delivery did not pass verification.";}
   }
  }
  const update={provider_status:mapped.provider,verification_status:verification,funding_status:funding,destination_tx_signature:signature,actual_amount:actual,failure_reason:failureReason,last_provider_check_at:new Date().toISOString(),...(verification==="verified"?{verified_at:new Date().toISOString()}: {})};
  const {error:updateError}=await (admin as any).from("cross_chain_funding_orders").update(update).eq("id",order.id).eq("participant_id",user.id); if(updateError)throw new Error(updateError.message);
  return NextResponse.json({order:{id:order.id,providerStatus:mapped.provider,verificationStatus:verification,fundingStatus:funding,destinationTxSignature:signature,failureReason}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unable to refresh Aurora status."},{status:502});}
}

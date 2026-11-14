import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
export const dynamic="force-dynamic";
export async function GET(_req:Request,{params}:{params:Promise<{orderId:string}>}){
 const supabase=await createSupabaseServerClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
 const {orderId}=await params; const admin=createSupabaseAdminClient(); const {data,error}=await (admin as any).from("cross_chain_funding_orders").select("id,deal_id,deal_leg_id,participant_id,provider_deposit_address,provider_deposit_memo,source_chain,source_asset_id,source_amount,destination_asset_code,destination_mint,destination_wallet,expected_amount,actual_amount,destination_tx_signature,provider_status,verification_status,funding_status,quote_expires_at,failure_code,failure_reason,created_at,updated_at").eq("id",orderId).eq("participant_id",user.id).maybeSingle();
 if(error)return NextResponse.json({error:error.message},{status:500}); if(!data)return NextResponse.json({error:"Funding order not found."},{status:404}); return NextResponse.json({order:data});
}

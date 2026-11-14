import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { decodeEscrowAccount } from "@/lib/crypto/escrow-accounts";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { DEVNET_RPC_URL, TRUSTLAYER_PROGRAM_ID, deriveEscrowPda } from "@/lib/crypto/solana";

function decode(raw: Buffer) {
  const e = decodeEscrowAccount(raw);
  return {
    dealId: e.dealId,
    milestoneIndex: e.milestoneIndex,
    initiator: new PublicKey(e.initiator),
    buyer: new PublicKey(e.buyer),
    seller: new PublicKey(e.seller),
    funded: e.funded,
    status: e.status,
  };
}
function chainDealIdFromUuid(v:string){ const h=createHash("sha256").update(v+":0").digest(); let n=new DataView(h.buffer,h.byteOffset,8).getBigUint64(0,true); return n===0n?"1":n.toString(); }
export async function POST(request: Request, context:{params:Promise<{id:string}>}) {
  const origin=request.headers.get("origin"); if(origin&&origin!==new URL(request.url).origin) return NextResponse.json({error:"Invalid request origin."},{status:403});
  try {
    const {id}=await context.params; const body=await request.json() as {phase?:string; milestoneIndex?:number; openerWallet?:string; signature?:string; reason?:string};
    const supabase=await createSupabaseServerClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) return NextResponse.json({error:"Authentication required."},{status:401});
    const admin=createSupabaseAdminClient(); const m=Number(body.milestoneIndex); if(!Number.isInteger(m)||m<0||m>9) return NextResponse.json({error:"Invalid milestone index."},{status:400});
    const {data:deal}=await admin.from("deals").select("id,buyer_id,seller_id,rail,asset_code,currency,milestone_count,status,agent_transaction_id,creator_checklist").eq("id",id).maybeSingle(); if(!deal) return NextResponse.json({error:"Deal not found."},{status:404});
    if(deal.buyer_id!==user.id&&deal.seller_id!==user.id) return NextResponse.json({error:"Not a deal participant."},{status:403});
    if (deal.creator_checklist?.agent_transaction_id && !deal.agent_transaction_id) return NextResponse.json({error:"This agent-originated deal is not linked yet. Complete the agent-to-deal bridge before opening a dispute."},{status:409});
    const {data:settlement}=await admin.from("crypto_settlements").select("*").eq("deal_id",id).eq("milestone_index",m).maybeSingle(); if(!settlement?.chain_deal_id||!settlement.initiator_wallet) return NextResponse.json({error:"This milestone escrow is not prepared."},{status:409});
    const initiator=new PublicKey(settlement.initiator_wallet); const [escrow]=deriveEscrowPda(initiator,String(settlement.chain_deal_id),m);
    if(settlement.escrow_pda&&settlement.escrow_pda!==escrow.toBase58()) return NextResponse.json({error:"Stored escrow PDA does not match the milestone."},{status:409});
    if(body.phase==="prepare") {
      const connection=new Connection(DEVNET_RPC_URL,"confirmed"); const account=await connection.getAccountInfo(escrow,"confirmed"); if(!account||!account.owner.equals(TRUSTLAYER_PROGRAM_ID)) return NextResponse.json({error:"Escrow account not found on TrustLayer."},{status:409}); const chain=decode(Buffer.from(account.data)); if(!chain.funded||chain.status!==0) return NextResponse.json({error:"Escrow is not an active funded milestone."},{status:409});
      if(body.openerWallet!==chain.buyer.toBase58()&&body.openerWallet!==chain.seller.toBase58()) return NextResponse.json({error:"Connected wallet is not a party to this escrow."},{status:403});
      return NextResponse.json({chainDealId:String(settlement.chain_deal_id),initiatorWallet:initiator.toBase58(),escrowPda:escrow.toBase58(),milestoneIndex:m});
    }
    if(body.phase!=="record"||!body.signature||!body.reason||body.reason.trim().length<10) return NextResponse.json({error:"A confirmed on-chain dispute signature and reason are required."},{status:400});
    const connection=new Connection(DEVNET_RPC_URL,"confirmed"); const account=await connection.getAccountInfo(escrow,"confirmed"); if(!account||!account.owner.equals(TRUSTLAYER_PROGRAM_ID)) return NextResponse.json({error:"Escrow account is unavailable."},{status:409}); const chain=decode(Buffer.from(account.data));
    if(chain.status!==4) return NextResponse.json({error:"The on-chain escrow is not disputed."},{status:409});
    if(chain.dealId!==String(settlement.chain_deal_id)||chain.milestoneIndex!==m) return NextResponse.json({error:"On-chain dispute does not match this milestone."},{status:409});
    if(body.openerWallet!==chain.buyer.toBase58()&&body.openerWallet!==chain.seller.toBase58()) return NextResponse.json({error:"Dispute opener does not match escrow party."},{status:403});
    const {data:dispute,error}=await (admin.rpc as any)("record_onchain_deal_dispute",{p_deal_id:id,p_milestone_index:m,p_actor_user_id:user.id,p_reason:body.reason.trim(),p_signature:body.signature});
    if(error||!dispute) return NextResponse.json({error:error?.message||"Unable to record dispute."},{status:409});
    if (deal.agent_transaction_id) {
      const { error: agentSyncError } = await admin.rpc("tl_agent_sync_verified_deal", {
        p_deal_id: id, p_chain_state: "disputed", p_signature: body.signature,
      });
      if (agentSyncError) console.error("Agent dispute state sync failed:", agentSyncError.message);
    }
    return NextResponse.json({disputed:true,dispute});
  } catch(e){ return NextResponse.json({error:e instanceof Error?e.message:"Unable to process dispute."},{status:500}); }
}

import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { DEVNET_RPC_URL } from "@/lib/crypto/solana";
/** Verify a specific successful destination signature, not a wallet balance delta. */
export async function verifySolanaDelivery(input:{signature:string;wallet:string;mint:string|null;minimumRaw:string}):Promise<{ok:boolean;actualRaw?:string;reason?:string}> {
 try {
  const connection=new Connection(process.env.SOLANA_RPC_URL || DEVNET_RPC_URL,"confirmed");
  const tx=await connection.getParsedTransaction(input.signature,{commitment:"confirmed",maxSupportedTransactionVersion:0});
  if(!tx || tx.meta?.err) return {ok:false,reason:"Destination transaction is not confirmed successfully."};
  const owner=new PublicKey(input.wallet); const min=BigInt(input.minimumRaw);
  if(input.mint===null){
   let received=0n; for(const ix of tx.transaction.message.instructions){ if("parsed" in ix && ix.program === "system" && ix.parsed?.type === "transfer" && ix.parsed.info?.destination===owner.toBase58()) received+=BigInt(ix.parsed.info.lamports||0); }
   if(received<min)return {ok:false,actualRaw:received.toString(),reason:"Confirmed SOL transfer is below the quoted minimum."};
   return {ok:true,actualRaw:received.toString()};
  }
  const mint=new PublicKey(input.mint); let received=0n;
  for(const b of tx.meta?.preTokenBalances||[]){ if(b.owner===owner.toBase58() && b.mint===mint.toBase58()) { const a=(tx.meta?.postTokenBalances||[]).find(x=>x.accountIndex===b.accountIndex); if(a) { const delta=BigInt(a.uiTokenAmount.amount)-BigInt(b.uiTokenAmount.amount); if(delta>0n) received+=delta; } } }
  for(const a of tx.meta?.postTokenBalances||[]){ if(a.owner===owner.toBase58() && a.mint===mint.toBase58() && !(tx.meta?.preTokenBalances||[]).some(b=>b.accountIndex===a.accountIndex)){received+=BigInt(a.uiTokenAmount.amount);} }
  if(received<min)return {ok:false,actualRaw:received.toString(),reason:"Confirmed token delivery is below the quoted minimum."};
  return {ok:true,actualRaw:received.toString()};
 }catch(e){return {ok:false,reason:e instanceof Error?e.message:"Solana delivery verification failed."};}
}

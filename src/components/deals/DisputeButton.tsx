"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import TrustLayerWalletSelector from "@/components/crypto/TrustLayerWalletSelector";
import { DEVNET_RPC_URL, TRUSTLAYER_PROGRAM_ID, deriveEscrowPda, createOpenDisputeInstructionData } from "@/lib/crypto/solana";

export default function DisputeButton({ dealId, milestoneIndex = 0 }: { dealId: string; milestoneIndex?: number }) {
  const { publicKey, signTransaction, connected } = useWallet();
  const router = useRouter();
  const [open, setOpen] = useState(false); const [reason, setReason] = useState(""); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  async function submit() {
    setLoading(true); setError("");
    try {
      if (!publicKey || !signTransaction) throw new Error("Connect the party wallet first.");
      if (reason.trim().length < 10) throw new Error("Provide at least 10 characters explaining the dispute.");
      const prep = await fetch(`/api/deals/${dealId}/dispute`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phase: "prepare", milestoneIndex, openerWallet: publicKey.toBase58() }) });
      const p = await prep.json(); if (!prep.ok) throw new Error(p.error || "Unable to prepare dispute.");
      const initiator = new PublicKey(p.initiatorWallet); const escrow = new PublicKey(p.escrowPda);
      const connection = new Connection(DEVNET_RPC_URL, "confirmed"); const latest = await connection.getLatestBlockhash("confirmed");
      const ix = new TransactionInstruction({ programId: TRUSTLAYER_PROGRAM_ID, keys: [
        { pubkey: publicKey, isSigner: true, isWritable: false },
        { pubkey: initiator, isSigner: false, isWritable: false },
        { pubkey: escrow, isSigner: false, isWritable: true },
      ], data: createOpenDisputeInstructionData(p.chainDealId, milestoneIndex, initiator) });
      const tx = new Transaction({ feePayer: publicKey, recentBlockhash: latest.blockhash }).add(ix);
      const signed = await signTransaction(tx); const signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
      await connection.confirmTransaction({ signature, ...latest }, "confirmed");
      const res = await fetch(`/api/deals/${dealId}/dispute`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phase: "record", milestoneIndex, openerWallet: publicKey.toBase58(), signature, reason: reason.trim() }) });
      const body = await res.json(); if (!res.ok) throw new Error(body.error || "Unable to record dispute.");
      router.refresh();
      setOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to open dispute."); } finally { setLoading(false); }
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-amber-300 px-5 py-3 text-sm font-medium text-amber-800">Dispute milestone {milestoneIndex + 1}</button>;
  return <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4">
    <h3 className="font-semibold text-amber-900">Open dispute for milestone {milestoneIndex + 1}</h3>
    {!connected && <div className="mt-3"><TrustLayerWalletSelector /></div>}
    <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} maxLength={4000} placeholder="Explain what went wrong and what evidence you can provide." className="mt-4 w-full rounded-lg border border-amber-300 bg-white p-3 text-sm text-black" />
    {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    <div className="mt-3 flex gap-3"><button type="button" onClick={submit} disabled={loading || !connected || reason.trim().length < 10} className="rounded-lg bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50">{loading ? "Opening dispute..." : "Open Dispute"}</button><button type="button" onClick={() => setOpen(false)} disabled={loading} className="rounded-lg border px-4 py-3 text-sm">Cancel</button></div>
  </div>;
}

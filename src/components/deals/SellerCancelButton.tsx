"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  DEVNET_RPC_URL,
  createCancelBySellerInstructionData,
  createCancelSplInstructionData,
  createCancelUnfundedInstructionData,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  assetMeta,
} from "@/lib/crypto/solana";
import TrustLayerWalletSelector from "@/components/crypto/TrustLayerWalletSelector";

interface Props {
  dealId: string;
  /** SOL | USDC | USDT — fallback if prepare does not return assetCode */
  assetCode?: string;
  /** Milestone to cancel (0 = one-time / first stage) */
  milestoneIndex?: number;
  /** unfunded = cancel_unfunded (created_unfunded); funded = seller cancel after fund */
  variant?: "funded" | "unfunded";
}

interface Prepared {
  chainDealId: string;
  escrowPda: string;
  sellerWallet: string;
  buyerWallet: string;
  initiatorWallet: string;
  feeReceiver: string;
  amountBaseUnits: string;
  cancellationFeeAmount: string;
  totalLocked: string;
  programId: string;
  systemProgram: string;
  milestoneIndex?: number;
}

export default function SellerCancelButton({
  dealId,
  assetCode = "SOL",
  milestoneIndex = 0,
  variant = "funded",
}: Props) {
  const { publicKey, connected, signTransaction, sendTransaction, wallet } = useWallet();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function cancel() {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      if (!publicKey || (!signTransaction && !sendTransaction)) {
        throw new Error("Connect a Solana wallet that can sign transactions.");
      }

      const seller = publicKey;
      const sellerWallet = seller.toBase58();

      // 1. Create session — cancel_unfunded vs funded seller cancel
      const sessionResponse = await fetch("/api/crypto/action-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId,
          action: variant === "unfunded" ? "cancel_unfunded" : "cancel",
          milestoneIndex,
        }),
      });
      const sessionResult = await sessionResponse.json();
      if (!sessionResponse.ok || !sessionResult.session) {
        throw new Error(
          sessionResult.error || "Unable to authorize cancellation."
        );
      }

      // 2. Prepare cancel
      const prepareResponse = await fetch("/api/crypto/cancel/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: sessionResult.session,
          sellerWallet,
          milestoneIndex,
        }),
      });
      const preparedResult = await prepareResponse.json();
      if (!prepareResponse.ok) {
        const expected = preparedResult.expectedSellerWallet
          ? ` Expected seller wallet: ${preparedResult.expectedSellerWallet}`
          : "";
        throw new Error(
          (preparedResult.error || "Unable to prepare cancellation.") + expected
        );
      }

      if (preparedResult.alreadyCancelled) {
        setSuccess("Escrow already cancelled.");
        window.setTimeout(() => router.refresh(), 100);
        return;
      }

      const prepared = preparedResult.settlement as Prepared;
      const mode =
        String(preparedResult.mode || "") === "cancel_unfunded" ||
        variant === "unfunded"
          ? "cancel_unfunded"
          : String(preparedResult.mode || "cancel_funded");

      const code = String(
        preparedResult.assetCode || assetCode || "SOL"
      ).toUpperCase();

      const isSpl = code === "USDC" || code === "USDT";
      const mIndex = Number(prepared.milestoneIndex ?? milestoneIndex ?? 0);

      const buyer = new PublicKey(prepared.buyerWallet);
      const initiator = new PublicKey(prepared.initiatorWallet);
      const feeReceiver = new PublicKey(prepared.feeReceiver);
      const escrowPk = new PublicKey(prepared.escrowPda);
      const programId = new PublicKey(prepared.programId);

      let instruction: TransactionInstruction;

      if (mode === "cancel_unfunded") {
        instruction = new TransactionInstruction({
          programId,
          keys: [
            { pubkey: seller, isSigner: true, isWritable: true },
            { pubkey: initiator, isSigner: false, isWritable: true },
            { pubkey: buyer, isSigner: false, isWritable: false },
            {
              pubkey: new PublicKey(prepared.sellerWallet),
              isSigner: false,
              isWritable: false,
            },
            { pubkey: escrowPk, isSigner: false, isWritable: true },
          ],
          data: createCancelUnfundedInstructionData(
            prepared.chainDealId,
            mIndex,
            initiator
          ),
        });
      } else if (isSpl) {
        const mint = assetMeta(code as "USDC" | "USDT").mint;
        const escrowAta = getAssociatedTokenAddress(escrowPk, mint);
        const buyerAta = getAssociatedTokenAddress(buyer, mint);
        const feeAta = getAssociatedTokenAddress(feeReceiver, mint);

        instruction = new TransactionInstruction({
          programId,
          keys: [
            { pubkey: seller, isSigner: true, isWritable: true },
            { pubkey: buyer, isSigner: false, isWritable: true },
            { pubkey: initiator, isSigner: false, isWritable: true },
            { pubkey: feeReceiver, isSigner: false, isWritable: true },
            { pubkey: escrowPk, isSigner: false, isWritable: true },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: escrowAta, isSigner: false, isWritable: true },
            { pubkey: buyerAta, isSigner: false, isWritable: true },
            { pubkey: feeAta, isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            {
              pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
              isSigner: false,
              isWritable: false,
            },
            {
              pubkey: SystemProgram.programId,
              isSigner: false,
              isWritable: false,
            },
          ],
          data: createCancelSplInstructionData(
            prepared.chainDealId,
            mIndex,
            initiator
          ),
        });
      } else {
        instruction = new TransactionInstruction({
          programId,
          keys: [
            { pubkey: seller, isSigner: true, isWritable: true },
            { pubkey: buyer, isSigner: false, isWritable: true },
            { pubkey: initiator, isSigner: false, isWritable: true },
            { pubkey: feeReceiver, isSigner: false, isWritable: true },
            { pubkey: escrowPk, isSigner: false, isWritable: true },
            {
              pubkey: SystemProgram.programId,
              isSigner: false,
              isWritable: false,
            },
          ],
          data: createCancelBySellerInstructionData(
            prepared.chainDealId,
            mIndex,
            initiator
          ),
        });
      }

      // 3. Simulate, then sign + send
      const connection = new Connection(DEVNET_RPC_URL, "confirmed");
      const latest = await connection.getLatestBlockhash("confirmed");

      const transaction = new Transaction().add(instruction);
      transaction.feePayer = seller;
      transaction.recentBlockhash = latest.blockhash;

      const sim = await connection.simulateTransaction(transaction);
      if (sim.value.err) {
        const logs = (sim.value.logs || []).join("\n");
        throw new Error(
          `Cancel simulation failed: ${JSON.stringify(sim.value.err)}. ${logs}`
        );
      }

      let signature: string;
      try {
        if (sendTransaction) {
          signature = await sendTransaction(transaction, connection, {
            skipPreflight: false,
            preflightCommitment: "confirmed",
            maxRetries: 3,
          });
        } else if (signTransaction) {
          const signed = await signTransaction(transaction);
          signature = await connection.sendRawTransaction(signed.serialize(), {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          });
        } else {
          throw new Error("Wallet cannot sign transactions.");
        }
      } catch (signErr: unknown) {
        const name =
          signErr && typeof signErr === "object" && "name" in signErr
            ? String((signErr as { name?: string }).name)
            : "";
        const msg =
          signErr instanceof Error ? signErr.message : String(signErr);
        if (
          name === "WalletSignTransactionError" ||
          /unexpected error/i.test(msg)
        ) {
          throw new Error(
            "Wallet rejected the cancel transaction. Confirm Devnet, wallet matches deal participant/seller, then retry. " +
              msg
          );
        }
        throw signErr;
      }

      await connection.confirmTransaction(
        {
          signature,
          blockhash: latest.blockhash,
          lastValidBlockHeight: latest.lastValidBlockHeight,
        },
        "confirmed"
      );

      // 4. Verify
      const verifyResponse = await fetch("/api/crypto/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: sessionResult.session,
          signature,
          sellerWallet,
          milestoneIndex: mIndex,
        }),
      });
      const verified = await verifyResponse.json();
      if (!verifyResponse.ok) {
        throw new Error(
          verified.error || "Unable to verify cancellation."
        );
      }

      if (mode === "cancel_unfunded") {
        setSuccess(
          "Unfunded escrow cancelled. Account closed; rent returned to initiator."
        );
      } else if (isSpl) {
        const decimals = assetMeta(code as "USDC" | "USDT").decimals;
        const refund =
          Number(BigInt(verified.buyerRefund ?? "0")) / 10 ** decimals;
        setSuccess(
          `Milestone ${mIndex + 1} cancelled. The buyer received ${refund} ${code} (no cancellation fee).`
        );
      } else {
        const refund =
          Number(BigInt(verified.buyerRefund ?? "0")) / 1_000_000_000;
        setSuccess(
          `Milestone ${mIndex + 1} cancelled. The buyer received ${refund} SOL (no cancellation fee).`
        );
      }

      window.setTimeout(() => router.refresh(), 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to cancel escrow.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-5 space-y-3">
      {!connected && (
        <div>
          <p className="mb-2 text-xs text-gray-500">
            {variant === "unfunded"
              ? "Connect a participant wallet (initiator, buyer, or seller) for this escrow."
              : "Connect the seller wallet that matches this deal."}
          </p>
          <TrustLayerWalletSelector />
        </div>
      )}

      {connected && publicKey && (
        <p className="break-all font-mono text-xs text-gray-600">
          {publicKey.toBase58()}
          {wallet?.adapter?.name ? ` · ${wallet.adapter.name}` : ""}
        </p>
      )}

      <button
        type="button"
        onClick={cancel}
        disabled={loading || !connected}
        className="rounded-lg border border-red-300 px-5 py-3 text-sm font-medium text-red-700 disabled:opacity-50"
      >
        {loading
          ? "Processing cancellation..."
          : variant === "unfunded"
            ? milestoneIndex > 0
              ? `Cancel unfunded milestone ${milestoneIndex + 1}`
              : "Cancel unfunded"
            : milestoneIndex > 0
              ? `Cancel milestone ${milestoneIndex + 1}`
              : "Cancel Escrow"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {success}
        </p>
      )}
    </div>
  );
}
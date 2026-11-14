"use client";

import { useEffect, useState } from "react";
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
  TRUSTLAYER_PROGRAM_ID,
  TRUSTLAYER_FEE_RECEIVER,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  deriveEscrowPda,
  createReleaseInstructionData,
  createReleaseSplInstructionData,
  getAssociatedTokenAddress,
  assetMeta,
} from "@/lib/crypto/solana";
import TrustLayerWalletSelector from "@/components/crypto/TrustLayerWalletSelector";
import {
  clearWalletPreference,
  isWalletLocked,
  lockWalletPreference,
} from "@/lib/crypto/wallet-preference";

interface Props {
  dealId: string;
  milestoneIndex?: number;
  assetCode?: string;
  label?: string;
}

export default function ReleaseEscrowButton({
  dealId,
  milestoneIndex = 0,
  assetCode = "SOL",
  label = "Release to Seller",
}: Props) {
  const router = useRouter();
  const { publicKey, signTransaction, connected, wallet } = useWallet();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    setRemember(isWalletLocked());
  }, []);

  function applyRememberPreference() {
    if (remember && wallet?.adapter?.name) {
      lockWalletPreference(wallet.adapter.name);
    } else {
      clearWalletPreference();
    }
  }

  async function releaseEscrow() {
    setLoading(true);
    setError("");
    setMsg("");

    try {
      if (!connected || !publicKey || !signTransaction) {
        throw new Error("Connect your buyer wallet before releasing escrow.");
      }

      applyRememberPreference();

      setMsg("Authorizing release...");
      const sessionResponse = await fetch("/api/crypto/action-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId,
          action: "release",
          milestoneIndex,
        }),
      });

      const sessionResult = (await sessionResponse.json()) as {
        session?: string;
        error?: string;
      };

      if (!sessionResponse.ok || !sessionResult.session) {
        throw new Error(
          sessionResult.error || "Unable to authorize escrow release."
        );
      }

      const capability = sessionResult.session;

      setMsg("Preparing release...");
      const prepareResponse = await fetch("/api/crypto/release/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: capability,
          buyerWallet: publicKey.toBase58(),
          milestoneIndex,
        }),
      });

      const prepareResult = (await prepareResponse.json()) as {
        error?: string;
        alreadyReleased?: boolean;
        settlement?: {
          chainDealId: string | number;
          escrowPda: string;
          buyerWallet: string;
          initiatorWallet: string;
          sellerWallet: string;
          feeReceiver?: string;
          amountBaseUnits: string;
          settlementFeeAmount?: string;
          programId?: string;
          milestoneIndex: number;
          assetCode?: string;
          assetType?: number;
        };
      };

      if (!prepareResponse.ok) {
        throw new Error(
          prepareResult.error || "Unable to prepare escrow release."
        );
      }

      if (prepareResult.alreadyReleased) {
        router.refresh();
        return;
      }

      if (!prepareResult.settlement) {
        throw new Error(
          "Release preparation did not return settlement details."
        );
      }

      const settlement = prepareResult.settlement;

      if (settlement.buyerWallet !== publicKey.toBase58()) {
        throw new Error(
          "Connected wallet does not match the buyer wallet for this escrow."
        );
      }

      if (!settlement.feeReceiver) {
        throw new Error(
          "Release preparation did not return the TrustLayer fee receiver."
        );
      }

      const buyer = publicKey;
      const initiator = new PublicKey(settlement.initiatorWallet);
      const seller = new PublicKey(settlement.sellerWallet);
      const escrowPda = new PublicKey(settlement.escrowPda);
      const feeReceiver = new PublicKey(settlement.feeReceiver);

      if (!feeReceiver.equals(TRUSTLAYER_FEE_RECEIVER)) {
        throw new Error(
          "Prepared fee receiver does not match the canonical TrustLayer fee receiver."
        );
      }

      const chainDealId = String(settlement.chainDealId);
      const mIndex = Number(settlement.milestoneIndex ?? milestoneIndex);

      // Prefer prepare response; prop is fallback only — never silent SOL default
      const code = String(
        settlement.assetCode || assetCode || ""
      ).toUpperCase();

      if (code !== "SOL" && code !== "USDC" && code !== "USDT") {
        throw new Error(
          "Missing asset code for release. Server must return assetCode (SOL|USDC|USDT)."
        );
      }

      const isSpl = code === "USDC" || code === "USDT";

      // If prepare returned on-chain assetType, enforce match
      if (typeof settlement.assetType === "number") {
        const onchainSpl = settlement.assetType === 1;
        if (onchainSpl !== isSpl) {
          throw new Error(
            `Asset mismatch: deal says ${code} but on-chain escrow asset_type=${settlement.assetType}`
          );
        }
      }

      if (settlement.programId) {
        const preparedProgram = new PublicKey(settlement.programId);
        if (!preparedProgram.equals(TRUSTLAYER_PROGRAM_ID)) {
          throw new Error(
            "Prepared escrow program does not match the TrustLayer program."
          );
        }
      }

      const [derivedPda] = deriveEscrowPda(initiator, chainDealId, mIndex);
      if (!derivedPda.equals(escrowPda)) {
        throw new Error(
          "Prepared escrow PDA does not match the TrustLayer PDA derivation."
        );
      }

      let instruction: TransactionInstruction;

      if (isSpl) {
        const meta = assetMeta(code as "USDC" | "USDT");
        const mint = meta.mint;
        const escrowAta = getAssociatedTokenAddress(escrowPda, mint);
        const sellerAta = getAssociatedTokenAddress(seller, mint);
        const feeAta = getAssociatedTokenAddress(feeReceiver, mint);

        instruction = new TransactionInstruction({
          programId: TRUSTLAYER_PROGRAM_ID,
          keys: [
            { pubkey: buyer, isSigner: true, isWritable: true },
            { pubkey: initiator, isSigner: false, isWritable: true },
            { pubkey: seller, isSigner: false, isWritable: true },
            { pubkey: feeReceiver, isSigner: false, isWritable: true },
            { pubkey: escrowPda, isSigner: false, isWritable: true },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: escrowAta, isSigner: false, isWritable: true },
            { pubkey: sellerAta, isSigner: false, isWritable: true },
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
          data: createReleaseSplInstructionData(chainDealId, mIndex, initiator),
        });
      } else {
        instruction = new TransactionInstruction({
          programId: TRUSTLAYER_PROGRAM_ID,
          keys: [
            { pubkey: buyer, isSigner: true, isWritable: true },
            { pubkey: initiator, isSigner: false, isWritable: true },
            { pubkey: seller, isSigner: false, isWritable: true },
            { pubkey: feeReceiver, isSigner: false, isWritable: true },
            { pubkey: escrowPda, isSigner: false, isWritable: true },
            {
              pubkey: SystemProgram.programId,
              isSigner: false,
              isWritable: false,
            },
          ],
          data: createReleaseInstructionData(chainDealId, mIndex, initiator),
        });
      }

      setMsg("Waiting for release signature...");
      const connection = new Connection(DEVNET_RPC_URL, {
        commitment: "confirmed",
        confirmTransactionInitialTimeout: 60_000,
      });

      // Fetch blockhash as late as possible (right before sign)
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("finalized");

      const transaction = new Transaction({
        recentBlockhash: blockhash,
        feePayer: buyer,
      }).add(instruction);

      const signedTransaction = await signTransaction(transaction);

      const signature = await connection.sendRawTransaction(
        signedTransaction.serialize(),
        {
          skipPreflight: false,
          preflightCommitment: "confirmed",
          maxRetries: 5,
        }
      );

      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      setMsg("Verifying release...");
      const releaseResponse = await fetch("/api/crypto/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: capability,
          signature,
          buyerWallet: buyer.toBase58(),
          milestoneIndex: mIndex,
        }),
      });

      const releaseResult = (await releaseResponse.json()) as {
        error?: string;
      };

      if (!releaseResponse.ok) {
        throw new Error(
          releaseResult.error ||
            "The release transaction could not be verified."
        );
      }

      setMsg("Released to seller. Escrow closed.");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to release escrow."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <TrustLayerWalletSelector />

      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => {
            setRemember(e.target.checked);
            if (!e.target.checked) clearWalletPreference();
          }}
        />
        Remember this wallet
      </label>

      {connected && publicKey && (
        <p className="break-all font-mono text-xs text-gray-600">
          {publicKey.toBase58()}
          {wallet?.adapter?.name ? ` · ${wallet.adapter.name}` : ""}
        </p>
      )}

      <button
        type="button"
        onClick={() => void releaseEscrow()}
        disabled={loading || !connected}
        className="rounded-lg bg-green-700 px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Releasing..." : label}
      </button>

      {msg && <p className="text-sm text-gray-700">{msg}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

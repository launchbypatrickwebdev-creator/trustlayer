"use client";

import Link from "next/link";

import TokenIcon from "@/components/TokenIcon";
import { useEffect, useState } from "react";
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
  createEscrowInstructionData,
  feeModeToOnChain,
  type CryptoAssetCode,
  createFundEscrowInstructionData,
  createFundEscrowSplInstructionData,
  createReleaseInstructionData,
  createReleaseSplInstructionData,
  getAssociatedTokenAddress,
  assetMeta,
} from "@/lib/crypto/solana";
import { isEscrowFunded } from "@/lib/crypto/escrow-accounts";
import {
  clearWalletPreference,
  isWalletLocked,
  lockWalletPreference,
} from "@/lib/crypto/wallet-preference";
import TrustLayerWalletSelector from "@/components/crypto/TrustLayerWalletSelector";

interface Props {
  dealId: string;
  session: string;
  sellerWallet: string;
  initialStatus: string;
  initialOnchainStatus?: string;
  role?: "buyer" | "seller" | null;
  milestoneIndex?: number;
  milestoneCount?: number;
  assetCode?: string;
  disputed?: boolean;
}

interface PreparedSettlement {
  chainDealId: string;
  escrowPda: string | null;
  amountBaseUnits: string;
  settlementFeeAmount?: string;
  totalLockBaseUnits?: string;
  feeMode?: string;
  sellerWallet: string;
  programId: string;
  status: string;
  deadlineUnix: number;
  milestoneIndex?: number;
  milestoneCount?: number;
  initiatorWallet?: string;
  feeReceiver?: string;
  buyerWallet?: string;
  alreadyCreatedOnChain?: boolean;
  alreadyFundedOnChain?: boolean;
}

function makeConnection() {
  return new Connection(DEVNET_RPC_URL, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60_000,
  });
}

function isAlreadyInUseError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const lower = msg.toLowerCase();
  return (
    lower.includes("already in use") ||
    lower.includes("account already in use") ||
    (lower.includes("custom program error: 0x0") &&
      lower.includes("allocate"))
  );
}

export default function SolanaCreateEscrow({
  dealId,
  session,
  sellerWallet,
  initialStatus,
  initialOnchainStatus = "not_created",
  role = "buyer",
  milestoneIndex = 0,
  milestoneCount = 1,
  assetCode = "SOL",
  disputed = false,
}: Props) {
  const { publicKey, connected, signTransaction, wallet } = useWallet();

  const [status, setStatus] = useState(initialStatus);
  const [onchain, setOnchain] = useState(initialOnchainStatus);
  const [escrowPda, setEscrowPda] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [remember, setRemember] = useState(false);

  const created =
    onchain === "created_unfunded" ||
    onchain === "funded" ||
    onchain === "released" ||
    onchain === "cancelled" ||
    onchain === "refunded";
  const funded = onchain === "funded";
  const terminal =
    onchain === "released" ||
    onchain === "cancelled" ||
    onchain === "refunded";

  useEffect(() => {
    setOnchain(initialOnchainStatus);
    setStatus(initialStatus);
  }, [initialOnchainStatus, initialStatus]);

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

  /** PDA already exists → UI = created (or funded); user can Fund without Create again. */
  async function adoptExistingEscrow(
    escrow: PublicKey,
    connection: Connection,
    label: string
  ) {
    const info = await connection.getAccountInfo(escrow, "confirmed");
    if (!info || !info.owner.equals(TRUSTLAYER_PROGRAM_ID)) {
      return false;
    }
    const isFunded = isEscrowFunded(info.data);
    setEscrowPda(escrow.toBase58());
    if (isFunded) {
      setOnchain("funded");
      setStatus("funded");
      setMsg("Escrow already funded on-chain.");
    } else {
      setOnchain("created_unfunded");
      setMsg(
        label ||
          "Escrow already exists on-chain. You can fund it — no need to create again."
      );
    }
    setError("");
    return true;
  }

  async function createEscrow() {
    try {
      setLoading(true);
      setError("");
      setMsg("Preparing create...");
      if (!publicKey || !signTransaction) {
        throw new Error("Connect a Solana wallet first.");
      }
      applyRememberPreference();

      const prepRes = await fetch("/api/crypto/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session,
          buyerWallet: publicKey.toBase58(),
          milestoneIndex,
        }),
      });
      const prepared = await prepRes.json();
      if (!prepRes.ok) throw new Error(prepared.error || "Prepare failed");

      const s = prepared.settlement as PreparedSettlement;
      const buyer = publicKey;
      const seller = new PublicKey(s.sellerWallet || sellerWallet);
      const amount = BigInt(s.amountBaseUnits);
      const settlementFee = BigInt(s.settlementFeeAmount || "0");
      if (settlementFee <= 0n) {
        throw new Error(
          "Prepare did not return settlementFeeAmount. Redeploy prepare route after fee alignment."
        );
      }
      const chainDealId = s.chainDealId;
      const mIndex = s.milestoneIndex ?? milestoneIndex;
      const mCount = s.milestoneCount ?? milestoneCount;
      const deadlineUnix = s.deadlineUnix;
      const asset = assetMeta((assetCode as CryptoAssetCode) || "SOL");
      const [escrow] = deriveEscrowPda(buyer, chainDealId, mIndex);
      const connection = makeConnection();

      // Server already saw PDA, or local status says created
      if (
        s.alreadyCreatedOnChain ||
        s.status === "created_unfunded" ||
        s.status === "funded"
      ) {
        await adoptExistingEscrow(
          escrow,
          connection,
          s.alreadyFundedOnChain || s.status === "funded"
            ? "Escrow already funded on-chain."
            : "Escrow already exists on-chain. You can fund it."
        );
        return;
      }

      // Client-side pre-check before wallet prompt
      const existing = await connection.getAccountInfo(escrow, "confirmed");
      if (existing && existing.owner.equals(TRUSTLAYER_PROGRAM_ID)) {
        // Re-run prepare so DB catches up, then unlock Fund
        await fetch("/api/crypto/prepare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session,
            buyerWallet: publicKey.toBase58(),
            milestoneIndex: mIndex,
          }),
        }).catch(() => null);
        await adoptExistingEscrow(
          escrow,
          connection,
          "Escrow already exists on-chain. You can fund it."
        );
        return;
      }

      const ix = new TransactionInstruction({
        programId: TRUSTLAYER_PROGRAM_ID,
        keys: [
          { pubkey: buyer, isSigner: true, isWritable: true },
          { pubkey: seller, isSigner: false, isWritable: false },
          { pubkey: escrow, isSigner: false, isWritable: true },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
        ],
        data: createEscrowInstructionData(
          chainDealId,
          mIndex,
          mCount,
          amount,
          settlementFee,
          seller,
          deadlineUnix,
          asset.assetType,
          asset.mint,
          feeModeToOnChain(s.feeMode)
        ),
      });

      setMsg("Waiting for wallet signature...");
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("finalized");

      const tx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: buyer,
      }).add(ix);

      const signed = await signTransaction(tx);

      let signature: string;
      try {
        signature = await connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
          maxRetries: 5,
        });
        await connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          "confirmed"
        );
      } catch (sendErr) {
        // Race: create landed earlier / concurrent retry → PDA already in use
        if (isAlreadyInUseError(sendErr)) {
          await fetch("/api/crypto/prepare", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session,
              buyerWallet: publicKey.toBase58(),
              milestoneIndex: mIndex,
            }),
          }).catch(() => null);
          const ok = await adoptExistingEscrow(
            escrow,
            connection,
            "Escrow was already created on-chain. You can fund it now."
          );
          if (ok) return;
        }
        throw sendErr;
      }

      setMsg("Verifying on-chain...");
      const verifyRes = await fetch("/api/crypto/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session,
          signature,
          buyerWallet: buyer.toBase58(),
          milestoneIndex: mIndex,
        }),
      });
      const verified = await verifyRes.json();
      if (!verifyRes.ok) {
        // Tx may have succeeded; PDA exists → still unlock Fund
        const ok = await adoptExistingEscrow(
          escrow,
          connection,
          "Create may have succeeded on-chain. Checking escrow…"
        );
        if (ok) return;
        throw new Error(verified.error || "Verify failed");
      }

      setEscrowPda(verified.escrowPda || escrow.toBase58());
      setOnchain("created_unfunded");
      setMsg("Escrow created (unfunded).");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Create failed";
      // Last resort: if error text is already-in-use, try adopt
      if (isAlreadyInUseError(e) && publicKey) {
        try {
          const connection = makeConnection();
          // We may not have chainDealId in scope if prepare failed — ignore
          setError("");
          setMsg(
            "Escrow account already exists on-chain. Refresh the page or click Create once more to unlock Fund."
          );
          setOnchain("created_unfunded");
          return;
        } catch {
          /* fall through */
        }
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function fundEscrow() {
    try {
      setLoading(true);
      setError("");
      setMsg("Authorizing fund...");
      if (!publicKey || !signTransaction) {
        throw new Error("Connect a Solana wallet first.");
      }
      applyRememberPreference();

      const sessionRes = await fetch("/api/crypto/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, milestoneIndex }),
      });
      const sessionBody = await sessionRes.json();
      if (!sessionRes.ok || !sessionBody.depositUrl) {
        throw new Error(sessionBody.error || "Could not authorize funding.");
      }
      const fundSession = new URL(
        sessionBody.depositUrl,
        window.location.origin
      ).searchParams.get("session");
      if (!fundSession)
        throw new Error("Funding session missing from server response.");

      const prepRes = await fetch("/api/crypto/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: fundSession,
          buyerWallet: publicKey.toBase58(),
          milestoneIndex,
          action: "fund",
        }),
      });
      const prepared = await prepRes.json();
      if (!prepRes.ok) throw new Error(prepared.error || "Prepare fund failed");

      const s = prepared.settlement as PreparedSettlement;
      const buyer = publicKey;
      const chainDealId = s.chainDealId;
      const mIndex = Number(s.milestoneIndex ?? milestoneIndex);

      // FundEscrow PDA seeds use the BUYER (Anchor: buyer.key() + deal_id + index).
      // Prefer the PDA returned by prepare so we never drift from the create path.
      const [derivedEscrow] = deriveEscrowPda(buyer, chainDealId, mIndex);
      const escrow = s.escrowPda
        ? new PublicKey(s.escrowPda)
        : derivedEscrow;
      if (s.escrowPda && s.escrowPda !== derivedEscrow.toBase58()) {
        throw new Error(
          `Escrow PDA mismatch (server ${s.escrowPda} vs derived ${derivedEscrow.toBase58()}). Re-open deposit from the deal page.`
        );
      }

      if (s.alreadyFundedOnChain || s.status === "funded") {
        setEscrowPda(escrow.toBase58());
        setOnchain("funded");
        setStatus("funded");
        setMsg("Escrow already funded on-chain.");
        return;
      }

      const code = (assetCode || "SOL").toUpperCase();
      const isSpl = code === "USDC" || code === "USDT";

      let ix: TransactionInstruction;

      if (isSpl) {
        const meta = assetMeta(code as "USDC" | "USDT");
        const mint = meta.mint;
        const buyerAta = getAssociatedTokenAddress(buyer, mint);
        const escrowAta = getAssociatedTokenAddress(escrow, mint);

        ix = new TransactionInstruction({
          programId: TRUSTLAYER_PROGRAM_ID,
          keys: [
            { pubkey: buyer, isSigner: true, isWritable: true },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: buyerAta, isSigner: false, isWritable: true },
            { pubkey: escrowAta, isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            {
              pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
              isSigner: false,
              isWritable: false,
            },
            { pubkey: escrow, isSigner: false, isWritable: true },
            {
              pubkey: SystemProgram.programId,
              isSigner: false,
              isWritable: false,
            },
          ],
          data: createFundEscrowSplInstructionData(chainDealId, mIndex),
        });
      } else {
        ix = new TransactionInstruction({
          programId: TRUSTLAYER_PROGRAM_ID,
          keys: [
            { pubkey: buyer, isSigner: true, isWritable: true },
            { pubkey: escrow, isSigner: false, isWritable: true },
            {
              pubkey: SystemProgram.programId,
              isSigner: false,
              isWritable: false,
            },
          ],
          data: createFundEscrowInstructionData(chainDealId, mIndex),
        });
      }

      const connection = makeConnection();

      // SOL: ensure wallet can cover amount + 1% settlement fee + tx fee.
      if (!isSpl) {
        const lamports = await connection.getBalance(buyer);
        const principal = BigInt(s.amountBaseUnits || "0");
        const fee = BigInt(s.settlementFeeAmount || "0");
        const need =
          s.totalLockBaseUnits != null && String(s.totalLockBaseUnits).trim() !== ""
            ? BigInt(s.totalLockBaseUnits)
            : principal + fee;
        const headroom = need + 5_000_000n;
        if (BigInt(lamports) < headroom) {
          throw new Error(
            `Not enough SOL to fund. Wallet has ${(lamports / 1e9).toFixed(4)} SOL; need ~${(Number(headroom) / 1e9).toFixed(4)} SOL (lock ${need.toString()} + network).`
          );
        }
      }

      setMsg("Simulating fund...");
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("finalized");

      const tx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: buyer,
      }).add(ix);

      const sim = await connection.simulateTransaction(tx);
      if (sim.value.err) {
        const logs = (sim.value.logs || []).join("\n");
        console.error("Fund simulation failed", sim.value.err, logs);
        throw new Error(
          `Fund simulation failed: ${JSON.stringify(sim.value.err)}. ${logs.slice(0, 600)}`
        );
      }

      setMsg("Waiting for fund signature...");
      const signed = await signTransaction(tx);
      const signature = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
        maxRetries: 5,
      });
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      const fundRes = await fetch("/api/crypto/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: fundSession,
          signature,
          buyerWallet: buyer.toBase58(),
          milestoneIndex: mIndex,
        }),
      });
      const fundedBody = await fundRes.json();
      if (!fundRes.ok) {
        if (fundedBody.alreadyFunded) {
          setEscrowPda(fundedBody.escrowPda || escrow.toBase58());
          setOnchain("funded");
          setStatus("funded");
          setMsg("Escrow already funded.");
          return;
        }
        throw new Error(fundedBody.error || "Fund verify failed");
      }

      setEscrowPda(fundedBody.escrowPda || escrow.toBase58());
      setOnchain("funded");
      setStatus("funded");
      setMsg("Escrow funded. Funds locked.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fund failed");
    } finally {
      setLoading(false);
    }
  }

  async function releaseEscrow() {
    try {
      setLoading(true);
      setError("");
      setMsg("Authorizing release...");
      if (!publicKey || !signTransaction) {
        throw new Error("Connect a Solana wallet first.");
      }
      applyRememberPreference();

      const sessionRes = await fetch("/api/crypto/action-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId,
          action: "release",
          milestoneIndex,
        }),
      });
      const sessionBody = await sessionRes.json();
      if (!sessionRes.ok) {
        throw new Error(sessionBody.error || "Could not authorize release.");
      }
      const releaseSession = sessionBody.session as string;
      if (!releaseSession) {
        throw new Error("Release session missing from server response.");
      }

      setMsg("Preparing release...");
      const prepRes = await fetch("/api/crypto/release/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: releaseSession,
          buyerWallet: publicKey.toBase58(),
          milestoneIndex,
        }),
      });
      const prepared = await prepRes.json();
      if (!prepRes.ok) {
        throw new Error(prepared.error || "Release prepare failed");
      }

      const s = prepared.settlement as PreparedSettlement;
      if (!s?.feeReceiver) {
        throw new Error(
          "Release preparation did not return the TrustLayer fee receiver."
        );
      }

      const buyer = publicKey;
      const initiator = new PublicKey(s.initiatorWallet || buyer.toBase58());
      const seller = new PublicKey(s.sellerWallet || sellerWallet);
      const feeReceiver = new PublicKey(s.feeReceiver);

      if (!feeReceiver.equals(TRUSTLAYER_FEE_RECEIVER)) {
        throw new Error(
          "Prepared fee receiver does not match the canonical TrustLayer fee receiver."
        );
      }

      const chainDealId = s.chainDealId;
      const mIndex = s.milestoneIndex ?? milestoneIndex;
      const [escrow] = deriveEscrowPda(initiator, chainDealId, mIndex);

      const code = (assetCode || "SOL").toUpperCase();
      const isSpl = code === "USDC" || code === "USDT";

      let ix: TransactionInstruction;

      if (isSpl) {
        const meta = assetMeta(code as "USDC" | "USDT");
        const mint = meta.mint;
        const escrowAta = getAssociatedTokenAddress(escrow, mint);
        const sellerAta = getAssociatedTokenAddress(seller, mint);
        const feeAta = getAssociatedTokenAddress(feeReceiver, mint);

        ix = new TransactionInstruction({
          programId: TRUSTLAYER_PROGRAM_ID,
          keys: [
            { pubkey: buyer, isSigner: true, isWritable: true },
            { pubkey: initiator, isSigner: false, isWritable: true },
            { pubkey: seller, isSigner: false, isWritable: true },
            { pubkey: feeReceiver, isSigner: false, isWritable: true },
            { pubkey: escrow, isSigner: false, isWritable: true },
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
        ix = new TransactionInstruction({
          programId: TRUSTLAYER_PROGRAM_ID,
          keys: [
            { pubkey: buyer, isSigner: true, isWritable: true },
            { pubkey: initiator, isSigner: false, isWritable: true },
            { pubkey: seller, isSigner: false, isWritable: true },
            { pubkey: feeReceiver, isSigner: false, isWritable: true },
            { pubkey: escrow, isSigner: false, isWritable: true },
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
      const connection = makeConnection();
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("finalized");

      const tx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: buyer,
      }).add(ix);

      const signed = await signTransaction(tx);
      const signature = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
        maxRetries: 5,
      });
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      const relRes = await fetch("/api/crypto/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: releaseSession,
          signature,
          buyerWallet: buyer.toBase58(),
          milestoneIndex: mIndex,
        }),
      });
      const body = await relRes.json();
      if (!relRes.ok) {
        if (body.alreadyReleased) {
          setOnchain("released");
          setMsg("Already released to seller.");
          return;
        }
        throw new Error(body.error || "Release verify failed");
      }

      setOnchain("released");
      setMsg("Released to seller. Escrow closed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Release failed");
    } finally {
      setLoading(false);
    }
  }

  if (disputed) {
    return (
      <section className="rounded-xl border border-amber-300 bg-amber-50 p-6">
        <h2 className="text-lg font-semibold text-amber-900">Escrow frozen</h2>
        <p className="mt-2 text-sm text-amber-800">
          This deal is disputed. Release and cancel are blocked. Admin resolves
          on-chain (release to seller or refund to buyer).
        </p>
        {escrowPda && (
          <p className="mt-2 break-all font-mono text-xs">PDA: {escrowPda}</p>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Crypto escrow</h2>
      <p className="mt-1 text-sm text-gray-600">
        <span className="inline-flex items-center gap-1.5">
          Asset: <TokenIcon code={assetCode} size={16} /> {assetCode} · Milestone{" "}
          {milestoneIndex + 1}/{milestoneCount}
        </span>
      </p>
      <p className="mt-1 text-xs text-gray-500">Deal status: {status}</p>
      <p className="mt-1 text-xs text-gray-500">On-chain: {onchain}</p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
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
          Remember this wallet (skip picker next time)
        </label>
      </div>

      {connected && publicKey && (
        <p className="mt-2 break-all font-mono text-xs text-gray-600">
          {publicKey.toBase58()}
          {wallet?.adapter?.name ? ` · ${wallet.adapter.name}` : ""}
        </p>
      )}

      {connected && publicKey && (
        <div className="mt-5 space-y-3">
          {role === "buyer" && !created && !terminal && (
            <button
              type="button"
              onClick={() => void createEscrow()}
              disabled={loading}
              className="w-full rounded-lg bg-black px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? "Working..." : "Create Escrow On-Chain"}
            </button>
          )}

          {role === "buyer" && created && !funded && !terminal && (
            <button
              type="button"
              onClick={() => void fundEscrow()}
              disabled={loading}
              className="w-full rounded-lg bg-black px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? "Working..." : "Fund Escrow"}
            </button>
          )}

          {role === "buyer" && funded && !terminal && (
            <button
              type="button"
              onClick={() => void releaseEscrow()}
              disabled={loading}
              className="w-full rounded-lg bg-green-700 px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? "Working..." : "Release to Seller"}
            </button>
          )}
        </div>
      )}

      {created && !funded && !terminal && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Escrow created (unfunded).
          {escrowPda && (
            <div className="mt-1 break-all font-mono text-xs">
              PDA: {escrowPda}
            </div>
          )}
        </div>
      )}

      {funded && !terminal && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Funded — funds locked.
          {escrowPda && (
            <div className="mt-1 break-all font-mono text-xs">
              PDA: {escrowPda}
            </div>
          )}
          <Link
            href={`/deals/${dealId}`}
            className="mt-3 inline-flex text-sm font-semibold text-green-900 underline-offset-2 hover:underline"
          >
            View deal →
          </Link>
        </div>
      )}

      {onchain === "released" && (
        <div className="mt-4 space-y-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          <p>Released to seller. Escrow closed.</p>
          <Link
            href={`/deals/${dealId}`}
            className="inline-flex font-semibold text-green-900 underline-offset-2 hover:underline"
          >
            View deal →
          </Link>
        </div>
      )}

      {msg && <p className="mt-3 text-sm text-gray-700">{msg}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}

"use client";

/**
 * Fungible Ax (2-leg) actions: create_ax_split → fund A/B → release / cancel / reclaim / open_dispute.
 * Uses /api/crypto/ax/prepare + /api/crypto/ax/verify and action-session for capability.
 */

import { useCallback, useState } from "react";
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { DEVNET_RPC_URL } from "@/lib/crypto/solana";
import TrustLayerWalletSelector from "@/components/crypto/TrustLayerWalletSelector";

type AxUiAction =
  | "create"
  | "fund"
  | "release"
  | "cancel"
  | "reclaim"
  | "open_dispute"
  | "cancel_unfunded";

interface AxLegSummary {
  legIndex: number;
  partyRole: string;
  assetCode: string;
  amount?: string;
  feeAmount?: string;
  fundAmount?: string;
  feeBps?: number;
}

interface Props {
  dealId: string;
  role: "buyer" | "seller" | null;
  /** buyer = party A, seller = party B */
  legs?: AxLegSummary[] | null;
  /** Optional known PDA after create */
  axPda?: string | null;
  bothFunded?: boolean;
  fundedA?: boolean;
  fundedB?: boolean;
  onchainStatus?: string | null;
  dealStatus?: string | null;
}

function makeConnection() {
  return new Connection(DEVNET_RPC_URL, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60_000,
  });
}

const SESSION_FOR: Record<AxUiAction, string> = {
  create: "create_ax",
  fund: "fund_ax",
  release: "release_ax",
  cancel: "cancel_ax",
  reclaim: "reclaim",
  open_dispute: "open_dispute_ax",
  cancel_unfunded: "cancel_unfunded",
};

export default function AxDealActions({
  dealId,
  role,
  legs,
  axPda: initialPda,
  bothFunded = false,
  fundedA = false,
  fundedB = false,
  onchainStatus,
  dealStatus,
}: Props) {
  const { publicKey, connected, signTransaction } = useWallet();
  const [busy, setBusy] = useState<AxUiAction | null>(null);
  const [error, setError] = useState("");
  const [lastSig, setLastSig] = useState("");
  const [axPda, setAxPda] = useState(initialPda || "");
  const [localFundedA, setLocalFundedA] = useState(fundedA);
  const [localFundedB, setLocalFundedB] = useState(fundedB);
  const [localBoth, setLocalBoth] = useState(bothFunded);
  const [status, setStatus] = useState(onchainStatus || "not_created");

  const legA = legs?.find((l) => l.legIndex === 0) || legs?.[0];
  const legB = legs?.find((l) => l.legIndex === 1) || legs?.[1];

  const run = useCallback(
    async (action: AxUiAction, leg?: 0 | 1) => {
      setError("");
      setLastSig("");
      if (!publicKey || !signTransaction) {
        setError("Connect a Solana wallet first.");
        return;
      }
      setBusy(action);
      try {
        // Capability (DB enum already includes *_ax / cancel_unfunded / reclaim)
        const sessionRes = await fetch("/api/crypto/action-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dealId,
            action: SESSION_FOR[action],
            milestoneIndex: 0,
          }),
        });
        const sessionJson = (await sessionRes.json()) as {
          session?: string;
          error?: string;
        };
        if (!sessionRes.ok || !sessionJson.session) {
          throw new Error(
            sessionJson.error || "Unable to authorize Ax action."
          );
        }

        const prepBody: Record<string, unknown> = {
          dealId,
          action,
          session: sessionJson.session,
          partyAWallet:
            role === "buyer" ? publicKey.toBase58() : undefined,
          partyBWallet:
            role === "seller" ? publicKey.toBase58() : undefined,
        };
        if (leg === 0 || leg === 1) prepBody.leg = leg;
        if (action === "create" && legA && legB) {
          prepBody.legA = {
            assetCode: legA.assetCode,
            amount: legA.amount || legA.fundAmount || "0",
          };
          prepBody.legB = {
            assetCode: legB.assetCode,
            amount: legB.amount || legB.fundAmount || "0",
          };
        }

        const prepRes = await fetch("/api/crypto/ax/prepare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(prepBody),
        });
        const prep = (await prepRes.json()) as {
          error?: string;
          instruction?: {
            programId: string;
            data: string;
            keys: Array<{
              pubkey: string;
              isSigner: boolean;
              isWritable: boolean;
            }>;
          };
          axPda?: string;
          chainDealId?: string;
        };
        if (!prepRes.ok || !prep.instruction) {
          throw new Error(prep.error || "Ax prepare failed.");
        }
        if (prep.axPda) setAxPda(prep.axPda);

        const ix = new TransactionInstruction({
          programId: new PublicKey(prep.instruction.programId),
          data: Buffer.from(prep.instruction.data, "base64"),
          keys: prep.instruction.keys.map((k) => ({
            pubkey: new PublicKey(k.pubkey),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
        });

        const connection = makeConnection();
        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash("confirmed");
        const tx = new Transaction({
          feePayer: publicKey,
          blockhash,
          lastValidBlockHeight,
        }).add(ix);

        const signed = await signTransaction(tx);
        const signature = await connection.sendRawTransaction(
          signed.serialize(),
          { skipPreflight: false, preflightCommitment: "confirmed" }
        );
        await connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          "confirmed"
        );
        setLastSig(signature);

        // Sync off-chain
        await fetch("/api/crypto/ax/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dealId,
            signature,
            axPda: prep.axPda || axPda,
            action,
          }),
        }).catch(() => null);

        if (action === "fund") {
          if (leg === 0) setLocalFundedA(true);
          if (leg === 1) setLocalFundedB(true);
          if (
            (leg === 0 && localFundedB) ||
            (leg === 1 && localFundedA) ||
            (leg === 0 && fundedB) ||
            (leg === 1 && fundedA)
          ) {
            setLocalBoth(true);
            setStatus("funded");
          } else {
            setStatus("created_unfunded");
          }
        } else if (action === "create") {
          setStatus("created_unfunded");
        } else if (action === "release") {
          setStatus("released");
        } else if (
          action === "cancel" ||
          action === "cancel_unfunded"
        ) {
          setStatus("cancelled");
        } else if (action === "open_dispute") {
          setStatus("disputed");
        }

        // Soft refresh so server props catch up
        if (typeof window !== "undefined") {
          setTimeout(() => window.location.reload(), 1200);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ax action failed.");
      } finally {
        setBusy(null);
      }
    },
    [
      publicKey,
      signTransaction,
      dealId,
      role,
      legA,
      legB,
      axPda,
      localFundedA,
      localFundedB,
      fundedA,
      fundedB,
    ]
  );

  const isBuyer = role === "buyer";
  const isSeller = role === "seller";
  const notCreated =
    !status || status === "not_created" || status === "unknown";
  const canCreate = isBuyer && notCreated;
  const canFundA =
    isBuyer &&
    (status === "created_unfunded" || status === "funded") &&
    !localFundedA;
  const canFundB =
    isSeller &&
    (status === "created_unfunded" || status === "funded") &&
    !localFundedB;
  const canRelease =
    localBoth &&
    (status === "funded" || status === "created_unfunded") &&
    (isBuyer || isSeller);
  const canCancelUnfunded =
    notCreated === false &&
    !localBoth &&
    (isBuyer || isSeller) &&
    status !== "cancelled" &&
    status !== "released";
  const canOpenDispute =
    (localFundedA || localFundedB) &&
    status !== "released" &&
    status !== "cancelled" &&
    (isBuyer || isSeller);
  const canReclaim =
    (status === "disputed" || status === "funded") &&
    (isBuyer || isSeller);

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold tracking-wide text-gray-900">
            Atomic exchange (Ax)
          </h3>
          <p className="text-xs text-gray-500">
            Status: <span className="font-medium">{status}</span>
            {axPda ? (
              <>
                {" · "}
                PDA{" "}
                <span className="font-mono text-[11px]">
                  {axPda.slice(0, 4)}…{axPda.slice(-4)}
                </span>
              </>
            ) : null}
          </p>
        </div>
        <TrustLayerWalletSelector />
      </div>

      {(legA || legB) && (
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          {legA && (
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="font-medium text-gray-700">
                Leg A (buyer funds)
              </div>
              <div>
                {legA.fundAmount || legA.amount || "—"} {legA.assetCode}
                {legA.feeBps != null ? ` · fee ${legA.feeBps} bps` : ""}
              </div>
              <div className="text-gray-500">
                {localFundedA ? "Funded" : "Unfunded"}
              </div>
            </div>
          )}
          {legB && (
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="font-medium text-gray-700">
                Leg B (seller funds)
              </div>
              <div>
                {legB.fundAmount || legB.amount || "—"} {legB.assetCode}
                {legB.feeBps != null ? ` · fee ${legB.feeBps} bps` : ""}
              </div>
              <div className="text-gray-500">
                {localFundedB ? "Funded" : "Unfunded"}
              </div>
            </div>
          )}
        </div>
      )}

      {!connected && (
        <p className="text-sm text-amber-700">
          Connect the wallet linked to your party role to act on-chain.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {canCreate && (
          <button
            type="button"
            disabled={!!busy || !connected}
            onClick={() => run("create")}
            className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy === "create" ? "Creating…" : "Create Ax on-chain"}
          </button>
        )}
        {canFundA && (
          <button
            type="button"
            disabled={!!busy || !connected}
            onClick={() => run("fund", 0)}
            className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy === "fund" ? "Funding…" : `Fund leg A (${legA?.assetCode || "A"})`}
          </button>
        )}
        {canFundB && (
          <button
            type="button"
            disabled={!!busy || !connected}
            onClick={() => run("fund", 1)}
            className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy === "fund" ? "Funding…" : `Fund leg B (${legB?.assetCode || "B"})`}
          </button>
        )}
        {canRelease && (
          <button
            type="button"
            disabled={!!busy || !connected}
            onClick={() => run("release")}
            className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy === "release" ? "Releasing…" : "Release (swap)"}
          </button>
        )}
        {canCancelUnfunded && (
          <button
            type="button"
            disabled={!!busy || !connected}
            onClick={() => run("cancel_unfunded")}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 disabled:opacity-50"
          >
            {busy === "cancel_unfunded" ? "Cancelling…" : "Cancel unfunded"}
          </button>
        )}
        {canOpenDispute && (
          <button
            type="button"
            disabled={!!busy || !connected}
            onClick={() => run("open_dispute")}
            className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 disabled:opacity-50"
          >
            {busy === "open_dispute" ? "Opening…" : "Open dispute"}
          </button>
        )}
        {canReclaim && (
          <button
            type="button"
            disabled={!!busy || !connected}
            onClick={() =>
              run("reclaim", isBuyer ? 0 : 1)
            }
            className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-800 disabled:opacity-50"
          >
            {busy === "reclaim" ? "Reclaiming…" : "Reclaim my leg (after 7 days)"}
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {lastSig && (
        <p className="break-all font-mono text-[11px] text-gray-500">
          tx: {lastSig}
        </p>
      )}
      {dealStatus === "disputed" && (
        <p className="text-xs text-amber-800">
          Deal is disputed. After 7 days from dispute open, a funded party may
          reclaim their own leg on-chain. Admin can release or refund while
          status is Disputed (before or after the 7-day window).
        </p>
      )}
    </div>
  );
}

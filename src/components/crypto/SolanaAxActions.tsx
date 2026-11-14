"use client";

/**
 * Fungible Ax (2-leg) actions.
 * - focusAction "all" (deal page): cancel / dispute / reclaim only — no Create/Fund
 * - focusAction create|fund|release (session page): single-purpose CTAs
 * - Release only when canRelease (authority)
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

type AxAction =
  | "create"
  | "fund"
  | "release"
  | "cancel"
  | "reclaim"
  | "open_dispute"
  | "cancel_unfunded";

const AX_DISPUTE_STALE_SECONDS = 7 * 24 * 60 * 60;

type Props = {
  dealId: string;
  role: "buyer" | "seller" | "observer";
  onchainStatus?: string | null;
  dealStatus?: string | null;
  fundedA?: boolean;
  fundedB?: boolean;
  chainDealId?: string | null;
  axPda?: string | null;
  legA?: { assetCode: string; amount: string };
  legB?: { assetCode: string; amount: string };
  onStatusChange?: () => void;
  canRelease?: boolean;
  /** all = deal page chrome; create|fund|release = session page */
  focusAction?: "create" | "fund" | "release" | "authority" | "all";
  /** When focusAction=fund, which leg (0=A, 1=B) */
  focusLeg?: 0 | 1;
};

function ixFromPrepared(p: {
  programId: string;
  data: string;
  keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(p.programId),
    data: Buffer.from(p.data, "base64"),
    keys: p.keys.map((k) => ({
      pubkey: new PublicKey(k.pubkey),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })),
  });
}

export default function SolanaAxActions({
  dealId,
  role,
  onchainStatus,
  dealStatus = null,
  fundedA = false,
  fundedB = false,
  chainDealId: chainDealIdProp,
  legA,
  legB,
  onStatusChange,
  canRelease = false,
  focusAction = "all",
  focusLeg = 0,
}: Props) {
  const router = useRouter();
  const { connection } = useConnection();
  const wallet = useWallet();
  const { setVisible } = useWalletModal();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [chainDealId, setChainDealId] = useState<string | null>(
    chainDealIdProp || null
  );

  const status = (onchainStatus || "not_created").toLowerCase();
  const bothFunded = fundedA && fundedB;
  const created =
    status !== "not_created" &&
    status !== "cancelled" &&
    status !== "released" &&
    status !== "refunded";
  const session = focusAction !== "all";

  const run = useCallback(
    async (action: AxAction, leg?: 0 | 1) => {
      setMsg(null);
      setBusy(action === "fund" ? `fund:${leg ?? 0}` : action);
      try {
        if (!wallet.publicKey || !wallet.signTransaction) {
          setVisible(true);
          throw new Error("Connect a Solana wallet first.");
        }

        const body: Record<string, unknown> = {
          dealId,
          action,
          leg: leg ?? 0,
          signerWallet: wallet.publicKey.toBase58(),
        };
        if (chainDealId) body.chainDealId = chainDealId;
        if (action === "create" && legA && legB) {
          body.legA = legA;
          body.legB = legB;
        }

        const prepRes = await fetch("/api/crypto/ax/prepare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const prep = await prepRes.json();
        if (!prepRes.ok) {
          throw new Error(prep.error || "Prepare failed");
        }
        if (prep.chainDealId) setChainDealId(String(prep.chainDealId));

        // Already done on-chain (PDA closed / leg funded) — sync UI, do not re-send
        if (
          prep.alreadyReleased ||
          prep.alreadyCancelled ||
          prep.alreadyTerminal ||
          prep.alreadyFunded ||
          prep.alreadyCreated
        ) {
          setMsg(
            String(
              prep.message ||
                (prep.alreadyReleased
                  ? "Already released on-chain. Deal completed."
                  : prep.alreadyCancelled
                    ? "Already cancelled on-chain."
                    : prep.alreadyFunded
                      ? "This leg is already funded on-chain."
                      : "Already completed on-chain.")
            )
          );
          onStatusChange?.();
          router.refresh();
          if (session) {
            window.location.href = `/deals/${dealId}`;
          }
          return;
        }

        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash("confirmed");
        const tx = new Transaction();
        tx.recentBlockhash = blockhash;
        tx.feePayer = wallet.publicKey;

        // Pre-create destination / fee ATAs so ReleaseAx balance math is clean
        if (Array.isArray(prep.ensureAtas) && prep.ensureAtas.length) {
          const { createAssociatedTokenAccountIdempotentInstruction } =
            await import("@solana/spl-token");
          for (const ataStr of prep.ensureAtas as string[]) {
            try {
              const ata = new PublicKey(ataStr);
              const info = await connection.getAccountInfo(ata, "confirmed");
              if (info) continue;
              // Need mint + owner — prepare should pass ensureAtaMetas when possible.
              // Skip if we only have address; program create_idempotent remains fallback.
            } catch {
              /* ignore */
            }
          }
        }

        const ix = ixFromPrepared(prep.instruction);
        tx.add(ix);

        const signed = await wallet.signTransaction(tx);
        const sig = await connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        });
        await connection.confirmTransaction(
          { signature: sig, blockhash, lastValidBlockHeight },
          "confirmed"
        );

        const recRes = await fetch("/api/crypto/ax/record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dealId,
            action,
            signature: sig,
            leg: leg ?? 0,
            chainDealId: prep.chainDealId || chainDealId,
            // Required for custom authority (no TL login / unlinked wallet)
            signerWallet: wallet.publicKey.toBase58(),
          }),
        });
        const rec = await recRes.json();
        if (!recRes.ok) {
          throw new Error(rec.error || "Record failed");
        }

        setMsg(`${action} confirmed: ${sig.slice(0, 16)}…`);
        onStatusChange?.();
        router.refresh();
        if (session) {
          window.location.href = `/deals/${dealId}`;
        }
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Action failed");
      } finally {
        setBusy(null);
      }
    },
    [
      wallet,
      connection,
      dealId,
      chainDealId,
      legA,
      legB,
      onStatusChange,
      router,
      session,
      setVisible,
    ]
  );

  const btn =
    "rounded-lg border border-teal-500 bg-transparent px-4 py-2 text-sm font-medium text-teal-700 disabled:opacity-50";
  const btnOutline =
    "rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50";

  const showCreate =
    focusAction === "create" &&
    role === "buyer" &&
    !created &&
    status === "not_created";

  const showFundA =
    focusAction === "fund" &&
    focusLeg === 0 &&
    role === "buyer" &&
    created &&
    !fundedA &&
    !bothFunded;

  const showFundB =
    focusAction === "fund" &&
    focusLeg === 1 &&
    role === "seller" &&
    created &&
    !fundedB &&
    !bothFunded;

  const showRelease =
    (focusAction === "release" ||
      focusAction === "authority" ||
      (focusAction === "all" && canRelease)) &&
    bothFunded &&
    (status === "funded" || status === "disputed") &&
    canRelease;

  const showAuthorityCancel =
    (focusAction === "release" ||
      focusAction === "authority" ||
      (focusAction === "all" && canRelease)) &&
    bothFunded &&
    status === "funded" &&
    canRelease;

  // Deal page (all): cancel / dispute / reclaim only
  const showCancelUnfunded =
    (focusAction === "all" || session) &&
    created &&
    !fundedA &&
    !fundedB &&
    role !== "observer";

  const showReclaimA =
    focusAction === "all" &&
    role === "buyer" &&
    fundedA &&
    !bothFunded &&
    (status === "created_unfunded" || status === "funded" || status === "disputed");

  const showReclaimB =
    focusAction === "all" &&
    role === "seller" &&
    fundedB &&
    !bothFunded &&
    (status === "created_unfunded" || status === "funded" || status === "disputed");

  const showDispute =
    focusAction === "all" &&
    bothFunded &&
    status === "funded" &&
    role !== "observer";

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">Atomic exchange (Ax)</p>
          {chainDealId && (
            <p className="font-mono text-xs text-gray-500">
              chain_deal_id: {chainDealId}
            </p>
          )}
        </div>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
          {status}
          {(fundedA || fundedB) &&
            ` · A:${fundedA ? "✓" : "–"} B:${fundedB ? "✓" : "–"}`}
        </span>
      </div>

      {(onchainStatus === "disputed" || dealStatus === "disputed") && (
        <p className="mb-1 w-full rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          Disputed. Funded parties can reclaim their own leg after{" "}
          {Math.floor(AX_DISPUTE_STALE_SECONDS / 86400)} days. Admin may
          release or refund while Disputed.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {showCreate && (
          <button
            type="button"
            className={btn}
            disabled={!!busy}
            onClick={() => run("create")}
          >
            {busy === "create" ? "Creating…" : "Create Ax on-chain"}
          </button>
        )}

        {showFundA && (
          <button
            type="button"
            className={btn}
            disabled={!!busy}
            onClick={() => run("fund", 0)}
          >
            {busy === "fund:0" ? "Funding…" : "Fund your leg (A)"}
          </button>
        )}

        {showFundB && (
          <button
            type="button"
            className={btn}
            disabled={!!busy}
            onClick={() => run("fund", 1)}
          >
            {busy === "fund:1" ? "Funding…" : "Fund your leg (B)"}
          </button>
        )}

        {showRelease && (
          <button
            type="button"
            className={btn}
            disabled={!!busy}
            onClick={() => run("release")}
          >
            {busy === "release"
              ? "Releasing…"
              : "Release (atomic swap) · authority"}
          </button>
        )}

        {showAuthorityCancel && (
          <button
            type="button"
            className={btnOutline}
            disabled={!!busy}
            onClick={() => {
              if (
                typeof window !== "undefined" &&
                !window.confirm(
                  "Cancel Ax and return both legs? This does not complete the exchange."
                )
              ) {
                return;
              }
              void run("cancel");
            }}
          >
            {busy === "cancel" ? "Cancelling…" : "Cancel Ax (return both legs)"}
          </button>
        )}

        {showCancelUnfunded && (
          <button
            type="button"
            className={btnOutline}
            disabled={!!busy}
            onClick={() => run("cancel_unfunded")}
          >
            {busy === "cancel_unfunded" ? "Cancelling…" : "Cancel unfunded"}
          </button>
        )}

        {showReclaimA && (
          <button
            type="button"
            className={btnOutline}
            disabled={!!busy}
            onClick={() => run("reclaim", 0)}
          >
            {busy === "reclaim" ? "Reclaiming…" : "Reclaim leg A"}
          </button>
        )}

        {showReclaimB && (
          <button
            type="button"
            className={btnOutline}
            disabled={!!busy}
            onClick={() => run("reclaim", 1)}
          >
            {busy === "reclaim" ? "Reclaiming…" : "Reclaim leg B"}
          </button>
        )}

        {showDispute && (
          <button
            type="button"
            className={btnOutline}
            disabled={!!busy}
            onClick={() => run("open_dispute")}
          >
            Open dispute
          </button>
        )}
      </div>

      {focusAction === "create" && role !== "buyer" && (
        <p className="text-xs text-gray-500">
          Only the initiator (buyer / leg A) can create the on-chain Ax.
        </p>
      )}
      {focusAction === "fund" && !showFundA && !showFundB && (
        <p className="text-xs text-gray-500">
          {status === "not_created"
            ? "Ax is not created on-chain yet. Initiator must create first."
            : fundedA && focusLeg === 0
              ? "Leg A is already funded."
              : fundedB && focusLeg === 1
                ? "Leg B is already funded."
                : role === "buyer" && focusLeg === 1
                  ? "Leg B is funded by the seller."
                  : role === "seller" && focusLeg === 0
                    ? "Leg A is funded by the buyer."
                    : "Nothing to fund for this session."}
        </p>
      )}

      {msg && (
        <p
          className={`text-sm ${
            msg.toLowerCase().includes("fail") ||
            msg.toLowerCase().includes("error")
              ? "text-red-600"
              : "text-gray-700"
          }`}
        >
          {msg}
        </p>
      )}
    </div>
  );
}

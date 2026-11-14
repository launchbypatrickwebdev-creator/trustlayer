"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const SHARED = [
  [
    "descriptionMatches",
    "The description matches what will be delivered / exchanged.",
  ],
  [
    "amountAssetCorrect",
    "Amounts, assets, and (if NFT) USD valuations are correct.",
  ],
  [
    "fundsMoveRulesUnderstood",
    "Funds only move by Release / Cancel / Admin after dispute.",
  ],
  [
    "evidenceMatches",
    "I reviewed the other party’s evidence and it matches the agreement.",
  ],
] as const;

const AX_EXTRA = [
  [
    "bothLegsMustFund",
    "I understand both legs must fund before the atomic swap can complete.",
  ],
] as const;

const NFT_EXTRA = [
  [
    "nftMintAndUsdOk",
    "Mint is the correct classic NFT (1/1); fee is paid in SOL from the USD valuation.",
  ],
] as const;

export default function InvitationResponse({
  dealId,
  isAx = false,
  hasNft = false,
}: {
  dealId: string;
  isAx?: boolean;
  hasNft?: boolean;
}) {
  const router = useRouter();
  const items = [
    ...SHARED,
    ...(isAx ? AX_EXTRA : []),
    ...(hasNft ? NFT_EXTRA : []),
  ] as const;

  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploadNote, setUploadNote] = useState("");
  const [walletLinked, setWalletLinked] = useState<boolean | null>(
    isAx ? null : true
  );
  const [walletChecking, setWalletChecking] = useState(!!isAx);

  const all = items.every(([k]) => checks[k]);
  const canAccept =
    all && (!isAx || walletLinked === true) && !walletChecking;

  useEffect(() => {
    if (!isAx) {
      setWalletLinked(true);
      setWalletChecking(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setWalletChecking(true);
      try {
        const res = await fetch("/api/wallets");
        const body = (await res.json().catch(() => ({}))) as {
          wallets?: Array<{ address?: string; is_active?: boolean }>;
        };
        if (cancelled) return;
        const list = body.wallets || [];
        const ok = list.some(
          (w) =>
            w.is_active !== false &&
            w.address &&
            String(w.address).trim().length >= 32
        );
        setWalletLinked(ok);
      } catch {
        if (!cancelled) setWalletLinked(false);
      } finally {
        if (!cancelled) setWalletChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAx]);

  async function recheckWallet() {
    setWalletChecking(true);
    try {
      const res = await fetch("/api/wallets");
      const body = (await res.json().catch(() => ({}))) as {
        wallets?: Array<{ address?: string; is_active?: boolean }>;
      };
      const list = body.wallets || [];
      setWalletLinked(
        list.some(
          (w) =>
            w.is_active !== false &&
            w.address &&
            String(w.address).trim().length >= 32
        )
      );
    } catch {
      setWalletLinked(false);
    } finally {
      setWalletChecking(false);
    }
  }

  async function uploadEvidence() {
    if (files.length === 0) return;
    setUploadNote("");
    for (let i = 0; i < Math.min(files.length, 3); i++) {
      const form = new FormData();
      form.append("file", files[i]);
      form.append("kind", "item");
      form.append("caption", `Counterparty evidence ${i + 1}`);
      form.append("sort_order", String(i));
      const res = await fetch(`/api/deals/${dealId}/attachments`, {
        method: "POST",
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || "Evidence upload failed.");
      }
    }
    setUploadNote(`${Math.min(files.length, 3)} photo(s) uploaded.`);
    setFiles([]);
    window.dispatchEvent(
      new CustomEvent("trustlayer:deal-updated", { detail: { dealId } })
    );
  }

  async function respond(action: "accept" | "decline") {
    setLoading(true);
    setError("");
    try {
      if (action === "accept" && !all) {
        throw new Error("Confirm every checklist item before accepting.");
      }
      if (action === "accept" && isAx && walletLinked !== true) {
        throw new Error(
          "Link a Solana wallet on your profile before accepting this atomic exchange."
        );
      }
      if (action === "accept" && files.length > 0) {
        await uploadEvidence();
      }
      const res = await fetch(`/api/deals/${dealId}/invitation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, counterpartyChecklist: checks }),
      });
      const body = await res.json();
      if (!res.ok)
        throw new Error(body.error || "Unable to respond to invitation.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to respond.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 space-y-4 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-4">
      {isAx && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-950">
          <p className="font-semibold">Atomic exchange (2-leg)</p>
          <p className="mt-1 text-xs leading-relaxed">
            You are the counterparty on a swap. After you accept,{" "}
            <strong>you fund your leg</strong> and the initiator funds theirs.
            The atomic swap completes only when <strong>both legs</strong> are
            funded. This is not a one-sided escrow deposit.
          </p>
        </div>
      )}

      {isAx && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            walletLinked
              ? "border-green-200 bg-green-50 text-green-900"
              : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
        >
          <p className="font-semibold">Solana wallet</p>
          {walletChecking ? (
            <p className="mt-1 text-xs">Checking linked wallets…</p>
          ) : walletLinked ? (
            <p className="mt-1 text-xs">
              Wallet linked on your profile. You can accept this exchange.
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs leading-relaxed">
                Link a Solana wallet on your TrustLayer profile before accepting.
                The initiator needs both party addresses to create the on-chain Ax
                settlement; then each of you funds your own leg.
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                <Link
                  href="/profile"
                  className="text-xs font-semibold underline"
                >
                  Open profile → link wallet
                </Link>
                <button
                  type="button"
                  className="text-xs font-medium underline"
                  onClick={() => recheckWallet()}
                >
                  I linked it — recheck
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div>
        <h3 className="font-semibold text-[var(--tl-ink)]">
          Your evidence (optional, max 3)
        </h3>
        <p className="mt-1 text-xs text-[var(--tl-muted)]">
          Upload clear photos of your side of the deal (item, NFT screen, or
          asset proof) before you accept. Visible to the other party and admin
          on dispute.
        </p>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="mt-3 block w-full text-sm"
          onChange={(e) =>
            setFiles(Array.from(e.target.files || []).slice(0, 3))
          }
        />
        {files.length > 0 && (
          <p className="mt-1 text-xs text-[var(--tl-muted)]">
            {files.length} file(s) ready — uploaded when you Accept (or use
            Upload now).
          </p>
        )}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={loading || files.length === 0}
            onClick={() =>
              uploadEvidence()
                .then(() => setError(""))
                .catch((e) =>
                  setError(e instanceof Error ? e.message : "Upload failed")
                )
            }
            className="rounded-lg border border-[var(--tl-line)] px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            Upload now
          </button>
          {uploadNote && (
            <span className="text-xs text-green-700">{uploadNote}</span>
          )}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-[var(--tl-ink)]">
          Review and accept
        </h3>
        <div className="mt-3 space-y-2">
          {items.map(([k, label]) => (
            <label key={k} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(checks[k])}
                onChange={(e) =>
                  setChecks({ ...checks, [k]: e.target.checked })
                }
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          disabled={loading || !canAccept}
          onClick={() => respond("accept")}
          className="rounded-lg bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Saving..." : "Accept deal"}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => respond("decline")}
          className="rounded-lg border px-4 py-3 text-sm font-medium"
        >
          Decline
        </button>
      </div>
    </div>
  );
}

"use client";

import TokenIcon from "@/components/TokenIcon";
import PageBackLink from "@/components/layout/PageBackLink";
import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import FeeModeSelector from "@/components/deals/FeeModeSelector";
import CounterpartyField, {
  type CounterpartyResolved,
} from "@/components/deals/CounterpartyField";
import {
  breakdownFee,
  breakdownAxLegFee,
  breakdownNftLegFee,
  AX_LEG_FEE_BPS,
  NFT_FEE_BPS,
  CANCEL_FEE_BPS,
  REFUND_FEE_BPS,
  FALLBACK_SOL_USD_RATE,
  type FeeMode,
} from "@/lib/domain/fee";

const DURATION_PRESETS = [
  { label: "1 minute", value: 60 },
  { label: "30 minutes", value: 1800 },
  { label: "1 hour", value: 3600 },
  { label: "6 hours", value: 21600 },
  { label: "12 hours", value: 43200 },
  { label: "1 day", value: 86400 },
  { label: "3 days", value: 259200 },
  { label: "7 days", value: 604800 },
  { label: "14 days", value: 1209600 },
  { label: "30 days", value: 2592000 },
  { label: "60 days", value: 5184000 },
  { label: "100 days", value: 8640000 },
];

type Asset = "SOL" | "USDC" | "USDT" | "EURC" | "PYUSD" | "USDS" | "FDUSD";
type EscrowType = "one_time" | "milestone";
type Rail = "crypto" | "fiat";
/** Crypto L1/L2 family (only solana live today). */
type CryptoChain = "solana" | "base" | "ethereum" | "other";
/** Fiat funding method (checkout not live). */
type FiatMethod = "bank" | "card" | "mobile_money";

/** Shared selected control style (Buyer/Seller + payment rail). */
const SELECTED_BTN =
  "border-[var(--tl-teal)] bg-[var(--tl-teal-soft)] ring-1 ring-[var(--tl-teal)]";
const IDLE_BTN = "border-[var(--tl-line)] hover:border-[var(--tl-muted)]";

interface MilestoneRow {
  amount: string;
  label: string;
}

const SETTLEMENT_BPS = 250; // 2.5% 1-leg fungible
const CANCEL_BPS = CANCEL_FEE_BPS; // 0.2%
const REFUND_BPS = REFUND_FEE_BPS; // 0.5% policy text

/** Sum decimal amount strings without float error (e.g. 0.0003 + 0.002 → 0.0055). */
function sumDecimalStrings(values: string[]): string {
  const scale = 12;
  let total = 0n;
  for (const raw of values) {
    const v = (raw || "").trim();
    if (!v || !/^\d+(\.\d+)?$/.test(v)) continue;
    const [whole, frac = ""] = v.split(".");
    const padded = (frac + "0".repeat(scale)).slice(0, scale);
    total += BigInt(whole + padded);
  }
  const neg = total < 0n;
  const abs = neg ? -total : total;
  const s = abs.toString().padStart(scale + 1, "0");
  const w = s.slice(0, -scale).replace(/^0+(?=\d)/, "") || "0";
  const f = s.slice(-scale).replace(/0+$/, "");
  const out = f ? `${w}.${f}` : w;
  return neg ? `-${out}` : out;
}

export default function NewDealPage() {
  const router = useRouter();
  const [initiatedBy, setInitiatedBy] = useState<"buyer" | "seller">("buyer");
  const [rail, setRail] = useState<Rail>("crypto");
  const [cryptoChain, setCryptoChain] = useState<CryptoChain>("solana");
  const [fiatMethod, setFiatMethod] = useState<FiatMethod>("bank");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [assetCode, setAssetCode] = useState<Asset>("SOL");
  /** 1-leg classic NFT: mint + USD valuation (fee paid in SOL). */
  const [oneLegNftMint, setOneLegNftMint] = useState("");
  const [oneLegNftValuation, setOneLegNftValuation] = useState(""); // USD
  const [solUsdRate, setSolUsdRate] = useState<number>(FALLBACK_SOL_USD_RATE);
  const [fiatCurrency, setFiatCurrency] = useState("NGN");
  const [escrowType, setEscrowType] = useState<EscrowType>("one_time");
  /** one_leg = solana_escrow; ax = solana_ax (2-leg fungible) */
  const [settlementKind, setSettlementKind] = useState<"one_leg" | "ax">(
    "one_leg"
  );
  const [releaseAuthorityMode, setReleaseAuthorityMode] = useState<"admin" | "custom">("admin");
  const [releaseAuthorityPubkey, setReleaseAuthorityPubkey] = useState("");
  const [axLegACode, setAxLegACode] = useState("SOL");
  const [axLegAAmount, setAxLegAAmount] = useState("");
  const [axLegAMint, setAxLegAMint] = useState("");
  const [axLegAValuation, setAxLegAValuation] = useState("");
  const [axLegBCode, setAxLegBCode] = useState("USDC");
  const [axLegBAmount, setAxLegBAmount] = useState("");
  const [axLegBMint, setAxLegBMint] = useState("");
  const [axLegBValuation, setAxLegBValuation] = useState("");
  const [milestones, setMilestones] = useState<MilestoneRow[]>([
    { amount: "", label: "Milestone 1" },
    { amount: "", label: "Milestone 2" },
  ]);
  const [counterpartyUserId, setCounterpartyUserId] = useState("");
  const [counterpartyMeta, setCounterpartyMeta] =
    useState<CounterpartyResolved | null>(null);
  const [feeMode, setFeeMode] = useState<FeeMode>("on_top");
  const [durationMode, setDurationMode] = useState<"preset" | "custom">(
    "preset"
  );
  const [duration, setDuration] = useState("3600");
  const [customMinutes, setCustomMinutes] = useState("60");
  const [conditionType, setConditionType] = useState("new");
  const [serialOrRef, setSerialOrRef] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("courier");
  const [checklist, setChecklist] = useState({
    descriptionMatches: false,
    amountAssetCorrect: false,
    fundsMoveRulesUnderstood: false,
    photosAreActualItem: false,
    bothLegsMustFund: false,
    nftMintAndUsdOk: false,
  });
  const [images, setImages] = useState<File[]>([]);
  const [captions, setCaptions] = useState<string[]>(["", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [eligibility, setEligibility] = useState<{
    verificationLevel: number;
    singleDealLimit: string | null;
    openExposureLimit: string | null;
    openExposure: string;
  } | null>(null);

  const displayCurrency =
    rail === "crypto"
      ? settlementKind === "ax"
        ? axLegACode
        : assetCode
      : fiatCurrency.toUpperCase();

  const baseAmountStr = useMemo(() => {
    if (rail === "crypto" && settlementKind === "ax") {
      const a = (axLegAAmount || "").trim();
      return /^\d+(\.\d+)?$/.test(a) ? a : "0";
    }
    if (escrowType === "one_time") {
      const a = (amount || "").trim();
      return /^\d+(\.\d+)?$/.test(a) ? a : "0";
    }
    return sumDecimalStrings(milestones.map((m) => m.amount));
  }, [escrowType, amount, milestones, rail, settlementKind, axLegAAmount]);

  const isOneLegNft =
    rail === "crypto" &&
    settlementKind === "one_leg" &&
    String(assetCode).toUpperCase() === "NFT";

  /** Fee display unit: NFT legs always pay platform fee in SOL. */
  const feeUnit =
    isOneLegNft ||
    (settlementKind === "ax" &&
      (axLegACode === "NFT" || axLegBCode === "NFT"))
      ? "SOL"
      : displayCurrency;

  const feePreview = (() => {
    if (isOneLegNft) {
      const v = (oneLegNftValuation || "").trim();
      if (!/^\d+(\.\d+)?$/.test(v) || Number(v) <= 0) return null;
      try {
        const n = breakdownNftLegFee({
          valuationUsd: v,
          solUsdRate,
          feeBps: NFT_FEE_BPS,
        });
        return {
          feeMode: "on_top" as FeeMode,
          feeBps: SETTLEMENT_BPS,
          dealAmount: "1",
          platformFee: n.platformFeeSol,
          fundAmount: n.solLockAtFund, // 1.5× SOL at fund for NFT
          sellerReceives: "1",
          label: n.label,
          solLockAtFund: n.solLockAtFund,
          refundReserveSol: n.refundReserveSol,
          valuationSol: n.valuationSol,
        };
      } catch {
        return null;
      }
    }
    if (!(baseAmountStr && baseAmountStr !== "0")) return null;
    if (settlementKind === "ax") {
      // Fungible Ax leg-A preview only; NFT legs show SOL under each leg card
      if (axLegACode === "NFT") return null;
      return breakdownAxLegFee({
        amount: baseAmountStr,
        feeMode,
        feeBps: AX_LEG_FEE_BPS,
      });
    }
    return breakdownFee({
      amount: baseAmountStr,
      feeMode,
      feeBps: SETTLEMENT_BPS,
    });
  })();
  const axLegBFeePreview =
    settlementKind === "ax" &&
    axLegBAmount &&
    /^\d+(\.\d+)?$/.test(axLegBAmount.trim())
      ? breakdownAxLegFee({
          amount: axLegBAmount.trim(),
          feeMode,
          feeBps: AX_LEG_FEE_BPS,
        })
      : null;
  const baseAmountNum = Number(baseAmountStr) || 0;
  const settlementFee = feePreview
    ? Number(feePreview.platformFee)
    : (baseAmountNum *
        (settlementKind === "ax" ? AX_LEG_FEE_BPS : SETTLEMENT_BPS)) /
      10_000;
  const cancelFee = (baseAmountNum * CANCEL_BPS) / 10_000;
  const refundFee = (baseAmountNum * REFUND_BPS) / 10_000;
  const fundingRequired = feePreview
    ? Number(feePreview.fundAmount)
    : baseAmountNum + settlementFee;

  const durationSeconds = useMemo(() => {
    if (durationMode === "preset") return Number(duration);
    const mins = Number(customMinutes);
    if (!Number.isFinite(mins) || mins < 1) return 0;
    return Math.floor(mins * 60);
  }, [durationMode, duration, customMinutes]);

  const [deadlineLabel, setDeadlineLabel] = useState<string>("—");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/crypto/sol-usd-rate").then((x) =>
          x.ok ? x.json() : null
        );
        if (!cancelled && r?.rate && Number(r.rate) > 0) {
          setSolUsdRate(Number(r.rate));
        }
      } catch {
        /* keep fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (rail !== "fiat") {
      setEligibility(null);
      return;
    }
    fetch(
      `/api/compliance/eligibility?rail=fiat&currency=${encodeURIComponent(fiatCurrency)}`
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((body) => setEligibility(body.eligibility))
      .catch(() => setEligibility(null));
  }, [rail, fiatCurrency]);

  useEffect(() => {
    if (durationSeconds < 60) {
      setDeadlineLabel("—");
      return;
    }
    const d = new Date(Date.now() + durationSeconds * 1000);
    setDeadlineLabel(d.toLocaleString());
  }, [durationSeconds]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const isAxDeal = rail === "crypto" && settlementKind === "ax";
      if (isAxDeal && releaseAuthorityMode === "custom") {
        const pk = releaseAuthorityPubkey.trim();
        if (pk.length < 32 || pk.length > 64) {
          throw new Error("Enter a valid Solana pubkey for the custom settler, or choose TrustLayer admin.");
        }
      }
      const isNftDeal =
        (rail === "crypto" &&
          settlementKind === "one_leg" &&
          String(assetCode).toUpperCase() === "NFT") ||
        (isAxDeal && (axLegACode === "NFT" || axLegBCode === "NFT"));
      if (
        !checklist.descriptionMatches ||
        !checklist.amountAssetCorrect ||
        !checklist.fundsMoveRulesUnderstood ||
        !checklist.photosAreActualItem ||
        (isAxDeal && !checklist.bothLegsMustFund) ||
        (isNftDeal && !checklist.nftMintAndUsdOk)
      ) {
        throw new Error(
          "Confirm all checklist items before creating the deal."
        );
      }
      if (durationSeconds < 60) {
        throw new Error(
          "Agreed deadline must be at least 1 minute (program minimum)."
        );
      }
      if (rail === "crypto" && settlementKind === "ax") {
        for (const [label, code, amount, mint, val] of [
          ["Leg A", axLegACode, axLegAAmount, axLegAMint, axLegAValuation],
          ["Leg B", axLegBCode, axLegBAmount, axLegBMint, axLegBValuation],
        ] as const) {
          if (code === "PNFT" || code === "CNFT") {
            throw new Error(
              `${code} is not available yet. Use classic NFT or fungible assets.`
            );
          }
          if (code === "NFT") {
            if (!(mint || "").trim() || (mint || "").trim().length < 32) {
              throw new Error(`${label}: NFT mint address is required.`);
            }
            if (!(val || "").trim() || Number(val) <= 0) {
              throw new Error(
                `${label}: positive USD valuation is required for NFT (fee paid in SOL).`
              );
            }
          } else {
            const a = (amount || "").trim();
            if (!/^\d+(\.\d+)?$/.test(a) || Number(a) <= 0) {
              throw new Error(`${label} amount must be greater than zero.`);
            }
          }
        }
        if (
          axLegACode === axLegBCode &&
          axLegACode !== "SOL" &&
          axLegACode !== "NFT"
        ) {
          throw new Error("SPL legs must use different mints (e.g. USDC ↔ USDT).");
        }
      } else if (
        rail === "crypto" &&
        settlementKind === "one_leg" &&
        String(assetCode).toUpperCase() === "NFT"
      ) {
        if (!(oneLegNftMint || "").trim() || oneLegNftMint.trim().length < 32) {
          throw new Error("NFT mint address is required for classic NFT escrow.");
        }
        if (
          !(oneLegNftValuation || "").trim() ||
          Number(oneLegNftValuation) <= 0
        ) {
          throw new Error(
            "Positive USD valuation is required. Platform fee is paid in SOL (not NFT units)."
          );
        }
      } else if (
        !baseAmountStr ||
        baseAmountStr === "0" ||
        Number(baseAmountStr) <= 0
      ) {
        throw new Error("Amount must be greater than zero.");
      }
      if (
        !counterpartyUserId &&
        !(counterpartyMeta?.mode === "invite" &&
          (counterpartyMeta.username || counterpartyMeta.email))
      ) {
        throw new Error(
          "Lookup a counterparty (@username or email). Unregistered users get an invite link after create."
        );
      }

      const isAx = rail === "crypto" && settlementKind === "ax";
      const response = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          amount: isAx
            ? axLegAAmount.trim()
            : String(assetCode).toUpperCase() === "NFT"
              ? "1"
              : baseAmountStr,
          currency: displayCurrency,
          rail,
          chain: rail === "crypto" ? cryptoChain : null,
          settlementAdapter: isAx
            ? "solana_ax"
            : rail === "crypto"
              ? "solana_escrow"
              : "fiat",
          assetCode: isAx
            ? axLegACode
            : rail === "crypto"
              ? assetCode
              : null,
          origin:
            initiatedBy === "buyer" ? "buyer_created" : "seller_created",
          initiatedBy,
          counterpartyUserId,
          feeMode,
          inviteeEmail: counterpartyMeta?.email || null,
          inviteeUsername: counterpartyMeta?.username || null,
          durationSeconds,
          escrowType:
            rail === "crypto" && !isAx ? escrowType : "one_time",
          milestones:
            rail === "crypto" && !isAx && escrowType === "milestone"
              ? milestones.map((m, i) => ({
                  index: i,
                  amount: String(m.amount).trim(),
                  label: m.label,
                }))
              : null,
          conditionType,
          serialOrRef: serialOrRef || null,
          deliveryMethod,
          creatorChecklist: {
            ...checklist,
            releaseAuthorityMode,
            releaseAuthorityPubkey:
              releaseAuthorityMode === "custom"
                ? releaseAuthorityPubkey.trim()
                : "admin",
          },
          axLegA: isAx
            ? {
                assetCode: axLegACode,
                amount: axLegACode === "NFT" ? "1" : axLegAAmount.trim(),
                mint: axLegACode === "NFT" ? axLegAMint.trim() : null,
                valuationUsd:
                  axLegACode === "NFT" ? axLegAValuation.trim() : null,
                solUsdRate: axLegACode === "NFT" ? solUsdRate : null,
              }
            : null,
          axLegB: isAx
            ? {
                assetCode: axLegBCode,
                amount: axLegBCode === "NFT" ? "1" : axLegBAmount.trim(),
                mint: axLegBCode === "NFT" ? axLegBMint.trim() : null,
                valuationUsd:
                  axLegBCode === "NFT" ? axLegBValuation.trim() : null,
                solUsdRate: axLegBCode === "NFT" ? solUsdRate : null,
              }
            : null,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Unable to create deal.");
      }

      const dealId = result.deal.id as string;
      const invitationToken =
          (result as { invitation_token?: string }).invitation_token ||
          (result.deal as { invitation_token?: string | null })?.invitation_token ||
          null;
      const inviteRequired = Boolean(
        (result as { invite_required?: boolean }).invite_required ??
          (result.deal as { invite_required?: boolean })?.invite_required ??
          counterpartyMeta?.mode === "invite"
      );
      const counterpartyRegistered = Boolean(
        (result as { counterparty_registered?: boolean }).counterparty_registered ??
          (result.deal as { counterparty_registered?: boolean })
            ?.counterparty_registered ??
          counterpartyMeta?.mode === "registered"
      );

      for (let i = 0; i < Math.min(images.length, 3); i++) {
        const form = new FormData();
        form.append("file", images[i]);
        form.append("kind", "item");
        form.append("caption", captions[i] || "");
        form.append("sort_order", String(i));
        const upload = await fetch(`/api/deals/${dealId}/attachments`, {
          method: "POST",
          body: form,
        });
        const uploadBody = await upload.json().catch(() => ({}));
        if (!upload.ok) {
          throw new Error(
            uploadBody.error ||
              "Evidence upload failed. The invitation was not finalized."
          );
        }
      }

      const finalize = await fetch(`/api/deals/${dealId}/finalize`, {
        method: "POST",
      });
      const finalizedBody = await finalize.json().catch(() => ({}));
      if (!finalize.ok) {
        throw new Error(
          finalizedBody.error || "Unable to finalize the agreement."
        );
      }

      {
        if (inviteRequired && invitationToken) {
          const inviteUrl = `${window.location.origin}/login?invite=${encodeURIComponent(invitationToken)}`;
          try {
            await navigator.clipboard.writeText(inviteUrl);
          } catch {
            /* ignore */
          }
          window.alert(
            [
              "Deal created.",
              "",
              "Invite link copied (if allowed):",
              inviteUrl,
              "",
              "Share this with the counterparty so they can open TrustLayer and accept.",
            ].join("\n")
          );
        } else if (counterpartyRegistered) {
          window.alert(
            [
              "Deal created.",
              "",
              "Your counterparty is already on TrustLayer — they will see this deal under Deals and can Accept or Decline there. No invite link is required.",
            ].join("\n")
          );
        }
        router.push(`/deals/${dealId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create deal.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
      <PageBackLink href="/deals" label="Back to deals" />
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-medium text-gray-500">TrustLayer</p>
        <h1 className="mt-2 text-3xl font-bold">Create a deal</h1>
        <p className="mt-2 text-gray-600">
          Agreement first. Crypto money moves only by Release, Seller Cancel, or
          Admin after dispute. Fiat Coming Soon.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-6">
          <section className="rounded-2xl border border-[var(--tl-line)] bg-white p-6 shadow-sm">
            <h2 className="font-semibold">Who is initiating?</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {(["buyer", "seller"] as const).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setInitiatedBy(role)}
                  className={`rounded-lg border p-4 text-left ${
                    initiatedBy === role ? SELECTED_BTN : IDLE_BTN
                  }`}
                >
                  <strong className="capitalize">{role}</strong>
                </button>
              ))}
            </div>
          </section>

                    <section className="rounded-2xl border border-[var(--tl-line)] bg-white p-6 shadow-sm">
            <h2 className="font-semibold">Payment rail</h2>
            <p className="mt-1 text-xs text-[var(--tl-muted)]">
              Choose how value moves. Crypto or fiat first, then network or
              method, then settlement style.
            </p>

            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-[var(--tl-muted)]">
              1 · Rail
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { setRail("crypto"); setCryptoChain("solana"); }}
                className={`rounded-xl border p-4 text-left transition ${
                  rail === "crypto" ? SELECTED_BTN : IDLE_BTN
                }`}
              >
                <strong>Crypto</strong>
                <p className="mt-1 text-xs text-[var(--tl-muted)]">
                  On-chain escrow &amp; atomic exchange
                </p>
              </button>
              <button
                type="button"
                onClick={() => setRail("fiat")}
                className={`rounded-xl border p-4 text-left transition ${
                  rail === "fiat" ? SELECTED_BTN : IDLE_BTN
                }`}
              >
                <strong>Fiat</strong>
                <p className="mt-1 text-xs text-[var(--tl-muted)]">
                  Bank / card checkout (coming soon)
                </p>
              </button>
            </div>

            {rail === "crypto" && (
              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--tl-muted)]">
                  2 · Chain
                </p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div
                    className={`rounded-xl border p-4 text-left transition ${SELECTED_BTN}`}
                  >
                    <strong>Solana</strong>
                    <p className="mt-1 text-xs text-[var(--tl-muted)]">
                      Live · SOL, SPL & classic NFT. Settlements stays on Solana.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {rail === "fiat" && (
              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--tl-muted)]">
                  2 · Method
                </p>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <button
                    type="button"
                    disabled
                    className="cursor-not-allowed rounded-xl border border-[var(--tl-line)] p-3 text-left text-sm opacity-50"
                  >
                    <strong>Bank transfer</strong>
                    <p className="mt-1 text-xs text-[var(--tl-muted)]">
                      NGN · planned
                    </p>
                  </button>
                  <button
                    type="button"
                    disabled
                    className="cursor-not-allowed rounded-xl border border-[var(--tl-line)] p-3 text-left text-sm opacity-50"
                  >
                    <strong>Card</strong>
                    <p className="mt-1 text-xs text-[var(--tl-muted)]">
                      Coming soon
                    </p>
                  </button>
                  <button
                    type="button"
                    disabled
                    className="cursor-not-allowed rounded-xl border border-[var(--tl-line)] p-3 text-left text-sm opacity-50"
                  >
                    <strong>Mobile money</strong>
                    <p className="mt-1 text-xs text-[var(--tl-muted)]">
                      Coming soon
                    </p>
                  </button>
                </div>
                <p className="mt-3 text-xs text-[var(--tl-muted)]">
                  Fiat checkout is not live yet. You can still draft the deal
                  for eligibility checks.
                </p>
              </div>
            )}

            {rail === "crypto" && cryptoChain === "solana" && (
              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--tl-muted)]">
                  3 · Settlement on Solana
                </p>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setSettlementKind("one_leg")}
                    className={`rounded-xl border p-4 text-left text-sm transition ${
                      settlementKind === "one_leg" ? SELECTED_BTN : IDLE_BTN
                    }`}
                  >
                    <strong>Escrow</strong>
                    <p className="mt-1 text-xs text-[var(--tl-muted)]">
                      One-leg: Buyer locks, Seller delivers off-chain.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSettlementKind("ax");
                      setEscrowType("one_time");
                    }}
                    className={`rounded-xl border p-4 text-left text-sm transition ${
                      settlementKind === "ax" ? SELECTED_BTN : IDLE_BTN
                    }`}
                  >
                    <strong>Atomic exchange (Ax)</strong>
                    <p className="mt-1 text-xs text-[var(--tl-muted)]">
                      Two legs: Buyer ↔ Seller locks.
                      Both fund, then swap.
                    </p>
                  </button>
                </div>
              </div>
            )}

            <p className="mt-5 rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] px-3 py-2 text-xs text-[var(--tl-muted)]">
              Selected:{" "}
              <span className="font-medium text-[var(--tl-ink)]">
                {rail === "crypto"
                  ? `Crypto → ${
                      cryptoChain === "solana" ? "Solana" : cryptoChain
                    } → ${
                      settlementKind === "ax" ? "Atomic exchange" : "Escrow"
                    }`
                  : `Fiat → ${
                      fiatMethod === "bank"
                        ? "Bank"
                        : fiatMethod === "card"
                          ? "Card"
                          : "Mobile money"
                    }`}
              </span>
            </p>
          </section>

          {rail === "fiat" && eligibility && (
            <section className="tl-card p-5">
              <div className="flex items-start gap-3">
                <div className="tl-icon">
                  <ShieldCheck size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="tl-eyebrow">Eligibility</p>
                      <h2 className="mt-1 font-bold">NGN deal capacity</h2>
                    </div>
                    <span className="tl-badge bg-[var(--tl-teal-soft)] text-[var(--tl-teal)]">
                      Level {eligibility.verificationLevel}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <Mini
                      label="Single deal"
                      value={`₦${Number(eligibility.singleDealLimit || 0).toLocaleString("en-NG")}`}
                    />
                    <Mini
                      label="Open exposure"
                      value={`₦${Number(eligibility.openExposureLimit || 0).toLocaleString("en-NG")}`}
                    />
                    <Mini
                      label="Current"
                      value={`₦${Number(eligibility.openExposure || 0).toLocaleString("en-NG")}`}
                    />
                  </div>
                  <p className="mt-3 text-xs leading-5 text-[var(--tl-muted)]">
                    If this deal exceeds your current TrustLayer limit, the
                    server will stop agreement creation and tell you which
                    verification step is needed.
                  </p>
                </div>
              </div>
            </section>
          )}

          <section className="space-y-4 rounded-2xl border border-[var(--tl-line)] bg-white p-6 shadow-sm">
            <h2 className="font-semibold">Agreement</h2>
            <input
              required
              className="w-full rounded-lg border px-3 py-2"
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="w-full rounded-lg border px-3 py-2"
              rows={3}
              placeholder="Description of goods/service"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            {rail === "crypto" && settlementKind === "ax" ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Buyer locks leg A; seller locks leg B. Both must fund before
                  release. Fee is 1.25% per leg (2.5% round-trip).
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-gray-200 p-3">
                    <label className="text-sm font-medium">
                      Leg A — buyer pays
                    </label>
                    <div className="mt-2 flex items-center gap-2">
                      <TokenIcon code={axLegACode} size={22} />
                      <select
                        className="w-full rounded-lg border px-3 py-2"
                        value={axLegACode}
                        onChange={(e) => setAxLegACode(e.target.value)}
                      >
                        <option value="SOL">SOL</option>
                        <option value="USDC">USDC</option>
                        <option value="USDT">USDT</option>
                        <option value="EURC">EURC</option>
                        <option value="PYUSD">PYUSD</option>
                        <option value="USDS">USDS</option>
                        <option value="FDUSD">FDUSD</option>
                        <option value="NFT">NFT (classic Token)</option>
                        <option value="PNFT" disabled>
                          pNFT — unavailable
                        </option>
                        <option value="CNFT" disabled>
                          cNFT — unavailable
                        </option>
                      </select>
                    </div>
                    {axLegACode === "NFT" ? (
                      <>
                        <input
                          className="mt-2 w-full rounded-lg border px-3 py-2 font-mono text-sm"
                          placeholder="NFT mint address"
                          value={axLegAMint}
                          onChange={(e) => setAxLegAMint(e.target.value)}
                        />
                        <input
                          className="mt-2 w-full rounded-lg border px-3 py-2"
                          placeholder="Valuation in USD (e.g. 500)"
                          value={axLegAValuation}
                          onChange={(e) => setAxLegAValuation(e.target.value)}
                          inputMode="decimal"
                        />
                        {axLegAValuation &&
                          /^\d+(\.\d+)?$/.test(axLegAValuation.trim()) &&
                          Number(axLegAValuation) > 0 && (
                            <p className="mt-1 text-xs text-gray-500">
                              {(() => {
                                try {
                                  const n = breakdownNftLegFee({
                                    valuationUsd: axLegAValuation.trim(),
                                    solUsdRate,
                                    feeBps: NFT_FEE_BPS,
                                  });
                                  return `Val $${n.valuationUsd} · fee ${n.platformFeeSol} SOL (${n.feeBps/100}%) · lock ${n.solLockAtFund} SOL (1.5×) · reserve ${n.refundReserveSol} SOL on release`;
                                } catch {
                                  return null;
                                }
                              })()}
                            </p>
                          )}
                      </>
                    ) : (
                      <>
                        <input
                          className="mt-2 w-full rounded-lg border px-3 py-2"
                          placeholder="Amount"
                          value={axLegAAmount}
                          onChange={(e) => setAxLegAAmount(e.target.value)}
                          inputMode="decimal"
                        />
                        {feePreview && axLegACode !== "NFT" && (
                          <p className="mt-1 text-xs text-gray-500">
                            Fee {feePreview.platformFee} {axLegACode} · fund{" "}
                            {feePreview.fundAmount} {axLegACode}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  <div className="rounded-xl border border-gray-200 p-3">
                    <label className="text-sm font-medium">
                      Leg B — seller pays
                    </label>
                    <div className="mt-2 flex items-center gap-2">
                      <TokenIcon code={axLegBCode} size={22} />
                      <select
                        className="w-full rounded-lg border px-3 py-2"
                        value={axLegBCode}
                        onChange={(e) => setAxLegBCode(e.target.value)}
                      >
                        <option value="SOL">SOL</option>
                        <option value="USDC">USDC</option>
                        <option value="USDT">USDT</option>
                        <option value="EURC">EURC</option>
                        <option value="PYUSD">PYUSD</option>
                        <option value="USDS">USDS</option>
                        <option value="FDUSD">FDUSD</option>
                        <option value="NFT">NFT (classic Token)</option>
                        <option value="PNFT" disabled>
                          pNFT — unavailable
                        </option>
                        <option value="CNFT" disabled>
                          cNFT — unavailable
                        </option>
                      </select>
                    </div>
                    {axLegBCode === "NFT" ? (
                      <>
                        <input
                          className="mt-2 w-full rounded-lg border px-3 py-2 font-mono text-sm"
                          placeholder="NFT mint address"
                          value={axLegBMint}
                          onChange={(e) => setAxLegBMint(e.target.value)}
                        />
                        <input
                          className="mt-2 w-full rounded-lg border px-3 py-2"
                          placeholder="Valuation in USD (e.g. 500)"
                          value={axLegBValuation}
                          onChange={(e) => setAxLegBValuation(e.target.value)}
                          inputMode="decimal"
                        />
                        {axLegBValuation &&
                          /^\d+(\.\d+)?$/.test(axLegBValuation.trim()) &&
                          Number(axLegBValuation) > 0 && (
                            <p className="mt-1 text-xs text-gray-500">
                              {(() => {
                                try {
                                  const n = breakdownNftLegFee({
                                    valuationUsd: axLegBValuation.trim(),
                                    solUsdRate,
                                    feeBps: NFT_FEE_BPS,
                                  });
                                  return `Val $${n.valuationUsd} · fee ${n.platformFeeSol} SOL (${n.feeBps/100}%) · lock ${n.solLockAtFund} SOL (1.5×) · reserve ${n.refundReserveSol} SOL on release`;
                                } catch {
                                  return null;
                                }
                              })()}
                            </p>
                          )}
                      </>
                    ) : (
                      <>
                        <input
                          className="mt-2 w-full rounded-lg border px-3 py-2"
                          placeholder="Amount"
                          value={axLegBAmount}
                          onChange={(e) => setAxLegBAmount(e.target.value)}
                          inputMode="decimal"
                        />
                        {axLegBFeePreview && (
                          <p className="mt-1 text-xs text-gray-500">
                            Fee {axLegBFeePreview.platformFee} {axLegBCode} · fund{" "}
                            {axLegBFeePreview.fundAmount} {axLegBCode}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-gray-200 p-4">
                  <p className="text-sm font-medium">Who can settle (release / cancel Ax)</p>
                  <p className="text-xs text-gray-500">
                    After both legs are funded, only this authority can complete the
                    atomic swap or cancel and return both legs. Parties can still open a dispute.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setReleaseAuthorityMode("admin")}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        releaseAuthorityMode === "admin" ? SELECTED_BTN : IDLE_BTN
                      }`}
                    >
                      TrustLayer admin
                    </button>
                    <button
                      type="button"
                      onClick={() => setReleaseAuthorityMode("custom")}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        releaseAuthorityMode === "custom" ? SELECTED_BTN : IDLE_BTN
                      }`}
                    >
                      Custom authority
                    </button>
                  </div>
                  {releaseAuthorityMode === "custom" && (
                    <input
                      className="w-full rounded-lg border px-3 py-2 font-mono text-sm"
                      placeholder="Solana pubkey (authority wallet)"
                      value={releaseAuthorityPubkey}
                      onChange={(e) => setReleaseAuthorityPubkey(e.target.value.trim())}
                    />
                  )}
                  {releaseAuthorityMode === "admin" && (
                    <p className="text-xs text-gray-500">
                      Default: platform admin wallet signs release or cancel.
                    </p>
                  )}
                </div>
              </div>
            ) : rail === "crypto" ? (
              <div>
                <label className="text-sm font-medium">Asset</label>
                <div className="mt-1 flex items-center gap-2">
                  <TokenIcon code={assetCode} size={22} />
                  <select
                    className="w-full rounded-lg border px-3 py-2"
                    value={assetCode}
                    onChange={(e) => setAssetCode(e.target.value as Asset)}
                  >
                    <option value="SOL">SOL</option>
                    <option value="USDC">USDC</option>
                    <option value="USDT">USDT</option>
                    <option value="EURC">EURC</option>
                    <option value="PYUSD">PYUSD</option>
                    <option value="USDS">USDS</option>
                    <option value="FDUSD">FDUSD</option>
                    <option value="NFT">NFT (classic Token)</option>
                    <option value="PNFT" disabled>
                      pNFT — unavailable
                    </option>
                    <option value="CNFT" disabled>
                      cNFT — unavailable
                    </option>
                  </select>
                </div>
                {String(assetCode).toUpperCase() === "NFT" && (
                  <div className="mt-3 space-y-2 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] p-3">
                    <p className="text-xs text-[var(--tl-muted)]">
                      Classic NFT (1/1). Price the NFT in USD. Platform fee is
                      2% of that USD value, paid in SOL at the snapshot rate.
                      Fund locks 1.5× the SOL fee; reserve returns on release.
                    </p>
                    <input
                      className="w-full rounded-lg border px-3 py-2 font-mono text-sm"
                      placeholder="NFT mint address"
                      value={oneLegNftMint}
                      onChange={(e) => setOneLegNftMint(e.target.value)}
                    />
                    <input
                      className="w-full rounded-lg border px-3 py-2"
                      placeholder="Valuation in USD (e.g. 500)"
                      value={oneLegNftValuation}
                      onChange={(e) => setOneLegNftValuation(e.target.value)}
                      inputMode="decimal"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label className="text-sm font-medium">Fiat currency</label>
                <div className="mt-1 flex items-center gap-2">
                  <TokenIcon code={fiatCurrency} size={22} />
                  <select
                    className="w-full rounded-lg border px-3 py-2"
                    value={fiatCurrency}
                    onChange={(e) => setFiatCurrency(e.target.value)}
                  >
                    <option value="NGN">NGN</option>
                  </select>
                </div>
              </div>
            )}

            {rail === "crypto" && settlementKind === "one_leg" && (
              <div>
                <label className="text-sm font-medium">Escrow type</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEscrowType("one_time")}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      escrowType === "one_time" ? SELECTED_BTN : IDLE_BTN
                    }`}
                  >
                    One-time
                  </button>
                  <button
                    type="button"
                    onClick={() => setEscrowType("milestone")}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      escrowType === "milestone" ? SELECTED_BTN : IDLE_BTN
                    }`}
                  >
                    Milestone
                  </button>
                </div>
              </div>
            )}

            {settlementKind === "ax" ? null : isOneLegNft ? (
              <p className="text-xs text-[var(--tl-muted)]">
                NFT amount is fixed at <strong>1</strong>. Enter mint + SOL
                valuation above.
              </p>
            ) : rail === "fiat" || escrowType === "one_time" ? (
              <input
                required
                className="w-full rounded-lg border px-3 py-2"
                placeholder={`Amount (${displayCurrency})`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            ) : (
              <div className="space-y-2">
                {milestones.map((m, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2">
                    <input
                      className="rounded-lg border px-3 py-2"
                      placeholder="Label"
                      value={m.label}
                      onChange={(e) => {
                        const n = [...milestones];
                        n[i] = { ...n[i], label: e.target.value };
                        setMilestones(n);
                      }}
                    />
                    <input
                      className="rounded-lg border px-3 py-2"
                      placeholder="Amount"
                      value={m.amount}
                      onChange={(e) => {
                        const n = [...milestones];
                        n[i] = { ...n[i], amount: e.target.value };
                        setMilestones(n);
                      }}
                    />
                  </div>
                ))}
                <p className="text-xs text-gray-500">
                  Total: <span className="inline-flex items-center gap-1">{baseAmountStr} <TokenIcon code={displayCurrency} size={14} /> {displayCurrency}</span>
                </p>
                <div className="flex gap-3 text-sm">
                  <button
                    type="button"
                    className="underline"
                    disabled={milestones.length >= 10}
                    onClick={() =>
                      setMilestones([
                        ...milestones,
                        {
                          amount: "",
                          label: `Milestone ${milestones.length + 1}`,
                        },
                      ])
                    }
                  >
                    Add milestone
                  </button>
                  {milestones.length > 2 && (
                    <button
                      type="button"
                      className="underline"
                      onClick={() => setMilestones(milestones.slice(0, -1))}
                    >
                      Remove last
                    </button>
                  )}
                </div>
              </div>
            )}

            {rail === "crypto" &&
              (isOneLegNft
                ? Boolean(oneLegNftValuation && Number(oneLegNftValuation) > 0)
                : baseAmountNum > 0) && (
              <div className="space-y-1 rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] p-4 text-sm">
                <p className="font-medium">TrustLayer fee preview</p>
                {isOneLegNft && feePreview ? (
                  <>
                    <p className="text-xs text-[var(--tl-muted)]">
                      Classic NFT · amount is always <strong>1</strong>. Valuation
                      is in <strong>USD</strong>; platform fee is paid in{" "}
                      <strong>SOL</strong> (not NFT units).
                    </p>
                    <p>
                      Valuation: ${oneLegNftValuation} · rate ≈ ${solUsdRate}/SOL
                    </p>
                    <p>
                      Settlement fee: {feePreview.platformFee} SOL (
                      {NFT_FEE_BPS / 100}%)
                    </p>
                    <p>
                      At fund you lock:{" "}
                      {(feePreview as { solLockAtFund?: string }).solLockAtFund ||
                        feePreview.fundAmount}{" "}
                      SOL (1.5× fee = settlement + refund reserve)
                    </p>
                    <p>
                      Reserve refunded on release:{" "}
                      {(feePreview as { refundReserveSol?: string })
                        .refundReserveSol || "—"}{" "}
                      SOL
                    </p>
                    <p className="text-xs text-[var(--tl-muted)]">
                      You transfer the NFT + lock SOL for the fee. The NFT never
                      pays the platform fee.
                    </p>
                  </>
                ) : settlementKind === "ax" &&
                  (axLegACode === "NFT" || axLegBCode === "NFT") ? (
                  <>
                    <p className="text-xs text-[var(--tl-muted)]">
                      NFT legs charge the platform fee in <strong>SOL</strong>{" "}
                      from each leg&apos;s valuation (shown under each leg).
                      Fungible legs still use their own asset for the 1.25% fee.
                    </p>
                    {axLegACode === "NFT" && axLegAValuation && (
                      <p>
                        Leg A (NFT): valuation {axLegAValuation} SOL · see leg
                        card for 1.5× SOL lock
                      </p>
                    )}
                    {axLegBCode === "NFT" && axLegBValuation && (
                      <p>
                        Leg B (NFT): valuation {axLegBValuation} SOL · see leg
                        card for 1.5× SOL lock
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    {settlementKind === "ax" ? (
                      <>
                        {[
                          { tag: "A", code: axLegACode, amt: baseAmountStr, prev: feePreview },
                          { tag: "B", code: axLegBCode, amt: axLegBAmount, prev: axLegBFeePreview },
                        ].map((leg) => {
                          const n = Number(leg.amt) || 0;
                          return (
                            <div key={leg.tag} className="mb-2 space-y-0.5">
                              <p className="font-medium">
                                Leg {leg.tag} ({leg.code})
                              </p>
                              <p>
                                Settlement fee:{" "}
                                {leg.prev ? Number(leg.prev.platformFee).toFixed(6) : "—"}{" "}
                                {leg.code} (1.25%)
                              </p>
                              <p>
                                Cancellation fee: {((n * CANCEL_BPS) / 10_000).toFixed(6)}{" "}
                                {leg.code} (0.2%)
                              </p>
                              <p>
                                Refund fee (policy / admin path):{" "}
                                {((n * REFUND_BPS) / 10_000).toFixed(6)} {leg.code} (0.5%)
                              </p>
                              <p className="font-medium">
                                Funding required (Leg {leg.tag}):{" "}
                                {leg.prev ? Number(leg.prev.fundAmount).toFixed(6) : "—"}{" "}
                                {leg.code}
                              </p>
                            </div>
                          );
                        })}
                        <p className="text-xs text-[var(--tl-muted)]">
                          Each party funds their own leg. Escrow is created unfunded;
                          funding is a separate transaction.
                        </p>
                      </>
                    ) : (
                      <>
                    <p>
                      Settlement fee: {settlementFee.toFixed(6)} {feeUnit} (2.5%)
                    </p>
                    <p>Cancellation fee: (0%)</p>
                    <p>
                      Refund fee (policy / admin path): {refundFee.toFixed(6)}{" "}
                      {feeUnit} (0.5%)
                    </p>
                    <p className="pt-1 font-medium">
                      Funding required: {fundingRequired.toFixed(6)} {feeUnit}
                    </p>
                    <p className="text-xs text-[var(--tl-muted)]">
                      Escrow is created unfunded; funding is a separate
                      transaction.
                    </p>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {rail === "fiat" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Fiat deals are not live yet.
              </div>
            )}

            <div>
              <label className="text-sm font-medium">
                Agreed trade deadline (does not move money)
              </label>
              <p className="mt-1 text-xs text-gray-500">
                Minimum allowed by the escrow program:{" "}
                <strong>1 minute</strong>. No product maximum — use custom for
                any longer window.
              </p>
              <div className="mt-2 flex gap-2 text-sm">
                <button
                  type="button"
                  className={`rounded-lg border px-3 py-1.5 ${
                    durationMode === "preset" ? SELECTED_BTN : IDLE_BTN
                  }`}
                  onClick={() => setDurationMode("preset")}
                >
                  Preset
                </button>
                <button
                  type="button"
                  className={`rounded-lg border px-3 py-1.5 ${
                    durationMode === "custom" ? SELECTED_BTN : IDLE_BTN
                  }`}
                  onClick={() => setDurationMode("custom")}
                >
                  Custom
                </button>
              </div>
              {durationMode === "preset" ? (
                <select
                  className="mt-2 w-full rounded-lg border px-3 py-2"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                >
                  {DURATION_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className="w-full rounded-lg border px-3 py-2"
                    placeholder="Minutes from now"
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(e.target.value)}
                  />
                  <span className="whitespace-nowrap text-sm text-gray-500">
                    minutes
                  </span>
                </div>
              )}
              {durationSeconds >= 60 && (
                <p className="mt-2 text-xs text-gray-500">
                  Deadline ≈ {deadlineLabel} (local) · stored/displayed in UTC
                  on the deal.
                </p>
              )}
            </div>

            {/* NFT fees are always SOL from valuation — on_top/from_amount N/A */}
            {isOneLegNft ||
            (settlementKind === "ax" &&
              axLegACode === "NFT" &&
              axLegBCode === "NFT") ? (
              <div className="rounded-xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-4 text-sm">
                <p className="font-semibold">Platform fee (SOL)</p>
                <p className="mt-1 text-xs text-[var(--tl-muted)]">
                  NFT legs always pay the platform fee in SOL based on agreed
                  valuation. Fee is not denominated in NFT units. Gas is
                  separate.
                </p>
              </div>
            ) : (
              <FeeModeSelector
                amount={
                  isOneLegNft ? oneLegNftValuation || "0" : baseAmountStr
                }
                assetOrCurrency={feeUnit}
                feeMode={feeMode}
                onChange={setFeeMode}
                feeBps={settlementKind === "ax" ? AX_LEG_FEE_BPS : SETTLEMENT_BPS}
              />
            )}

            <CounterpartyField
              valueLabel={counterpartyMeta?.displayLabel}
              onResolved={(v) => {
                setCounterpartyMeta(v);
                setCounterpartyUserId(v?.userId || "");
              }}
            />
          </section>

          <section className="space-y-3 rounded-2xl border border-[var(--tl-line)] bg-white p-6 shadow-sm">
            <h2 className="font-semibold">Condition / delivery</h2>
            <select
              className="w-full rounded-lg border px-3 py-2"
              value={conditionType}
              onChange={(e) => setConditionType(e.target.value)}
            >
              <option value="new">New</option>
              <option value="used">Used</option>
              <option value="digital">Digital</option>
              <option value="service">Service</option>
            </select>
            <input
              className="w-full rounded-lg border px-3 py-2"
              placeholder="Serial / IMEI / order ref (optional)"
              value={serialOrRef}
              onChange={(e) => setSerialOrRef(e.target.value)}
            />
            <select
              className="w-full rounded-lg border px-3 py-2"
              value={deliveryMethod}
              onChange={(e) => setDeliveryMethod(e.target.value)}
            >
              <option value="meetup">Meetup</option>
              <option value="courier">Courier</option>
              <option value="online">Online</option>
              <option value="online">Other Option</option>
            </select>
          </section>

          <section className="space-y-3 rounded-2xl border border-[var(--tl-line)] bg-white p-6 shadow-sm">
            <h2 className="font-semibold">Evidence images (max 3)</h2>
            <p className="text-xs text-gray-500">
              Upload clear photos of the actual item. Images are watermarked
              TrustLayer evidence.
            </p>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []).slice(0, 3);
                setImages(files);
              }}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              {images.map((f, i) => (
                <div key={`${f.name}-${i}`} className="rounded-lg border p-2">
                  <PreviewImage file={f} />
                  <p className="mt-2 truncate text-xs text-gray-500">
                    {f.name}
                  </p>
                  <input
                    className="mt-2 w-full rounded border px-2 py-1 text-sm"
                    placeholder="Caption"
                    value={captions[i] || ""}
                    onChange={(e) => {
                      const c = [...captions];
                      c[i] = e.target.value;
                      setCaptions(c);
                    }}
                  />
                  <div className="mt-2 flex gap-1">
                    <button
                      type="button"
                      disabled={i === 0}
                      className="rounded border px-2 py-1 text-xs disabled:opacity-40"
                      onClick={() => {
                        const fs = [...images];
                        [fs[i - 1], fs[i]] = [fs[i], fs[i - 1]];
                        const cs = [...captions];
                        [cs[i - 1], cs[i]] = [cs[i], cs[i - 1]];
                        setImages(fs);
                        setCaptions(cs);
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={i === images.length - 1}
                      className="rounded border px-2 py-1 text-xs disabled:opacity-40"
                      onClick={() => {
                        const fs = [...images];
                        [fs[i], fs[i + 1]] = [fs[i + 1], fs[i]];
                        const cs = [...captions];
                        [cs[i], cs[i + 1]] = [cs[i + 1], cs[i]];
                        setImages(fs);
                        setCaptions(cs);
                      }}
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-[var(--tl-line)] bg-white p-6 shadow-sm">
            <h2 className="font-semibold">Confirm summary</h2>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <p>
                <span className="text-gray-500">Title:</span> {title || "—"}
              </p>
              <p>
                <span className="text-gray-500">Rail:</span>{" "}
                {rail === "crypto"
                  ? `Crypto → Solana → ${
                      settlementKind === "ax" ? "Atomic exchange" : "Escrow"
                    }`
                  : "Fiat"}
              </p>
              <p>
                <span className="text-gray-500">Deadline:</span> {deadlineLabel}
              </p>
              <p>
                <span className="text-gray-500">Condition:</span> {conditionType}
              </p>
              <p>
                <span className="text-gray-500">Delivery:</span> {deliveryMethod}
              </p>
              {settlementKind !== "ax" && (
                <p>
                  <span className="text-gray-500">Escrow:</span>{" "}
                  {escrowType === "milestone"
                    ? `${milestones.length} milestones`
                    : "One-time"}
                </p>
              )}
            </div>

            {rail === "crypto" && settlementKind === "ax" ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] p-3 text-sm">
                  <p className="text-xs font-semibold uppercase text-[var(--tl-muted)]">
                    Leg A · buyer pays
                  </p>
                  {axLegACode === "NFT" ? (
                    <>
                      <p className="mt-1 font-medium">NFT ×1 (classic Token)</p>
                      <p className="text-xs text-[var(--tl-muted)]">
                        Valuation ${axLegAValuation || "—"} USD · fee in SOL
                        (2%)
                      </p>
                      {axLegAMint && (
                        <p className="mt-1 break-all font-mono text-[10px] text-[var(--tl-muted)]">
                          {axLegAMint}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-1 font-medium">
                      {axLegAAmount || "—"} {axLegACode}
                      <span className="ml-1 text-xs font-normal text-[var(--tl-muted)]">
                        · fee 1.25% in {axLegACode}
                      </span>
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] p-3 text-sm">
                  <p className="text-xs font-semibold uppercase text-[var(--tl-muted)]">
                    Leg B · seller pays
                  </p>
                  {axLegBCode === "NFT" ? (
                    <>
                      <p className="mt-1 font-medium">NFT ×1 (classic Token)</p>
                      <p className="text-xs text-[var(--tl-muted)]">
                        Valuation ${axLegBValuation || "—"} USD · fee in SOL
                        (2%)
                      </p>
                      {axLegBMint && (
                        <p className="mt-1 break-all font-mono text-[10px] text-[var(--tl-muted)]">
                          {axLegBMint}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-1 font-medium">
                      {axLegBAmount || "—"} {axLegBCode}
                      <span className="ml-1 text-xs font-normal text-[var(--tl-muted)]">
                        · fee 1.25% in {axLegBCode}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            ) : isOneLegNft ? (
              <div className="mt-3 rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] p-3 text-sm">
                <p className="font-medium">NFT ×1 (classic Token)</p>
                <p className="mt-1 text-xs text-[var(--tl-muted)]">
                  Valuation ${oneLegNftValuation || "—"} USD · platform fee 2%
                  paid in SOL (1.5× locked at fund)
                </p>
                {oneLegNftMint && (
                  <p className="mt-1 break-all font-mono text-[10px] text-[var(--tl-muted)]">
                    Mint: {oneLegNftMint}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm">
                <span className="text-gray-500">Amount:</span>{" "}
                <span className="inline-flex items-center gap-1.5 font-medium">
                  {baseAmountStr !== "0" ? baseAmountStr : "—"}{" "}
                  <TokenIcon code={displayCurrency} size={14} /> {displayCurrency}
                </span>
              </p>
            )}

            {escrowType === "milestone" && settlementKind !== "ax" && (
              <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm">
                {milestones.map((m, i) => (
                  <div key={i} className="flex justify-between gap-3">
                    <span>
                      #{i + 1} {m.label || `Milestone ${i + 1}`}
                    </span>
                    <span className="font-medium">
                      <span className="inline-flex items-center gap-1">
                        {m.amount || "—"}{" "}
                        <TokenIcon code={displayCurrency} size={14} />{" "}
                        {displayCurrency}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2 rounded-2xl border border-[var(--tl-line)] bg-white p-6 shadow-sm">
            <h2 className="font-semibold">Confirm checklist</h2>
            {(
              [
                [
                  "descriptionMatches",
                  "Description matches what will be delivered / exchanged",
                ],
                [
                  "amountAssetCorrect",
                  settlementKind === "ax"
                    ? "Both leg amounts, assets, and (if NFT) USD valuations are correct"
                    : isOneLegNft
                      ? "NFT mint is correct and USD valuation is agreed (fee paid in SOL)"
                      : "Amount and asset/currency are correct",
                ],
                [
                  "fundsMoveRulesUnderstood",
                  "Funds only move by Release / Cancel / Admin after dispute (crypto)",
                ],
                [
                  "photosAreActualItem",
                  "Photos (if any) are of the actual item / asset I control",
                ],
                ...(settlementKind === "ax"
                  ? ([
                      [
                        "bothLegsMustFund",
                        "I understand both legs must fund before the atomic swap can complete",
                      ],
                    ] as const)
                  : []),
                ...((isOneLegNft ||
                  (settlementKind === "ax" &&
                    (axLegACode === "NFT" || axLegBCode === "NFT")))
                  ? ([
                      [
                        "nftMintAndUsdOk",
                        "Mint is the correct classic NFT (1/1); USD valuation is agreed; platform fee is paid in SOL, not NFT",
                      ],
                    ] as const)
                  : []),
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(checklist[key as keyof typeof checklist])}
                  onChange={(e) =>
                    setChecklist({
                      ...checklist,
                      [key]: e.target.checked,
                    })
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </section>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-black px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create TrustLayer Deal"}
          </button>
        </form>
      </div>
    </main>
  );
}

function PreviewImage({ file }: { file: File }) {
  const [url, setUrl] = React.useState("");
  React.useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url ? (
    <img
      src={url}
      alt={file.name}
      className="h-32 w-full rounded object-cover"
    />
  ) : (
    <div className="h-32 w-full rounded bg-gray-100" />
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--tl-line)] bg-[var(--tl-paper)] p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--tl-muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-black">{value}</p>
    </div>
  );
}

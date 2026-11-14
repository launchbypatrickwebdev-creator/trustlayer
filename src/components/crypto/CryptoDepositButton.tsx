"use client";

import { useState } from "react";

export default function CryptoDepositButton({
  dealId,
  label = "Open Crypto Deposit",
  milestoneIndex = 0,
}: {
  dealId: string;
  label?: string;
  milestoneIndex?: number;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function openDeposit() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/crypto/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dealId,
          milestoneIndex,
        }),
      });

      const result = (await response.json()) as {
        depositUrl?: string;
        error?: string;
      };

      if (!response.ok || !result.depositUrl) {
        throw new Error(
          result.error || "Unable to open the crypto deposit flow."
        );
      }

      window.location.assign(result.depositUrl);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to open the crypto deposit flow."
      );
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void openDeposit()}
        disabled={loading}
        className="rounded-lg bg-black px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Opening secure deposit..." : label}
      </button>

      {error && (
        <p className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
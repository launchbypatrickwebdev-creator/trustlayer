"use client";

import { useState } from "react";

interface AdminExtendReviewDeadlineProps {
  disputeId: string;
  currentDeadline: string | null;
  disabled?: boolean;
}

function toLocalDateTimeValue(value: string | null) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);

  return local.toISOString().slice(0, 16);
}

export default function AdminExtendReviewDeadline({
  disputeId,
  currentDeadline,
  disabled = false,
}: AdminExtendReviewDeadlineProps) {
  const [value, setValue] = useState(
    toLocalDateTimeValue(currentDeadline)
  );

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function extendDeadline() {
    setError("");
    setMessage("");

    if (!value) {
      setError("Choose a future review deadline.");
      return;
    }

    const selected = new Date(value);

    if (Number.isNaN(selected.getTime())) {
      setError("Invalid review deadline.");
      return;
    }

    if (selected.getTime() <= Date.now()) {
      setError("The review deadline must be in the future.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        `/api/admin/disputes/${disputeId}/extend`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            adminReviewDeadline: selected.toISOString(),
          }),
        }
      );

      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body.error || "Unable to extend review window."
        );
      }

      setMessage(
        `Review window extended to ${new Date(
          body.adminReviewDeadline
        ).toLocaleString()}.`
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to extend review window."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <h3 className="font-medium text-blue-950">
        Admin review window
      </h3>

      <p className="mt-1 text-sm text-blue-800">
        Extend the administrative review deadline without changing
        the on-chain escrow state.
      </p>

      {currentDeadline && (
        <p className="mt-3 text-sm text-blue-900">
          <span className="font-medium">
            Current deadline:
          </span>{" "}
          {new Date(currentDeadline).toLocaleString()}
        </p>
      )}

      {disabled ? (
        <p className="mt-3 text-xs font-medium text-gray-600">
          The review window can only be extended while this dispute
          is open.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs font-medium text-blue-900">
              New deadline
            </span>

            <input
              type="datetime-local"
              value={value}
              onChange={(event) =>
                setValue(event.target.value)
              }
              disabled={loading}
              className="mt-1 block rounded-md border border-blue-300 bg-white px-3 py-2 text-sm"
            />
          </label>

          <button
            type="button"
            onClick={extendDeadline}
            disabled={loading}
            className="rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "Extending..."
              : "Extend review window"}
          </button>
        </div>
      )}

      {message && (
        <p className="mt-3 text-sm font-medium text-green-700">
          {message}
        </p>
      )}

      {error && (
        <p className="mt-3 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
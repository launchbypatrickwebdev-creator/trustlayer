"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminUserActions({
  userId,
  status,
}: {
  userId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function setStatus(next: "active" | "banned" | "restricted") {
    setBusy(true);
    setMsg("");
    const r = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountStatus: next }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setMsg(d.error || "Update failed");
      return;
    }
    setMsg(`Status → ${next}`);
    router.refresh();
  }

  async function deleteUser() {
    if (
      !window.confirm(
        "Permanently delete this user and their auth account? This cannot be undone. Funded escrows must be cleared first."
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg("");
    const r = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setMsg(d.error || "Delete failed");
      return;
    }
    router.push("/admin/users");
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || status === "active"}
          onClick={() => void setStatus("active")}
          className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40"
        >
          Unban / activate
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void setStatus("restricted")}
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 disabled:opacity-40"
        >
          Restrict
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void setStatus("banned")}
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-40"
        >
          Ban account
        </button>
      </div>
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-red-800">
          Danger zone
        </p>
        <p className="mt-1 text-xs text-red-700/90">
          Deletes Auth user + profile. Blocked if any escrow is still funded.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void deleteUser()}
          className="mt-3 rounded-xl border border-red-400 bg-white px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-40"
        >
          Delete user permanently
        </button>
      </div>
      {msg ? (
        <p className="text-xs text-[var(--tl-muted)]">{msg}</p>
      ) : null}
    </div>
  );
}

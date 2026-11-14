"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CountryRegionSelect from "@/components/profile/CountryRegionSelect";

type Props = {
  username: string;
  displayName: string;
  fullName: string;
  phone: string;
  country: string;
  region: string;
};

export default function ProfileEditor({
  username,
  displayName,
  fullName,
  phone,
  country,
  region,
}: Props) {
  const router = useRouter();
  const [user, setUser] = useState(username);
  const [name, setName] = useState(displayName);
  const [legal, setLegal] = useState(fullName);
  const [phoneValue, setPhone] = useState(phone);
  const [countryValue, setCountry] = useState(country || "");
  const [regionValue, setRegion] = useState(region);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function save() {
    if (!legal.trim() || legal.trim().length < 2) {
      setStatus("Full legal name is required.");
      return;
    }
    if (!name.trim()) {
      setStatus("Display name is required.");
      return;
    }
    if (!user.trim() || !/^[a-z0-9_]{3,32}$/i.test(user.trim())) {
      setStatus(
        "Username is required (3–32 chars: lowercase letters, numbers, underscore)."
      );
      return;
    }
    setBusy(true);
    setStatus("");
    const r = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: user,
        displayName: name,
        fullName: legal,
        phone: phoneValue,
        country: countryValue,
        region: regionValue,
      }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    setStatus(r.ok ? "Profile saved." : d.error || "Unable to save.");
    if (r.ok) router.refresh();
  }

  async function deleteAccount() {
    if (
      !window.confirm(
        "Delete your TrustLayer profile? Active funded deals must be closed first."
      )
    )
      return;
    setDeleteBusy(true);
    const r = await fetch("/api/profile", { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    setDeleteBusy(false);
    if (!r.ok) {
      setStatus(d.error || "Unable to delete profile.");
      return;
    }
    window.location.href = "/login";
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-[var(--tl-ink)]">
          Username <span className="text-[var(--tl-danger)]">*</span>
          <input
            value={user}
            onChange={(e) => setUser(e.target.value.toLowerCase())}
            className="mt-2 w-full rounded-xl border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] px-4 py-3 text-[var(--tl-ink)]"
            placeholder="public_handle"
            required
          />
          <span className="mt-1 block text-xs font-normal text-[var(--tl-muted)]">
            TrustLayer handle (3–32, lowercase). Auto-set on signup; you can
            change it. Not the same as Telegram @.
          </span>
        </label>
        <label className="text-sm font-semibold text-[var(--tl-ink)]">
          Display name <span className="text-[var(--tl-danger)]">*</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-2 w-full rounded-xl border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] px-4 py-3 text-[var(--tl-ink)]"
            placeholder="How you appear in the app"
            required
          />
        </label>
        <label className="text-sm font-semibold text-[var(--tl-ink)] sm:col-span-2">
          Full legal name <span className="text-[var(--tl-danger)]">*</span>
          <input
            value={legal}
            onChange={(e) => setLegal(e.target.value)}
            className="mt-2 w-full rounded-xl border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] px-4 py-3 text-[var(--tl-ink)]"
            placeholder="Required for account identity (crypto and fiat)"
            required
          />
        </label>
        <label className="text-sm font-semibold text-[var(--tl-ink)] sm:col-span-2">
          Phone
          <input
            value={phoneValue}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-2 w-full rounded-xl border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] px-4 py-3 text-[var(--tl-ink)]"
            placeholder="Optional"
          />
        </label>
      </div>

      <CountryRegionSelect
        country={countryValue}
        region={regionValue}
        onCountry={setCountry}
        onRegion={setRegion}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="tl-button tl-button-primary disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save profile"}
        </button>
        <span className="text-xs text-[var(--tl-muted)]">{status}</span>
      </div>

      <div className="rounded-2xl border border-[var(--tl-danger-soft)] bg-[var(--tl-danger-soft)] p-4">
        <p className="text-sm font-bold text-[var(--tl-danger)]">Danger zone</p>
        <button
          type="button"
          onClick={() => void deleteAccount()}
          disabled={deleteBusy}
          className="mt-3 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] px-4 py-2 text-sm font-semibold text-[var(--tl-danger)] disabled:opacity-50"
        >
          {deleteBusy ? "Deleting…" : "Delete my profile"}
        </button>
      </div>
    </div>
  );
}

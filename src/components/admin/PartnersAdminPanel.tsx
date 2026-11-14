"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Check,
  Copy,
  KeyRound,
  Plus,
  ShieldOff,
} from "lucide-react";

type Cred = {
  id: string;
  partner_id: string;
  key_prefix: string;
  environment: string;
  status: string;
  scopes: string[] | null;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
};

type PartnerRow = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  credentials: Cred[];
};

export default function PartnersAdminPanel({
  initialPartners,
}: {
  initialPartners: PartnerRow[];
}) {
  const router = useRouter();
  const [partners, setPartners] = useState(initialPartners);
  const [name, setName] = useState("");
  const [env, setEnv] = useState<"test" | "live">("test");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState("");

  async function createPartner(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), environment: env }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Create failed");
      if (json.api_key) setIssuedKey(json.api_key);
      setName("");
      router.refresh();
      // optimistic local merge if payload includes partner
      if (json.partner) {
        setPartners((prev) => [
          {
            ...json.partner,
            credentials: json.credential
              ? [{ ...json.credential, scopes: json.credential.scopes ?? [] }]
              : [],
          },
          ...prev,
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function issueKey(partnerId: string, environment: "test" | "live") {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/partners/${partnerId}/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environment }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Issue failed");
      if (json.api_key) setIssuedKey(json.api_key);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Issue failed");
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(credentialId: string) {
    if (!confirm("Revoke this API key? Partner calls with it will fail immediately.")) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/credentials/${credentialId}/revoke`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Revoke failed");
      setPartners((prev) =>
        prev.map((p) => ({
          ...p,
          credentials: p.credentials.map((c) =>
            c.id === credentialId
              ? {
                  ...c,
                  status: "revoked",
                  revoked_at: new Date().toISOString(),
                }
              : c
          ),
        }))
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    if (!issuedKey) return;
    await navigator.clipboard.writeText(issuedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const q = filter.trim().toLowerCase();
  const visible = q
    ? partners.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.credentials.some((c) => c.key_prefix.toLowerCase().includes(q))
      )
    : partners;

  return (
    <div className="mt-8 space-y-6">
      {issuedKey && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-5">
          <p className="text-sm font-bold text-emerald-200">
            API key issued — copy now
          </p>
          <p className="mt-1 text-xs text-slate-400">
            The secret is not stored in recoverable form. You will not see it
            again.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="max-w-full flex-1 overflow-x-auto rounded-xl border border-emerald-400/20 bg-black/40 px-3 py-2 font-mono text-xs text-emerald-100">
              {issuedKey}
            </code>
            <button
              type="button"
              onClick={copyKey}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/15 px-3 py-2 text-xs font-bold text-emerald-200"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={() => setIssuedKey(null)}
              className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {/* Create partner + first key */}
      <form
        onSubmit={createPartner}
        className="rounded-2xl border border-[#17334a] bg-[#071a2d] p-5"
      >
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Plus size={16} className="text-emerald-400" />
          Create partner
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Creates the partner and issues one API key (test or live).
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-xs font-semibold text-slate-400">
            Display name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Demo Marketplace"
              className="mt-1.5 w-full rounded-xl border border-[#1e3a52] bg-[#04101f] px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400/40"
            />
          </label>
          <label className="text-xs font-semibold text-slate-400">
            Environment
            <select
              value={env}
              onChange={(e) => setEnv(e.target.value as "test" | "live")}
              className="mt-1.5 block w-full rounded-xl border border-[#1e3a52] bg-[#04101f] px-3 py-2.5 text-sm text-white outline-none sm:w-36"
            >
              <option value="test">test</option>
              <option value="live">live</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-[#042f2e] disabled:opacity-50"
          >
            Create + issue key
          </button>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-white">Partners & keys</h2>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search name or prefix…"
          className="w-full max-w-xs rounded-xl border border-[#1e3a52] bg-[#071a2d] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 sm:w-64"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#17334a] bg-[#071a2d]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-[#17334a] text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-bold">Partner</th>
              <th className="px-4 py-3 font-bold">Key prefix</th>
              <th className="px-4 py-3 font-bold">Env</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 font-bold">Last used</th>
              <th className="px-4 py-3 font-bold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#14304a]">
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No partners yet. Create one above.
                </td>
              </tr>
            )}
            {visible.map((p) => {
              if (!p.credentials.length) {
                return (
                  <tr key={p.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-white">{p.name}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-600">
                        {p.id.slice(0, 8)}…
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-500">—</td>
                    <td className="px-4 py-3 text-slate-500">—</td>
                    <td className="px-4 py-3">
                      <StatusPill status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-500">—</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => issueKey(p.id, "test")}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/25 px-2 py-1 text-[11px] font-bold text-emerald-300"
                        >
                          <KeyRound size={12} /> test key
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => issueKey(p.id, "live")}
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-400/25 px-2 py-1 text-[11px] font-bold text-amber-200"
                        >
                          <KeyRound size={12} /> live key
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }
              return p.credentials.map((c, i) => (
                <tr key={c.id}>
                  <td className="px-4 py-3">
                    {i === 0 ? (
                      <>
                        <p className="font-semibold text-white">{p.name}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-slate-600">
                          {p.id.slice(0, 8)}…
                        </p>
                      </>
                    ) : (
                      <span className="text-slate-700">↳</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded-md border border-[#1e3a52] bg-black/30 px-2 py-0.5 font-mono text-[11px] text-slate-300">
                      {c.key_prefix}.…
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        c.environment === "live"
                          ? "bg-amber-400/15 text-amber-200"
                          : "bg-cyan-400/15 text-cyan-200"
                      }`}
                    >
                      {c.environment}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={c.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {c.last_used_at
                      ? new Date(c.last_used_at).toLocaleString()
                      : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {c.status === "active" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => revokeKey(c.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-400/30 px-2 py-1 text-[11px] font-bold text-rose-300"
                        >
                          <ShieldOff size={12} /> Revoke
                        </button>
                      )}
                      {i === 0 && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => issueKey(p.id, "test")}
                            className="rounded-lg border border-[#1e3a52] px-2 py-1 text-[11px] font-semibold text-slate-400 hover:text-white"
                          >
                            + test
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => issueKey(p.id, "live")}
                            className="rounded-lg border border-[#1e3a52] px-2 py-1 text-[11px] font-semibold text-slate-400 hover:text-white"
                          >
                            + live
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const active = status === "active";
  const revoked = status === "revoked";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
        active
          ? "bg-emerald-400/15 text-emerald-300"
          : revoked
            ? "bg-rose-400/15 text-rose-300"
            : "bg-slate-500/20 text-slate-400"
      }`}
    >
      {status}
    </span>
  );
}

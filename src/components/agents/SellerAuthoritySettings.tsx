"use client";

import { useCallback, useEffect, useState } from "react";

type Agent = { id: string; display_name: string; public_handle: string; agent_type: string; status: string };
type Authority = { id: string; agent_id: string; min_price_usd: number; preferred_price_usd: number; allow_auto_counter: boolean; allow_auto_accept: boolean; max_negotiation_rounds: number; authority_active: boolean; valid_until: string | null; version: number };
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body as T;
}

export default function SellerAuthoritySettings() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [authorities, setAuthorities] = useState<Authority[]>([]);
  const [agentId, setAgentId] = useState("");
  const [min, setMin] = useState("300");
  const [preferred, setPreferred] = useState("350");
  const [autoCounter, setAutoCounter] = useState(true);
  const [autoAccept, setAutoAccept] = useState(false);
  const [rounds, setRounds] = useState("5");
  const [active, setActive] = useState(true);
  const [validUntil, setValidUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const result = await api<{ agents: Agent[]; authorities: Array<Authority & { agent?: Agent }> }>("/api/agent-network/seller-authority");
    setAgents(result.agents);
    setAuthorities(result.authorities);
    setAgentId((current) => current || result.agents[0]?.id || "");
  }, []);
  useEffect(() => { void load().catch((e) => setError(e.message)); }, [load]);

  function selectAgent(id: string) {
    setAgentId(id);
    const current = authorities.find((item) => item.agent_id === id);
    if (!current) { setMin("300"); setPreferred("350"); setAutoCounter(true); setAutoAccept(false); setRounds("5"); setActive(true); setValidUntil(""); return; }
    setMin(String(current.min_price_usd)); setPreferred(String(current.preferred_price_usd));
    setAutoCounter(current.allow_auto_counter); setAutoAccept(current.allow_auto_accept);
    setRounds(String(current.max_negotiation_rounds)); setActive(current.authority_active);
    setValidUntil(current.valid_until ? new Date(current.valid_until).toISOString().slice(0, 16) : "");
  }

  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      await api("/api/agent-network/seller-authority", { method: "POST", body: JSON.stringify({ agentId, minPriceUsd: Number(min), preferredPriceUsd: Number(preferred), allowAutoCounter: autoCounter, allowAutoAccept: autoAccept, maxNegotiationRounds: Number(rounds), authorityActive: active, validUntil: validUntil ? new Date(validUntil).toISOString() : null }) });
      await load(); setNotice("Seller authority saved. The seller agent can only act within these owner-defined limits.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save seller authority."); }
    finally { setBusy(false); }
  }

  const current = authorities.find((item) => item.agent_id === agentId);
  return <section className="rounded-2xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-5">
    <p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-500">Delegated authority / 00</p>
    <h2 className="mt-1 text-xl font-bold">Autonomous seller agent controls</h2>
    <p className="mt-2 max-w-3xl text-sm text-[var(--tl-muted)]">Give a seller agent limited authority to counter or accept offers. The minimum price is a hard floor: the agent cannot accept or counter below it. Automatic acceptance is off by default. Authority can be revoked or time-limited by the owner.</p>
    {agents.length === 0 ? <p className="mt-4 rounded-lg bg-[var(--tl-bg)] p-3 text-sm text-[var(--tl-muted)]">Register an active seller or general-purpose agent before configuring delegated authority.</p> : <>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm md:col-span-2">Seller agent<select value={agentId} onChange={(e) => selectAgent(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2.5">{agents.map((a) => <option key={a.id} value={a.id}>@{a.public_handle} — {a.display_name}</option>)}</select></label>
        <label className="grid gap-1 text-sm">Minimum acceptable price (USD)<input type="number" min="0.01" step="0.01" value={min} onChange={(e) => setMin(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2.5" /></label>
        <label className="grid gap-1 text-sm">Preferred price (USD)<input type="number" min={min || "0.01"} step="0.01" value={preferred} onChange={(e) => setPreferred(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2.5" /></label>
        <label className="grid gap-1 text-sm">Maximum negotiation rounds<input type="number" min="1" max="10" step="1" value={rounds} onChange={(e) => setRounds(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2.5" /></label>
        <label className="grid gap-1 text-sm">Authority expiry (optional)<input type="datetime-local" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2.5" /><span className="text-xs text-[var(--tl-muted)]">Maximum 90 days. Leave blank for no expiry.</span></label>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex items-start gap-3 rounded-lg bg-[var(--tl-bg)] p-3 text-sm"><input type="checkbox" checked={autoCounter} onChange={(e) => setAutoCounter(e.target.checked)} className="mt-1" /><span><strong>Automatic counteroffers</strong><span className="mt-1 block text-xs text-[var(--tl-muted)]">The agent may counter up to the preferred price, never above the buyer's budget or below your minimum.</span></span></label>
        <label className="flex items-start gap-3 rounded-lg bg-[var(--tl-bg)] p-3 text-sm"><input type="checkbox" checked={autoAccept} onChange={(e) => setAutoAccept(e.target.checked)} className="mt-1" /><span><strong>Automatic acceptance</strong><span className="mt-1 block text-xs text-[var(--tl-muted)]">When enabled, the agent may accept an incoming offer at or above your minimum. This does not authorize payment.</span></span></label>
        <label className="flex items-start gap-3 rounded-lg bg-[var(--tl-bg)] p-3 text-sm sm:col-span-2"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="mt-1" /><span><strong>Delegated authority active</strong><span className="mt-1 block text-xs text-[var(--tl-muted)]">Turn this off to immediately stop future automated seller responses. Manual owner responses remain available subject to the minimum-price floor.</span></span></label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3"><button disabled={busy || !agentId} onClick={() => void save()} className="rounded-lg bg-[var(--tl-teal)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save seller authority"}</button>{current && <span className="text-xs text-[var(--tl-muted)]">Authority version {current.version} · {current.authority_active ? "Active" : "Revoked"}</span>}</div>
    </>}
    {(error || notice) && <p role={error ? "alert" : "status"} className={`mt-3 rounded-lg p-3 text-sm ${error ? "bg-red-500/10 text-red-600" : "bg-emerald-500/10 text-emerald-700"}`}>{error || notice}</p>}
  </section>;
}

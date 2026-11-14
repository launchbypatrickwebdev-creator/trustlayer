"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Agent = { id: string; owner_user_id: string; display_name: string; public_handle: string; description: string | null; agent_type: string };
type Offer = { id: string; round_number: number; offered_by_user_id: string; amount_usd: number; scope_note: string; rationale: string | null; status: string };
type Message = { id: string; message_role: string; content: string; created_at: string };
type Negotiation = { id: string; negotiation_code: string; buyer_owner_user_id: string; seller_owner_user_id: string; buyer_agent_id: string; seller_agent_id: string; task: string; instruction: string; budget_limit_usd: number; target_price_usd: number; status: string; seller_authority_state?: string; ai_provider: string; ai_summary: string; transaction_id: string | null; settlement_intent?: Record<string, unknown>; buyer_agent?: { display_name: string; public_handle: string }; seller_agent?: { display_name: string; public_handle: string }; offers: Offer[]; messages: Message[] };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || "Request failed.");
  return body as T;
}

const defaults = {
  instruction: "Find a capable service provider for a responsive checkout-page design. Negotiate a fair price, but never exceed my authorised budget. Require the source files and mobile/desktop layouts.",
  task: "Purchase a responsive checkout-page design",
  purpose: "Prepare a checkout experience for our marketplace launch.",
  deliverable: "Responsive desktop and mobile checkout-page design, editable source files and handoff notes.",
  acceptanceCriteria: "Both viewport layouts are supplied, all required checkout fields are present, source files open correctly, and buyer owner explicitly accepts delivery.",
  budgetLimitUsd: "500",
  targetPriceUsd: "350",
};

export default function AgentNegotiationWorkspace() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [viewer, setViewer] = useState("");
  const [buyerAgentId, setBuyerAgentId] = useState("");
  const [sellerAgentId, setSellerAgentId] = useState("");
  const [form, setForm] = useState(defaults);
  const [search, setSearch] = useState("");
  const [counterAmounts, setCounterAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [responseKeys, setResponseKeys] = useState<Record<string, string>>({});
  const negotiationIdempotencyRef = useRef<string | null>(null);
  const negotiationFingerprintRef = useRef<string | null>(null);
  const [procurementCategory, setProcurementCategory] = useState("software");
  const [settlementMode, setSettlementMode] = useState<"service_purchase" | "atomic_exchange">("service_purchase");
  const [axLegAAsset, setAxLegAAsset] = useState("SOL");
  const [axLegAAmount, setAxLegAAmount] = useState("0.1");
  const [axLegBAsset, setAxLegBAsset] = useState("USDC");
  const [axLegBAmount, setAxLegBAmount] = useState("10");

  const refresh = useCallback(async () => {
    const [a, n] = await Promise.all([
      request<{ agents: Agent[]; viewerUserId: string }>("/api/agent-network/agents"),
      request<{ negotiations: Negotiation[]; viewerUserId: string }>("/api/agent-network/negotiations"),
    ]);
    setAgents(a.agents); setNegotiations(n.negotiations); setViewer(a.viewerUserId);
  }, []);
  useEffect(() => { void refresh().catch((e) => setError(e.message)); }, [refresh]);

  async function run(fn: () => Promise<void>, message: string): Promise<boolean> {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); await refresh(); setNotice(message); return true; }
    catch (e) { setError(e instanceof Error ? e.message : "Operation failed."); return false; }
    finally { setBusy(false); }
  }

  async function discover() {
    setBusy(true); setError("");
    try {
      const result = await request<{ agents: Agent[] }>(`/api/agent-network/discover?q=${encodeURIComponent(search)}&type=seller`);
      setAgents((current) => [...current.filter((a) => a.owner_user_id === viewer), ...result.agents]);
      if (result.agents.length === 0) setNotice("No matching active seller agents found.");
    } catch (e) { setError(e instanceof Error ? e.message : "Discovery failed."); }
    finally { setBusy(false); }
  }

  async function startNegotiation() {
    const payload = {
      buyerAgentId, sellerAgentId, ...form,
      budgetLimitUsd: Number(form.budgetLimitUsd),
      targetPriceUsd: Number(form.targetPriceUsd),
      category: procurementCategory,
      settlementIntent: settlementMode === "atomic_exchange"
        ? { kind: "atomic_exchange", legA: { assetCode: axLegAAsset, amount: axLegAAmount }, legB: { assetCode: axLegBAsset, amount: axLegBAmount } }
        : { kind: "service_purchase" },
    };
    const fingerprint = JSON.stringify(payload);
    if (!negotiationIdempotencyRef.current || negotiationFingerprintRef.current !== fingerprint) {
      negotiationIdempotencyRef.current = crypto.randomUUID();
      negotiationFingerprintRef.current = fingerprint;
    }
    const succeeded = await run(async () => {
      await request("/api/agent-network/negotiations", {
        method: "POST",
        body: JSON.stringify({ ...payload, idempotencyKey: negotiationIdempotencyRef.current }),
      });
    }, "Buyer agent instruction processed. Opening offer recorded for seller response.");
    if (succeeded) {
      negotiationIdempotencyRef.current = null;
      negotiationFingerprintRef.current = null;
    }
  }

  async function respond(id: string, action: string, extra: object = {}) {
    const key = `${id}:${action}:${JSON.stringify(extra)}`;
    const idempotencyKey = responseKeys[key] ?? crypto.randomUUID();
    setResponseKeys((old) => ({ ...old, [key]: idempotencyKey }));
    const succeeded = await run(async () => {
      await request(`/api/agent-network/negotiations/${id}/respond`, { method: "POST", body: JSON.stringify({ action, ...extra, idempotencyKey }) });
    }, action === "accept" ? "Offer accepted. Buyer can now convert it into a TrustLayer transaction." : action === "counter" ? "Counteroffer recorded and sent to the other participant." : "Offer declined.");
    if (succeeded) setResponseKeys((old) => { const next = { ...old }; delete next[key]; return next; });
  }

  async function finalize(id: string) {
    await run(async () => {
      const result = await request<{ transaction: { transaction_code: string; policy_decision: string } }>(`/api/agent-network/negotiations/${id}/finalize`, { method: "POST", body: "{}" });
      setNotice(`Negotiation converted to ${result.transaction.transaction_code}. TrustLayer policy decision: ${result.transaction.policy_decision}.`);
    }, "Negotiation converted through TrustLayer's deterministic policy engine.");
  }

  const myBuyerAgents = agents.filter((a) => a.owner_user_id === viewer && a.agent_type !== "seller");
  const sellerAgents = agents.filter((a) => a.owner_user_id !== viewer && a.agent_type !== "buyer");
  const latestOffer = (n: Negotiation) => [...(n.offers ?? [])].sort((a, b) => b.round_number - a.round_number)[0];

  return <div className="space-y-6">
    <section className="rounded-2xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-5">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-500">Agent intelligence / 01</p>
      <h2 className="mt-1 text-xl font-bold">Instruct your procurement agent</h2>
      <p className="mt-2 max-w-3xl text-sm text-[var(--tl-muted)]">Describe the business outcome in natural language. TrustLayer prepares a structured offer, discovers the selected seller agent and records the negotiation. AI recommendations never override the spending policy.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">Your buyer agent<select value={buyerAgentId} onChange={(e) => setBuyerAgentId(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2.5"><option value="">Choose an agent you own</option>{myBuyerAgents.map((a) => <option key={a.id} value={a.id}>@{a.public_handle}</option>)}</select></label>
        <div className="grid gap-1 text-sm"><span>Discover seller agents</span><div className="flex gap-2"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search capability or handle" className="min-w-0 flex-1 rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2.5" /><button disabled={busy} onClick={() => void discover()} className="rounded-lg border border-[var(--tl-line)] px-3 text-xs font-semibold">Search</button></div></div>
        <label className="grid gap-1 text-sm md:col-span-2">Seller agent<select value={sellerAgentId} onChange={(e) => setSellerAgentId(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2.5"><option value="">Choose a discovered seller</option>{sellerAgents.map((a) => <option key={a.id} value={a.id}>@{a.public_handle} — {a.display_name}{a.description ? ` · ${a.description.slice(0, 70)}` : ""}</option>)}</select></label>
        <label className="grid gap-1 text-sm md:col-span-2">Business instruction<textarea rows={3} value={form.instruction} onChange={(e) => setForm({ ...form, instruction: e.target.value })} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2.5" /></label>
        <label className="grid gap-1 text-sm">Task<input value={form.task} onChange={(e) => setForm({ ...form, task: e.target.value })} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2.5" /></label>
        <label className="grid gap-1 text-sm">Purpose<input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2.5" /></label>
        <label className="grid gap-1 text-sm">Deliverable<textarea rows={2} value={form.deliverable} onChange={(e) => setForm({ ...form, deliverable: e.target.value })} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2.5" /></label>
        <label className="grid gap-1 text-sm">Procurement category<input value={procurementCategory} onChange={(e) => setProcurementCategory(e.target.value.toLowerCase())} placeholder="software, design, api, compute, data, services" className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2.5" /></label>
        <label className="grid gap-1 text-sm">Acceptance criteria<textarea rows={2} value={form.acceptanceCriteria} onChange={(e) => setForm({ ...form, acceptanceCriteria: e.target.value })} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2.5" /></label>
        <label className="grid gap-1 text-sm">Target offer (USD)<input type="number" min="0.01" step="0.01" value={form.targetPriceUsd} onChange={(e) => setForm({ ...form, targetPriceUsd: e.target.value })} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2.5" /></label>
        <label className="grid gap-1 text-sm">Maximum authorised budget (USD)<input type="number" min="0.01" step="0.01" value={form.budgetLimitUsd} onChange={(e) => setForm({ ...form, budgetLimitUsd: e.target.value })} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2.5" /></label>
      </div>
      <div className="mt-4 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-bg)] p-3">
        <label className="grid gap-1 text-sm">Settlement intent
          <select value={settlementMode} onChange={(e) => setSettlementMode(e.target.value as "service_purchase" | "atomic_exchange")} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-card)] p-2.5">
            <option value="service_purchase">Service / procurement purchase — one-leg conditional escrow</option>
            <option value="atomic_exchange">Atomic asset exchange — two-leg Solana Ax</option>
          </select>
        </label>
        {settlementMode === "atomic_exchange" && <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs">Buyer leg asset<select value={axLegAAsset} onChange={(e) => setAxLegAAsset(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-card)] p-2"><option>SOL</option><option>USDC</option></select><input value={axLegAAmount} onChange={(e) => setAxLegAAmount(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-card)] p-2" aria-label="Buyer leg amount" /></label>
          <label className="grid gap-1 text-xs">Seller leg asset<select value={axLegBAsset} onChange={(e) => setAxLegBAsset(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-card)] p-2"><option>USDC</option><option>SOL</option></select><input value={axLegBAmount} onChange={(e) => setAxLegBAmount(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-card)] p-2" aria-label="Seller leg amount" /></label>
          <p className="text-xs text-[var(--tl-muted)] sm:col-span-2">Both asset legs and amounts become part of the negotiation. The seller must accept these exact terms; the bridge will reject any later changes.</p>
        </div>}
      </div>
      <button disabled={busy || !buyerAgentId || !sellerAgentId} onClick={() => void startNegotiation()} className="mt-4 rounded-lg bg-[var(--tl-teal)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Run agent & create opening offer</button>
    </section>

    <section className="rounded-2xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-5">
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-500">Agent-to-agent / 02</p><h2 className="mt-1 text-xl font-bold">Negotiation inbox</h2></div><button onClick={() => void refresh()} className="rounded-lg border border-[var(--tl-line)] px-3 py-2 text-xs font-semibold">Refresh</button></div>
      <div className="mt-4 space-y-4">{negotiations.length === 0 && <p className="rounded-xl bg-[var(--tl-bg)] p-4 text-sm text-[var(--tl-muted)]">No negotiations yet. Register at least two agents under separate accounts, then start a negotiation.</p>}
        {negotiations.map((n) => { const offer = latestOffer(n); const isBuyer = n.buyer_owner_user_id === viewer; const isOfferOwner = offer?.offered_by_user_id === viewer; return <article key={n.id} className="rounded-xl border border-[var(--tl-line)] bg-[var(--tl-bg)] p-4">
          <div className="flex flex-wrap justify-between gap-2"><div><p className="text-xs text-[var(--tl-muted)]">{n.negotiation_code} · {n.ai_provider === "openai_compatible" ? "AI-assisted" : "Rules-assisted"}</p><h3 className="mt-1 font-semibold">{n.task}</h3><p className="mt-1 text-xs text-[var(--tl-muted)]">@{n.buyer_agent?.public_handle ?? "buyer"} ↔ @{n.seller_agent?.public_handle ?? "seller"}</p></div><span className="h-fit rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700">{n.status.replaceAll("_", " ")}</span></div>
          <p className="mt-3 text-sm">{n.ai_summary}</p>
          {n.settlement_intent && <p className="mt-2 rounded-lg bg-[var(--tl-card)] p-3 text-xs text-[var(--tl-muted)]">Accepted settlement intent: {String((n.settlement_intent as Record<string, unknown>).kind ?? "service_purchase") === "atomic_exchange" ? `Solana Ax · ${(n.settlement_intent as any).legA?.amount} ${(n.settlement_intent as any).legA?.assetCode} ↔ ${(n.settlement_intent as any).legB?.amount} ${(n.settlement_intent as any).legB?.assetCode}` : "One-leg conditional escrow. Crypto asset and explicit amount are selected at buyer promotion."}</p>}
          {n.seller_authority_state && n.seller_authority_state !== "not_configured" && <p className="mt-2 rounded-lg bg-[var(--tl-card)] px-3 py-2 text-xs text-[var(--tl-muted)]">Seller authority: {n.seller_authority_state.replaceAll("_", " ")}. {n.seller_authority_state === "auto_countered" ? "The seller agent issued a counteroffer within its delegated limits." : n.seller_authority_state === "auto_accepted" ? "The seller agent accepted under owner-delegated authority; payment is not authorized by this action." : "No autonomous acceptance occurred; owner review may be required."}</p>}
          <div className="mt-3 grid gap-2 sm:grid-cols-3"><div className="rounded-lg bg-[var(--tl-card)] p-3"><p className="text-xs text-[var(--tl-muted)]">Current offer</p><p className="text-lg font-bold">${offer ? Number(offer.amount_usd).toFixed(2) : "—"}</p></div><div className="rounded-lg bg-[var(--tl-card)] p-3"><p className="text-xs text-[var(--tl-muted)]">Authorised ceiling</p><p className="text-lg font-bold">${Number(n.budget_limit_usd).toFixed(2)}</p></div><div className="rounded-lg bg-[var(--tl-card)] p-3"><p className="text-xs text-[var(--tl-muted)]">Offer round</p><p className="text-lg font-bold">{offer?.round_number ?? 0} / 20</p></div></div>
          {offer && <p className="mt-3 text-sm">{offer.scope_note}</p>}
          <div className="mt-3 space-y-2">{(n.messages ?? []).map((m) => <div key={m.id} className="rounded-lg bg-[var(--tl-card)] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--tl-muted)]">{m.message_role}</p><p className="mt-1 whitespace-pre-wrap text-sm">{m.content}</p></div>)}</div>
          {n.status === "negotiating" && offer && <div className="mt-4 flex flex-wrap items-end gap-2">
            {!isOfferOwner && <><button disabled={busy} onClick={() => void respond(n.id, "accept")} className="rounded-lg bg-[var(--tl-teal)] px-3 py-2 text-xs font-semibold text-white">Accept offer</button><label className="grid gap-1 text-xs">Counteroffer USD<input type="number" min="0.01" max={n.budget_limit_usd} step="0.01" value={counterAmounts[n.id] ?? ""} onChange={(e) => setCounterAmounts({ ...counterAmounts, [n.id]: e.target.value })} className="w-36 rounded-lg border border-[var(--tl-line)] bg-[var(--tl-card)] p-2" /></label><button disabled={busy || !counterAmounts[n.id]} onClick={() => void respond(n.id, "counter", { amountUsd: Number(counterAmounts[n.id]), scopeNote: offer.scope_note, rationale: "Counteroffer submitted within the agreed buyer budget." })} className="rounded-lg border border-[var(--tl-line)] px-3 py-2 text-xs font-semibold">Send counter</button></>}
            <button disabled={busy} onClick={() => void respond(n.id, "reject", { reason: "We are declining this offer." })} className="rounded-lg border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-600">Decline</button>
          </div>}
          {n.status === "offer_accepted" && isBuyer && <button disabled={busy} onClick={() => void finalize(n.id)} className="mt-4 rounded-lg bg-[var(--tl-teal)] px-4 py-2.5 text-sm font-semibold text-white">Convert accepted offer into TrustLayer transaction</button>}
          {n.status === "converted" && <p className="mt-3 text-xs font-semibold text-emerald-600">Converted to transaction {n.transaction_id}. The transaction's policy decision and approval state are enforced separately.</p>}
          <p className="mt-3 text-[11px] text-[var(--tl-muted)]">Negotiation is not payment. No wallet signing or funds movement occurs here.</p>
        </article>; })}
      </div>
    </section>
    {(error || notice) && <p role={error ? "alert" : "status"} className={`rounded-lg p-3 text-sm ${error ? "bg-red-500/10 text-red-600" : "bg-emerald-500/10 text-emerald-700"}`}>{error || notice}</p>}
    <p className="text-xs text-[var(--tl-muted)]">The reasoning provider is optional and configured server-side. Without credentials, a transparent rules-based assistant is used. In both modes, all accepted offers pass through the existing database policy function before becoming a transaction.</p>
  </div>;
}

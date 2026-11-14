"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Agent = { id: string; owner_user_id: string; display_name: string; public_handle: string; description: string | null; agent_type: string; status: string };
type Policy = { max_transaction_usd: number; autonomous_limit_usd: number; daily_limit_usd: number; require_agreement: boolean; block_flagged_counterparties: boolean; is_active: boolean; version: number };
type ExecutionGrant = { id: string; agent_id: string; label: string; scopes: string[]; allowed_assets: string[]; allowed_wallets: string[]; allowed_settlement_types: string[]; max_transaction_usd: number; daily_limit_usd: number; approval_threshold_usd: number; expires_at: string | null; revoked_at: string | null };
type ProcurementProfile = { id: string; buyer_agent_id: string; approval_threshold_usd: number; max_purchase_usd: number; daily_budget_usd: number };
type EvidenceRecord = { id: string; description: string; sha256: string | null; signedUrl: string | null; created_at: string };
type Transaction = { procurementThresholdApproved?: boolean; executionApprovedGrantIds?: string[]; id: string; transaction_code: string; owner_user_id: string; seller_owner_user_id: string; buyer_agent_id: string; seller_agent_id: string; task: string; amount_usd: number; purpose: string; deliverable: string; acceptance_criteria: string; status: string; policy_decision: string; policy_reasons: string[]; agreement_hash: string; created_at: string; viewerRole: "buyer" | "seller"; deal_id?: string | null; settlement_intent?: Record<string, unknown> };

const initialForm = { task: "Purchase a product design service", amountUsd: "180", purpose: "Create a checkout-page design for a marketplace launch.", deliverable: "A responsive checkout-page design and source files.", acceptanceCriteria: "Mobile and desktop layouts supplied; required checkout fields included; buyer reviews and accepts the files." };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body as T;
}

export default function AgentSettlementDemo() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [viewerUserId, setViewerUserId] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [grants, setGrants] = useState<ExecutionGrant[]>([]);
  const [procurementProfiles, setProcurementProfiles] = useState<ProcurementProfile[]>([]);
  const [procurementApproved, setProcurementApproved] = useState<Record<string, boolean>>({});
  const [executionApproved, setExecutionApproved] = useState<Record<string, boolean>>({});
  const [policyForm, setPolicyForm] = useState({ maxTransactionUsd: "500", autonomousLimitUsd: "250", dailyLimitUsd: "1500" });
  const [myAgentId, setMyAgentId] = useState("");
  const [sellerAgentId, setSellerAgentId] = useState("");
  const [agentName, setAgentName] = useState("");
  const [agentHandle, setAgentHandle] = useState("");
  const [agentType, setAgentType] = useState("buyer");
  const [agentCapabilities, setAgentCapabilities] = useState("procurement,software,design,api,compute,data");
  const [form, setForm] = useState(initialForm);
  const [evidence, setEvidence] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [grantAgentId, setGrantAgentId] = useState("");
  const [grantWallet, setGrantWallet] = useState("");
  const [grantAssets, setGrantAssets] = useState("SOL,USDC");
  const [grantSettlementTypes, setGrantSettlementTypes] = useState("solana_escrow,solana_ax");
  const [grantMax, setGrantMax] = useState("500");
  const [grantDaily, setGrantDaily] = useState("1500");
  const [grantApproval, setGrantApproval] = useState("250");
  const [procurementAgentId, setProcurementAgentId] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [supplierHandles, setSupplierHandles] = useState("");
  const [procurementCategories, setProcurementCategories] = useState("software,design,api,compute,data,services");
  const [procurementMax, setProcurementMax] = useState("500");
  const [procurementDaily, setProcurementDaily] = useState("1500");
  const [procurementApproval, setProcurementApproval] = useState("250");
  const [repeatPurchasesAllowed, setRepeatPurchasesAllowed] = useState(false);
  const [riskResults, setRiskResults] = useState<Record<string, string>>({});
  const [nearQuotes, setNearQuotes] = useState<Record<string, string>>({});
  const [evidenceRecords, setEvidenceRecords] = useState<Record<string, EvidenceRecord[]>>({});
  const [bridgeAsset, setBridgeAsset] = useState("USDC");
  const [bridgeAmount, setBridgeAmount] = useState("");
  const [solRate, setSolRate] = useState("");
  const [solQuoteProvider, setSolQuoteProvider] = useState("");
  const [solQuoteReference, setSolQuoteReference] = useState("");
  const [buyerWallet, setBuyerWallet] = useState("");
  const [bridgeChecklistConfirmed, setBridgeChecklistConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const idempotencyKeyRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const [agentResult, transactionResult, policyResult, grantResult, procurementResult] = await Promise.all([
      api<{ agents: Agent[]; viewerUserId: string }>("/api/agent-network/agents"),
      api<{ transactions: Transaction[] }>("/api/agent-network/transactions"),
      api<{ policy: Policy }>("/api/agent-network/policy"),
      api<{ grants: ExecutionGrant[] }>("/api/agent-network/execution-grants"),
      api<{ profiles: ProcurementProfile[] }>("/api/agent-network/procurement"),
    ]);
    setAgents(agentResult.agents);
    setViewerUserId(agentResult.viewerUserId);
    setTransactions(transactionResult.transactions);
    setPolicy(policyResult.policy);
    setGrants(grantResult.grants);
    setProcurementProfiles(procurementResult.profiles);
    setPolicyForm({ maxTransactionUsd: String(policyResult.policy.max_transaction_usd), autonomousLimitUsd: String(policyResult.policy.autonomous_limit_usd), dailyLimitUsd: String(policyResult.policy.daily_limit_usd) });
  }, []);

  useEffect(() => { void refresh().catch((e) => setError(e instanceof Error ? e.message : "Could not load agent workspace.")); }, [refresh]);

  async function run(action: () => Promise<void>, success?: string) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); if (success) setNotice(success); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "The operation failed."); }
    finally { setBusy(false); }
  }

  function createAgent() {
    return run(async () => {
      await api("/api/agent-network/agents", { method: "POST", body: JSON.stringify({ displayName: agentName, publicHandle: agentHandle, agentType, capabilities: agentCapabilities.split(",").map((x) => x.trim()).filter(Boolean) }) });
      setAgentName(""); setAgentHandle("");
    }, "Agent identity created and registered.");
  }

  function createTransaction() {
    return run(async () => {
      if (!myAgentId || !sellerAgentId) throw new Error("Choose your buyer agent and a seller agent.");
      idempotencyKeyRef.current ??= crypto.randomUUID();
      await api("/api/agent-network/transactions", { method: "POST", body: JSON.stringify({ buyerAgentId: myAgentId, sellerAgentId, task: form.task, amountUsd: Number(form.amountUsd), purpose: form.purpose, deliverable: form.deliverable, acceptanceCriteria: form.acceptanceCriteria, idempotencyKey: idempotencyKeyRef.current }) });
      idempotencyKeyRef.current = null;
    }, "Proposal evaluated and recorded by TrustLayer.");
  }

  async function transition(id: string, action: string, body?: object) {
    await run(async () => { await api(`/api/agent-network/transactions/${id}/${action}`, { method: "POST", body: JSON.stringify(body ?? {}) }); }, "Transaction state updated and audit event recorded.");
  }

  async function createExecutionGrant() {
    await run(async () => {
      if (!grantAgentId || grantWallet.trim().length < 32) throw new Error("Select an agent you own and enter the wallet address the grant should permit.");
      const selected = agents.find((a) => a.id === grantAgentId);
      const scopes = selected?.agent_type === "seller" ? ["settlement:fund"] : ["deal:create", "settlement:create", "settlement:fund"];
      await api("/api/agent-network/execution-grants", { method: "POST", body: JSON.stringify({
        agentId: grantAgentId, label: "Owner-authorized Solana execution grant", scopes,
        allowedAssets: grantAssets.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean),
        allowedWallets: [grantWallet.trim()],
        allowedSettlementTypes: grantSettlementTypes.split(",").map((x) => x.trim()).filter(Boolean),
        maxTransactionUsd: Number(grantMax), dailyLimitUsd: Number(grantDaily),
        approvalThresholdUsd: Number(grantApproval),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }) });
    }, "Revocable owner execution grant created. It does not sign or control the wallet.");
  }

  async function bridgeTransaction(tx: Transaction) {
    await run(async () => {
      const intent = tx.settlement_intent ?? { kind: "service_purchase" };
      const isAx = intent.kind === "atomic_exchange";
      const body: Record<string, unknown> = {
        settlementAdapter: isAx ? "solana_ax" : "solana_escrow",
        agreementChecklist: bridgeChecklistConfirmed ? { descriptionMatches: true, amountAssetCorrect: true, fundsMoveRulesUnderstood: true, photosAreActualItem: true } : {},
        buyerWallet, partyAWallet: buyerWallet,
      };
      if (isAx) {
        body.axLegA = intent.legA;
        body.axLegB = intent.legB;
      } else {
        if (!bridgeAmount.trim()) throw new Error("Enter an explicit crypto settlement amount; the USD negotiation amount is not automatically converted.");
        body.assetCode = bridgeAsset;
        body.settlementAmount = bridgeAmount;
        if (bridgeAsset === "SOL") {
          if (!solRate || !solQuoteProvider.trim() || !solQuoteReference.trim()) throw new Error("A rate, quote provider and quote reference are required for SOL.");
          body.solQuote = {
            provider: solQuoteProvider, reference: solQuoteReference, rate: Number(solRate),
            usdAmount: Number(tx.amount_usd), assetAmount: bridgeAmount,
            quotedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          };
        }
      }
      const response = await fetch(`/api/agent-network/transactions/${tx.id}/bridge`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Deal bridge failed.");
      setNotice(`Linked to TrustLayer deal ${result.dealId}. Open the deal to continue through the normal acceptance and wallet funding workflow.`);
    }, "Agent transaction linked to a normal TrustLayer deal.");
  }

  async function approveProcurement(tx: Transaction) {
    await run(async () => {
      await api(`/api/agent-network/transactions/${tx.id}/procurement-approve`, { method: "POST", body: "{}" });
      setProcurementApproved((old) => ({ ...old, [tx.id]: true }));
    }, "Business procurement threshold approval recorded.");
  }

  async function approveExecution(tx: Transaction, grantId: string) {
    await run(async () => {
      await api(`/api/agent-network/transactions/${tx.id}/execution-approve`, { method: "POST", body: JSON.stringify({ grantId }) });
      setExecutionApproved((old) => ({ ...old, [tx.id]: true }));
    }, "Owner approval recorded for this execution grant and transaction.");
  }

  async function revokeExecutionGrant(grantId: string) {
    await run(async () => { await api("/api/agent-network/execution-grants", { method: "DELETE", body: JSON.stringify({ grantId }) }); }, "Execution grant revoked.");
  }

  async function saveProcurementProfile() {
    await run(async () => {
      if (!procurementAgentId || businessName.trim().length < 2) throw new Error("Choose a buyer agent and enter the business name.");
      await api("/api/agent-network/procurement", { method: "POST", body: JSON.stringify({
        buyerAgentId: procurementAgentId, businessName,
        approvedSupplierHandles: supplierHandles.split(",").map((x) => x.trim().replace(/^@/, "")).filter(Boolean),
        allowedCategories: procurementCategories.split(",").map((x) => x.trim()).filter(Boolean),
        maxPurchaseUsd: Number(procurementMax), dailyBudgetUsd: Number(procurementDaily),
        approvalThresholdUsd: Number(procurementApproval), repeatPurchasesAllowed,
      }) });
    }, "Business procurement profile saved.");
  }

  async function loadEvidence(id: string) {
    try {
      const result = await api<{ evidence: EvidenceRecord[] }>(`/api/agent-network/transactions/${id}/evidence`);
      setEvidenceRecords((old) => ({ ...old, [id]: result.evidence }));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load evidence."); }
  }

  async function evaluateRisk(id: string) {
    try {
      const result = await api<{ risk: { risk_level: string; risk_score: number; signals: string[] } }>(`/api/agent-network/transactions/${id}/risk`, { method: "POST", body: "{}" });
      setRiskResults((old) => ({ ...old, [id]: `${result.risk.risk_level.replaceAll("_"," ")} · ${result.risk.risk_score}/100 · ${result.risk.signals.join(" ") || "No configured risk signals."}` }));
    } catch (e) { setError(e instanceof Error ? e.message : "Risk evaluation failed."); }
  }

  async function requestNearQuote(tx: Transaction) {
    try {
      const agentId = window.prompt("Configured NEAR Intents agent ID:") ?? "";
      const originAsset = window.prompt("Origin asset identifier:") ?? "";
      const destinationAsset = window.prompt("Destination asset identifier:") ?? "";
      const amount = window.prompt("Amount in origin-asset base units:") ?? "";
      if (!agentId || !originAsset || !destinationAsset || !amount) return;
      const result = await api<{ quote: unknown; mode: string; executionAllowed: boolean; message: string }>(`/api/agent-network/transactions/${tx.id}/near-quote`, {
        method: "POST", body: JSON.stringify({ agentId, originAsset, destinationAsset, amount }),
      });
      setNearQuotes((old) => ({ ...old, [tx.id]: `${result.mode}: ${JSON.stringify(result.quote)} · ${result.message}` }));
    } catch (e) { setError(e instanceof Error ? e.message : "NEAR Intents quote unavailable."); }
  }

  async function uploadEvidence(id: string) {
    await run(async () => {
      if (!evidenceFile || evidence.trim().length < 3) throw new Error("Add a description and choose an evidence file.");
      const form = new FormData(); form.set("description", evidence); form.set("file", evidenceFile);
      const response = await fetch(`/api/agent-network/transactions/${id}/evidence`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Evidence upload failed.");
      setEvidence(""); setEvidenceFile(null);
    }, "Evidence uploaded to private storage and SHA-256 recorded.");
  }

  const statusLabel = (status: string) => status.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());

  return <div className="space-y-6">
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--tl-muted)]">01 / Agent identity</p>
        <h2 className="mt-1 text-lg font-semibold">Register an agent</h2>
        <p className="mt-1 text-sm text-[var(--tl-muted)]">Create a buyer or seller identity owned by your authenticated TrustLayer account.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">Display name<input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="Procurement Agent" className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] px-3 py-2" /></label>
          <label className="grid gap-1 text-sm">Public handle<input value={agentHandle} onChange={(e) => setAgentHandle(e.target.value.toLowerCase())} placeholder="acme-procurement" className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] px-3 py-2" /></label>
          <label className="grid gap-1 text-sm">Agent role<select value={agentType} onChange={(e) => setAgentType(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] px-3 py-2"><option value="buyer">Buyer / procurement</option><option value="seller">Seller / service provider</option><option value="general">General-purpose agent</option></select></label>
          <label className="grid gap-1 text-sm sm:col-span-2">Structured capabilities (comma-separated)<input value={agentCapabilities} onChange={(e) => setAgentCapabilities(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] px-3 py-2" /></label>
          <div className="flex items-end"><button disabled={busy || !agentName.trim() || !agentHandle.trim()} onClick={() => void createAgent()} className="w-full rounded-lg bg-[var(--tl-teal)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Register agent</button></div>
        </div>
        <div className="mt-4 space-y-2">{agents.map((agent) => <div key={agent.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--tl-bg)] p-3 text-sm"><div><p className="font-semibold">{agent.display_name} <span className="font-normal text-[var(--tl-muted)]">@{agent.public_handle}</span></p><p className="text-xs text-[var(--tl-muted)]">{agent.agent_type} · {agent.status}</p></div>{agent.owner_user_id !== viewerUserId && <button onClick={() => { const reason = window.prompt(`Why flag @${agent.public_handle}?`); if (reason) void run(async () => { await api("/api/agent-network/flags", { method: "POST", body: JSON.stringify({ agentId: agent.id, reason }) }); }, "Counterparty flagged for your account."); }} className="rounded-lg border border-red-500/30 px-2 py-1 text-xs text-red-600">Flag</button>}</div>)}</div>
      </section>

      <section className="rounded-2xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--tl-muted)]">02 / Policy controls</p>
        <h2 className="mt-1 text-lg font-semibold">Deterministic spending policy</h2>
        {policy ? <div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-xl bg-[var(--tl-bg)] p-3"><p className="text-xs text-[var(--tl-muted)]">Per transaction</p><p className="mt-1 text-lg font-bold">${Number(policy.max_transaction_usd).toFixed(0)}</p></div><div className="rounded-xl bg-[var(--tl-bg)] p-3"><p className="text-xs text-[var(--tl-muted)]">Autonomous limit</p><p className="mt-1 text-lg font-bold">${Number(policy.autonomous_limit_usd).toFixed(0)}</p></div><div className="rounded-xl bg-[var(--tl-bg)] p-3"><p className="text-xs text-[var(--tl-muted)]">Daily limit</p><p className="mt-1 text-lg font-bold">${Number(policy.daily_limit_usd).toFixed(0)}</p></div></div> : <p className="mt-3 text-sm text-[var(--tl-muted)]">Loading policy…</p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-xs">Per-transaction cap ($)<input type="number" min="1" value={policyForm.maxTransactionUsd} onChange={(e) => setPolicyForm({ ...policyForm, maxTransactionUsd: e.target.value })} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] px-3 py-2 text-sm" /></label>
          <label className="grid gap-1 text-xs">Autonomous threshold ($)<input type="number" min="0" value={policyForm.autonomousLimitUsd} onChange={(e) => setPolicyForm({ ...policyForm, autonomousLimitUsd: e.target.value })} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] px-3 py-2 text-sm" /></label>
          <label className="grid gap-1 text-xs">Daily cap ($)<input type="number" min="1" value={policyForm.dailyLimitUsd} onChange={(e) => setPolicyForm({ ...policyForm, dailyLimitUsd: e.target.value })} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] px-3 py-2 text-sm" /></label>
        </div>
        <button disabled={busy} onClick={() => void run(async () => { await api("/api/agent-network/policy", { method: "PATCH", body: JSON.stringify({ ...policyForm, maxTransactionUsd: Number(policyForm.maxTransactionUsd), autonomousLimitUsd: Number(policyForm.autonomousLimitUsd), dailyLimitUsd: Number(policyForm.dailyLimitUsd), version: policy?.version ?? 1 }) }); }, "Owner policy updated. New proposals will use the new policy version.")} className="mt-3 rounded-lg border border-[var(--tl-line)] px-3 py-2 text-xs font-semibold">Save policy limits</button>
        <ul className="mt-4 space-y-2 text-sm text-[var(--tl-muted)]"><li>• Policy is enforced inside a database transaction, not trusted from the browser.</li><li>• Over-limit proposals are blocked; proposals above the autonomous threshold require owner approval.</li><li>• Flagged counterparties and missing agreement terms are rejected.</li><li>• Policy snapshot and decision reasons are preserved with the transaction.</li></ul>
        <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-[var(--tl-muted)]">Execution grants constrain the existing Solana prepare routes. They do not hold keys or sign. NEAR Intents remains configuration-gated and cannot bypass TrustLayer deal authorization or chain reconciliation.</p>
      </section>
    </div>

    <section className="rounded-2xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--tl-muted)]">02A / Delegated wallet permission</p>
      <h2 className="mt-1 text-lg font-semibold">Create a revocable execution grant</h2>
      <p className="mt-1 text-sm text-[var(--tl-muted)]">Choose an agent you own, an allowed wallet, assets and settlement adapters. This grant constrains TrustLayer's preparation routes; the wallet owner must still sign every transaction.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-xs">Owned agent<select value={grantAgentId} onChange={(e) => setGrantAgentId(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2"><option value="">Select owned agent</option>{agents.filter((a) => a.owner_user_id === viewerUserId).map((a) => <option key={a.id} value={a.id}>@{a.public_handle} · {a.agent_type}</option>)}</select></label>
        <label className="grid gap-1 text-xs md:col-span-2">Permitted wallet address<input value={grantWallet} onChange={(e) => setGrantWallet(e.target.value)} placeholder="Paste the wallet address this grant permits" className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2" /></label>
        <label className="grid gap-1 text-xs">Allowed assets<input value={grantAssets} onChange={(e) => setGrantAssets(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2" /></label>
        <label className="grid gap-1 text-xs">Settlement adapters<input value={grantSettlementTypes} onChange={(e) => setGrantSettlementTypes(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2" /></label>
        <label className="grid gap-1 text-xs">Maximum / transaction USD<input type="number" value={grantMax} onChange={(e) => setGrantMax(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2" /></label>
        <label className="grid gap-1 text-xs">Daily limit USD<input type="number" value={grantDaily} onChange={(e) => setGrantDaily(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2" /></label>
        <label className="grid gap-1 text-xs">Owner approval above USD<input type="number" value={grantApproval} onChange={(e) => setGrantApproval(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2" /></label>
      </div>
      <button disabled={busy || !grantAgentId || grantWallet.trim().length < 32} onClick={() => void createExecutionGrant()} className="mt-3 rounded-lg border border-[var(--tl-line)] px-3 py-2 text-xs font-semibold">Create 7-day execution grant</button>
      <p className="mt-2 text-xs text-[var(--tl-muted)]">Create a separate grant under the seller's account for the seller agent's Ax funding leg.</p>
      <div className="mt-3 space-y-2">{grants.map((g) => <div key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--tl-bg)] p-3 text-xs"><div><p className="font-semibold">{g.label}</p><p className="text-[var(--tl-muted)]">{g.scopes.join(", ")} · {g.allowed_assets.join(", ")} · {g.allowed_settlement_types.join(", ")} · max ${Number(g.max_transaction_usd).toFixed(0)} / day ${Number(g.daily_limit_usd).toFixed(0)}</p><p className="break-all text-[var(--tl-muted)]">Wallets: {g.allowed_wallets.join(", ") || "Any wallet"}</p></div>{!g.revoked_at && <button disabled={busy} onClick={() => void revokeExecutionGrant(g.id)} className="rounded-lg border border-red-500/30 px-2 py-1 text-red-600">Revoke</button>}{g.revoked_at && <span className="text-red-600">Revoked</span>}</div>)}</div>
    </section>

    <section className="rounded-2xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--tl-muted)]">02B / Autonomous business procurement</p>
      <h2 className="mt-1 text-lg font-semibold">Business procurement profile</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-xs">Buyer agent<select value={procurementAgentId} onChange={(e) => setProcurementAgentId(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2"><option value="">Select owned buyer agent</option>{agents.filter((a) => a.owner_user_id === viewerUserId && a.agent_type !== "seller").map((a) => <option key={a.id} value={a.id}>@{a.public_handle}</option>)}</select></label>
        <label className="grid gap-1 text-xs">Business name<input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2" /></label>
        <label className="grid gap-1 text-xs">Approved supplier handles<input value={supplierHandles} onChange={(e) => setSupplierHandles(e.target.value)} placeholder="supplier-one,supplier-two" className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2" /></label>
        <label className="grid gap-1 text-xs md:col-span-3">Allowed procurement categories<input value={procurementCategories} onChange={(e) => setProcurementCategories(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2" /></label>
        <label className="grid gap-1 text-xs">Maximum purchase USD<input type="number" value={procurementMax} onChange={(e) => setProcurementMax(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2" /></label>
        <label className="grid gap-1 text-xs">Daily procurement budget USD<input type="number" value={procurementDaily} onChange={(e) => setProcurementDaily(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2" /></label>
        <label className="grid gap-1 text-xs">Approval threshold USD<input type="number" value={procurementApproval} onChange={(e) => setProcurementApproval(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] p-2" /></label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={repeatPurchasesAllowed} onChange={(e) => setRepeatPurchasesAllowed(e.target.checked)} />Allow this agent profile to be considered for repeat-purchase workflows (preference only; recurring execution is not enabled).</label>
      <button disabled={busy || !procurementAgentId || businessName.trim().length < 2} onClick={() => void saveProcurementProfile()} className="mt-3 rounded-lg border border-[var(--tl-line)] px-3 py-2 text-xs font-semibold">Save procurement controls</button>
      <p className="mt-2 text-xs text-[var(--tl-muted)]">This controls agent procurement scope and budgets. It is not a business treasury or fiat custody service.</p>
    </section>

    <section className="rounded-2xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--tl-muted)]">03 / Agent-to-agent commerce</p>
      <h2 className="mt-1 text-lg font-semibold">Create a transaction proposal</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">Your buyer agent<select value={myAgentId} onChange={(e) => setMyAgentId(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] px-3 py-2"><option value="">Select your buyer agent</option>{agents.filter((a) => a.owner_user_id === viewerUserId && a.agent_type !== "seller").map((a) => <option key={a.id} value={a.id}>@{a.public_handle}</option>)}</select></label>
        <label className="grid gap-1 text-sm">Seller agent<select value={sellerAgentId} onChange={(e) => setSellerAgentId(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] px-3 py-2"><option value="">Select a registered seller</option>{agents.filter((a) => a.owner_user_id !== viewerUserId && a.agent_type !== "buyer" && a.id !== myAgentId).map((a) => <option key={a.id} value={a.id}>@{a.public_handle} — {a.display_name}</option>)}</select></label>
        <label className="grid gap-1 text-sm md:col-span-2">Task<input value={form.task} onChange={(e) => setForm({ ...form, task: e.target.value })} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] px-3 py-2" /></label>
        <label className="grid gap-1 text-sm">Amount (USD)<input type="number" min="0.01" step="0.01" value={form.amountUsd} onChange={(e) => setForm({ ...form, amountUsd: e.target.value })} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] px-3 py-2" /></label>
        <label className="grid gap-1 text-sm">Purpose<input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] px-3 py-2" /></label>
        <label className="grid gap-1 text-sm">Required deliverable<textarea rows={2} value={form.deliverable} onChange={(e) => setForm({ ...form, deliverable: e.target.value })} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] px-3 py-2" /></label>
        <label className="grid gap-1 text-sm">Acceptance criteria<textarea rows={2} value={form.acceptanceCriteria} onChange={(e) => setForm({ ...form, acceptanceCriteria: e.target.value })} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] px-3 py-2" /></label>
      </div>
      <button disabled={busy || !myAgentId || !sellerAgentId} onClick={() => void createTransaction()} className="mt-4 rounded-lg bg-[var(--tl-teal)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Evaluate policy & create proposal</button>
      {error && <p role="alert" className="mt-3 text-sm text-red-500">{error}</p>}{notice && <p role="status" className="mt-3 text-sm text-emerald-600">{notice}</p>}
    </section>

    <section className="rounded-2xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-[var(--tl-muted)]">04 / Persistent transaction engine</p><h2 className="mt-1 text-lg font-semibold">Transaction workspace</h2></div><button onClick={() => void run(refresh)} className="rounded-lg border border-[var(--tl-line)] px-3 py-2 text-xs font-semibold">Refresh</button></div>
      <div className="mt-4 space-y-3">{transactions.length === 0 && <p className="rounded-lg bg-[var(--tl-bg)] p-4 text-sm text-[var(--tl-muted)]">No agent transactions yet. Register agents and create a proposal to start.</p>}
        {transactions.map((tx) => <article key={tx.id} className="rounded-xl border border-[var(--tl-line)] bg-[var(--tl-bg)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-[var(--tl-muted)]">{tx.transaction_code} · {tx.viewerRole} side</p><h3 className="mt-1 font-semibold">{tx.task}</h3><p className="mt-1 text-sm text-[var(--tl-muted)]">${Number(tx.amount_usd).toFixed(2)} · {statusLabel(tx.status)}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${tx.status === "blocked" || tx.status === "disputed" ? "bg-red-500/10 text-red-600" : tx.status === "settled" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-700"}`}>{statusLabel(tx.status)}</span></div>
          <p className="mt-3 text-sm">{tx.purpose}</p><p className="mt-1 text-xs text-[var(--tl-muted)]">Agreement SHA-256: <span className="break-all">{tx.agreement_hash}</span></p>
          {Array.isArray(tx.policy_reasons) && <ul className="mt-2 list-disc pl-5 text-xs text-[var(--tl-muted)]">{tx.policy_reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>}
          {tx.deal_id && <p className="mt-3 rounded-lg bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-700">Linked TrustLayer deal: <a className="underline" href={`/deals/${tx.deal_id}`}>{tx.deal_id}</a></p>}
          {tx.viewerRole === "buyer" && tx.status === "agreed" && !tx.deal_id && <div className="mt-3 rounded-lg border border-[var(--tl-line)] p-3">
            <p className="text-xs font-semibold">Promote accepted agent agreement into a TrustLayer deal</p>
            {tx.settlement_intent?.kind === "atomic_exchange" ? <p className="mt-1 text-xs text-[var(--tl-muted)]">Accepted Ax legs: {(tx.settlement_intent.legA as Record<string,string>)?.amount} {(tx.settlement_intent.legA as Record<string,string>)?.assetCode} ↔ {(tx.settlement_intent.legB as Record<string,string>)?.amount} {(tx.settlement_intent.legB as Record<string,string>)?.assetCode}</p> : <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-xs">Settlement asset<select value={bridgeAsset} onChange={(e) => setBridgeAsset(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-card)] p-2"><option>USDC</option><option>SOL</option></select></label>
              <label className="grid gap-1 text-xs">Explicit settlement amount<input value={bridgeAmount} onChange={(e) => setBridgeAmount(e.target.value)} placeholder="Enter USDC or SOL amount" className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-card)] p-2" /></label>
              {bridgeAsset === "SOL" && <><label className="grid gap-1 text-xs">SOL/USD rate<input value={solRate} onChange={(e) => setSolRate(e.target.value)} placeholder="Quote rate" className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-card)] p-2" /></label><label className="grid gap-1 text-xs">Quote provider<input value={solQuoteProvider} onChange={(e) => setSolQuoteProvider(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-card)] p-2" /></label><label className="grid gap-1 text-xs">Quote reference<input value={solQuoteReference} onChange={(e) => setSolQuoteReference(e.target.value)} className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-card)] p-2" /></label></>}
            </div>}
            <label className="mt-3 flex items-start gap-2 text-xs"><input type="checkbox" checked={bridgeChecklistConfirmed} onChange={(e) => setBridgeChecklistConfirmed(e.target.checked)} className="mt-0.5" /><span>I confirm the accepted description, amount/asset, fund-movement rules and that any physical-item photo requirement is satisfied or not applicable.</span></label>
            <label className="mt-2 grid gap-1 text-xs">Buyer wallet (must match your execution grant)<input value={buyerWallet} onChange={(e) => setBuyerWallet(e.target.value)} placeholder="Solana wallet address" className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-card)] p-2" /></label>
            <p className="mt-2 text-[11px] text-[var(--tl-muted)]">Promotion creates a normal draft/finalized TrustLayer deal. The counterparty must accept it and the wallet must authorize funding. Agent state never proves payment.</p>
            <button disabled={busy || !bridgeChecklistConfirmed} onClick={() => void bridgeTransaction(tx)} className="mt-3 rounded-lg bg-[var(--tl-teal)] px-3 py-2 text-xs font-semibold text-white">Create TrustLayer deal</button>
          </div>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => void evaluateRisk(tx.id)} className="rounded-lg border border-[var(--tl-line)] px-3 py-2 text-xs font-semibold">Evaluate counterparty risk</button>
            {tx.viewerRole === "buyer" && tx.deal_id && tx.status === "agreed" && <button disabled={busy} onClick={() => void requestNearQuote(tx)} className="rounded-lg border border-[var(--tl-line)] px-3 py-2 text-xs font-semibold">Request NEAR Intents dry quote</button>}
            <button disabled={busy} onClick={() => void loadEvidence(tx.id)} className="rounded-lg border border-[var(--tl-line)] px-3 py-2 text-xs font-semibold">View private evidence</button>
            {tx.viewerRole === "buyer" && procurementProfiles.some((p) => p.buyer_agent_id === tx.buyer_agent_id && tx.amount_usd > Number(p.approval_threshold_usd)) && !procurementApproved[tx.id] && !tx.procurementThresholdApproved && ["awaiting_counterparty","agreed"].includes(tx.status) && <button disabled={busy} onClick={() => void approveProcurement(tx)} className="rounded-lg border border-amber-500/40 px-3 py-2 text-xs font-semibold text-amber-700">Approve procurement threshold</button>}
            {(() => {
              const grantAgentId = tx.viewerRole === "buyer" ? tx.buyer_agent_id : tx.seller_agent_id;
              const requiredScope = tx.viewerRole === "buyer" ? "deal:create" : "settlement:fund";
              const isAx = tx.settlement_intent?.kind === "atomic_exchange";
              const adapter = isAx ? "solana_ax" : "solana_escrow";
              const intentLeg = tx.viewerRole === "buyer" ? tx.settlement_intent?.legA as Record<string,string> | undefined : tx.settlement_intent?.legB as Record<string,string> | undefined;
              const requiredAsset = isAx ? String(intentLeg?.assetCode ?? "").toUpperCase() : bridgeAsset;
              const grant = grants.find((g) => g.agent_id === grantAgentId && !g.revoked_at && (!g.expires_at || Date.parse(g.expires_at) > Date.now()) && g.scopes.includes(requiredScope) && g.allowed_settlement_types.includes(adapter) && g.allowed_assets.includes(requiredAsset) && tx.amount_usd > Number(g.approval_threshold_usd));
              const approved = !!grant && ((tx.executionApprovedGrantIds ?? []).includes(grant.id) || executionApproved[tx.id]);
              return grant && (tx.viewerRole === "buyer" || isAx) && !approved && ["agreed","funding_pending"].includes(tx.status)
                ? <button disabled={busy} onClick={() => void approveExecution(tx, grant.id)} className="rounded-lg border border-amber-500/40 px-3 py-2 text-xs font-semibold text-amber-700">Approve execution grant threshold</button>
                : null;
            })()}
            {tx.viewerRole === "buyer" && tx.status === "awaiting_approval" && <button disabled={busy} onClick={() => void transition(tx.id,"approve")} className="rounded-lg bg-[var(--tl-teal)] px-3 py-2 text-xs font-semibold text-white">Owner approve</button>}
            {tx.viewerRole === "seller" && tx.status === "awaiting_counterparty" && <button disabled={busy} onClick={() => void transition(tx.id,"accept")} className="rounded-lg bg-[var(--tl-teal)] px-3 py-2 text-xs font-semibold text-white">Accept agreement</button>}
            {tx.viewerRole === "seller" && ["agreed","funded","in_progress"].includes(tx.status) && <><input aria-label="Evidence description" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Describe deliverable evidence" className="min-w-48 flex-1 rounded-lg border border-[var(--tl-line)] bg-[var(--tl-card)] px-3 py-2 text-xs" /><input aria-label="Evidence file" type="file" accept="image/jpeg,image/png,application/pdf,text/plain" onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)} className="max-w-56 text-xs" /><button disabled={busy || evidence.trim().length < 3 || !evidenceFile} onClick={() => void uploadEvidence(tx.id)} className="rounded-lg border border-[var(--tl-line)] px-3 py-2 text-xs font-semibold">Upload private evidence</button></>}
            {!tx.deal_id && tx.viewerRole === "buyer" && tx.status === "evidence_submitted" && <button disabled={busy} onClick={() => void transition(tx.id,"accept-delivery")} className="rounded-lg bg-[var(--tl-teal)] px-3 py-2 text-xs font-semibold text-white">Accept delivery</button>}
            {!tx.deal_id && !['settled','cancelled','blocked','disputed'].includes(tx.status) && <button disabled={busy} onClick={() => { const reason = window.prompt("Why are you disputing this transaction?"); if (reason) void transition(tx.id,"dispute",{ reason }); }} className="rounded-lg border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-600">Open dispute</button>}
            {tx.deal_id && <p className="w-full text-xs text-[var(--tl-muted)]">Delivery acceptance, disputes, cancellation and settlement are managed from the linked TrustLayer deal.</p>}
          </div>
          {riskResults[tx.id] && <p className="mt-2 rounded-lg bg-amber-500/10 p-3 text-xs text-[var(--tl-muted)]">Rule-based risk assessment: {riskResults[tx.id]}. This is not a fraud determination.</p>}
          {nearQuotes[tx.id] && <p className="mt-2 break-words rounded-lg bg-[var(--tl-bg)] p-3 text-xs text-[var(--tl-muted)]">NEAR Intents dry quote: {nearQuotes[tx.id]}</p>}
          {evidenceRecords[tx.id] && <div className="mt-2 rounded-lg bg-[var(--tl-bg)] p-3 text-xs"><p className="font-semibold">Private evidence</p>{evidenceRecords[tx.id].length === 0 ? <p className="mt-1 text-[var(--tl-muted)]">No evidence submitted.</p> : evidenceRecords[tx.id].map((item) => <div key={item.id} className="mt-2 border-t border-[var(--tl-line)] pt-2"><p>{item.description}</p><p className="break-all text-[var(--tl-muted)]">SHA-256: {item.sha256}</p>{item.signedUrl && <a href={item.signedUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block underline">Open evidence (temporary link)</a>}</div>)}</div>}
        </article>)}
      </div>
    </section>
    <p className="text-xs text-[var(--tl-muted)]">The agent network records accepted terms and owner policy. The bridge creates a normal TrustLayer deal. Existing deal acceptance, wallet signing, Solana prepare/sign/record and reconciliation remain authoritative for funding and settlement. NEAR Intents remains a separate, configuration-gated execution integration.</p>
  </div>;
}

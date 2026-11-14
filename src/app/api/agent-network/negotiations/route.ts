import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { recommendNegotiation } from "@/lib/agents/intelligence";
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await createSupabaseServerClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data, error } = await s.from("trustlayer_agent_negotiations").select("*,buyer_agent:trustlayer_agents!trustlayer_agent_negotiations_buyer_agent_id_fkey(display_name,public_handle),seller_agent:trustlayer_agents!trustlayer_agent_negotiations_seller_agent_id_fkey(display_name,public_handle),offers:trustlayer_agent_negotiation_offers(*),messages:trustlayer_agent_negotiation_messages(*)").order("created_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: "Unable to load negotiations. Apply the agent negotiation migration first." }, { status: 500 });
  return NextResponse.json({ negotiations: data ?? [], viewerUserId: user.id });
}

export async function POST(req: Request) {
  const s = await createSupabaseServerClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const b = await req.json() as Record<string, unknown>;
    const buyerAgentId = String(b.buyerAgentId ?? "");
    const sellerAgentId = String(b.sellerAgentId ?? "");
    const instruction = String(b.instruction ?? "").trim();
    const task = String(b.task ?? "").trim();
    const purpose = String(b.purpose ?? "").trim();
    const deliverable = String(b.deliverable ?? "").trim();
    const acceptanceCriteria = String(b.acceptanceCriteria ?? "").trim();
    const budget = Number(b.budgetLimitUsd);
    const target = Number(b.targetPriceUsd);
    const idempotencyKey = String(b.idempotencyKey ?? "");
    const category = String(b.category ?? "general").trim().toLowerCase().slice(0, 80);
    if (!category) return NextResponse.json({ error: "A procurement category is required." }, { status: 400 });
    const rawIntent = (b.settlementIntent && typeof b.settlementIntent === "object") ? b.settlementIntent as Record<string, unknown> : { kind: "service_purchase" };
    const intentKind = String(rawIntent.kind ?? "service_purchase");
    let settlementIntent: Record<string, unknown> = { kind: "service_purchase" };
    if (intentKind === "atomic_exchange") {
      const a = rawIntent.legA as Record<string, unknown> | undefined;
      const c = rawIntent.legB as Record<string, unknown> | undefined;
      const assetA = String(a?.assetCode ?? "").toUpperCase();
      const assetB = String(c?.assetCode ?? "").toUpperCase();
      const amountA = String(a?.amount ?? "");
      const amountB = String(c?.amount ?? "");
      const precisionA = assetA === "SOL" ? 9 : 6;
      const precisionB = assetB === "SOL" ? 9 : 6;
      if (!a || !c || !["SOL","USDC"].includes(assetA) || !["SOL","USDC"].includes(assetB) ||
          assetA === assetB || !/^\d+(\.\d+)?$/.test(amountA) || Number(amountA) <= 0 ||
          !/^\d+(\.\d+)?$/.test(amountB) || Number(amountB) <= 0 ||
          (amountA.split(".")[1]?.length ?? 0) > precisionA || (amountB.split(".")[1]?.length ?? 0) > precisionB) {
        return NextResponse.json({ error: "Atomic exchange negotiation requires two explicit, different SOL/USDC legs and positive amounts." }, { status: 400 });
      }
      settlementIntent = { kind: "atomic_exchange", adapter: "solana_ax", legA: { assetCode: assetA, amount: amountA }, legB: { assetCode: assetB, amount: amountB } };
    } else if (intentKind !== "service_purchase") {
      return NextResponse.json({ error: "Unsupported settlement intent." }, { status: 400 });
    }
    if (idempotencyKey.length < 8) return NextResponse.json({ error: "A stable idempotency key is required." }, { status: 400 });
    const idempotencyHash = createHash("sha256").update(JSON.stringify({
      buyerAgentId, sellerAgentId, instruction, task, purpose, deliverable,
      acceptanceCriteria, budget, target, category, settlementIntent,
    })).digest("hex");
    const { data: prior } = await s.from("trustlayer_agent_negotiations").select("*")
      .eq("buyer_owner_user_id", user.id).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (prior) {
      if (prior.idempotency_hash !== idempotencyHash) return NextResponse.json({ error: "Idempotency key was already used for a different negotiation request." }, { status: 409 });
      return NextResponse.json({ negotiation: prior, replayed: true });
    }
    if (!buyerAgentId || !sellerAgentId || instruction.length < 10 || task.length < 3 || purpose.length < 3 || deliverable.length < 3 || acceptanceCriteria.length < 3 || !Number.isFinite(budget) || !Number.isFinite(target) || target <= 0 || budget < target || idempotencyKey.length < 8) return NextResponse.json({ error: "Provide both agents, a complete instruction and agreement scope, a valid target price within the budget, and an idempotency key." }, { status: 400 });
    const [{ data: buyer }, { data: seller }] = await Promise.all([
      s.from("trustlayer_agents").select("id,owner_user_id,display_name,public_handle,status,agent_type").eq("id", buyerAgentId).eq("owner_user_id", user.id).single(),
      s.from("trustlayer_agents").select("id,owner_user_id,display_name,public_handle,description,status,agent_type").eq("id", sellerAgentId).eq("status", "active").single(),
    ]);
    if (!buyer || !seller || seller.owner_user_id === user.id) return NextResponse.json({ error: "Choose an active buyer agent you own and a seller agent owned by another account." }, { status: 400 });
    if (buyer.status !== "active" || buyer.agent_type === "seller" || seller.agent_type === "buyer") return NextResponse.json({ error: "The selected agent roles are not compatible with this purchase." }, { status: 400 });
    const { data: procurement } = await s.from("trustlayer_agent_procurement_profiles").select("*")
      .eq("owner_user_id", user.id).eq("buyer_agent_id", buyer.id).maybeSingle();
    if (procurement) {
      if (budget > Number(procurement.max_purchase_usd)) return NextResponse.json({ error: `Business procurement budget cannot exceed $${Number(procurement.max_purchase_usd).toFixed(2)} per purchase.` }, { status: 400 });
      if (Array.isArray(procurement.approved_supplier_handles) && procurement.approved_supplier_handles.length > 0 &&
          !procurement.approved_supplier_handles.some((h: string) => h.toLowerCase() === seller.public_handle.toLowerCase())) {
        return NextResponse.json({ error: "Seller agent is not on the approved-supplier list for this procurement profile." }, { status: 403 });
      }
      if (Array.isArray(procurement.allowed_categories) && procurement.allowed_categories.length > 0 &&
          !procurement.allowed_categories.some((c: string) => c.toLowerCase() === category)) {
        return NextResponse.json({ error: "This procurement category is not permitted by the buyer agent's business profile." }, { status: 403 });
      }
    }
    const { data: policy, error: policyError } = await s.rpc("tl_agent_ensure_policy");
    if (policyError || !policy) return NextResponse.json({ error: "Unable to load the buyer agent's spending policy." }, { status: 500 });
    if (!policy.is_active || budget > Number(policy.max_transaction_usd)) return NextResponse.json({ error: `The authorised negotiation budget cannot exceed your active per-transaction policy limit of $${Number(policy.max_transaction_usd).toFixed(2)}.` }, { status: 400 });
    const ai = await recommendNegotiation({ instruction, task, purpose, deliverable, acceptanceCriteria, budgetLimitUsd: budget, targetPriceUsd: target, sellerName: seller.display_name, sellerHandle: seller.public_handle, sellerDescription: seller.description });
    const { data: negotiation, error } = await s.from("trustlayer_agent_negotiations").insert({ buyer_owner_user_id: user.id, seller_owner_user_id: seller.owner_user_id, buyer_agent_id: buyer.id, seller_agent_id: seller.id, instruction, task, purpose, deliverable, acceptance_criteria: acceptanceCriteria, budget_limit_usd: budget, target_price_usd: target, ai_provider: ai.provider, ai_summary: ai.summary, idempotency_key: idempotencyKey, idempotency_hash: idempotencyHash, settlement_intent: settlementIntent, category }).select("*").single();
    if (error) {
      if (error.code === "23505") {
        const { data: existing } = await s.from("trustlayer_agent_negotiations").select("*")
          .eq("buyer_owner_user_id", user.id).eq("idempotency_key", idempotencyKey).single();
        if (existing?.idempotency_hash !== idempotencyHash) return NextResponse.json({ error: "Idempotency key conflict." }, { status: 409 });
        // Recover a partially-created negotiation without duplicating its offer or message.
        const { data: existingOffers } = await s.from("trustlayer_agent_negotiation_offers").select("*")
          .eq("negotiation_id", existing.id).order("round_number", { ascending: true });
        let recoveredOffer = existingOffers?.[0] ?? null;
        if (!recoveredOffer) {
          const { data: insertedOffer, error: offerRepairError } = await s.from("trustlayer_agent_negotiation_offers").insert({
            negotiation_id: existing.id, round_number: 1, offered_by_user_id: user.id,
            offered_by_agent_id: buyer.id, amount_usd: ai.recommendedAmountUsd,
            scope_note: deliverable, rationale: ai.rationale, status: "open",
          }).select("*").single();
          if (offerRepairError) return NextResponse.json({ error: `Unable to recover opening offer: ${offerRepairError.message}` }, { status: 500 });
          recoveredOffer = insertedOffer;
        }
        const { data: existingMessages } = await s.from("trustlayer_agent_negotiation_messages").select("*")
          .eq("negotiation_id", existing.id).eq("message_role", "assistant").eq("sender_agent_id", buyer.id);
        let recoveredMessage = existingMessages?.find((m) => (m.metadata as Record<string, unknown> | null)?.idempotency_key === idempotencyKey) ?? null;
        if (!recoveredMessage && !existingMessages?.length) {
          const { data: insertedMessage, error: messageRepairError } = await s.from("trustlayer_agent_negotiation_messages").insert({
            negotiation_id: existing.id, sender_user_id: null, sender_agent_id: buyer.id,
            message_role: "assistant", content: ai.negotiationMessage,
            metadata: { provider: ai.provider, risks: ai.risks, summary: ai.summary, idempotency_key: idempotencyKey },
          }).select("*").single();
          if (messageRepairError) return NextResponse.json({ error: `Unable to recover opening negotiation message: ${messageRepairError.message}` }, { status: 500 });
          recoveredMessage = insertedMessage;
        }
        const { data: sellerAutomation, error: automationError } = await s.rpc("tl_agent_apply_seller_authority", { p_negotiation_id: existing.id });
        if (automationError) return NextResponse.json({ error: "Negotiation exists but seller authority recovery failed." }, { status: 500 });
        return NextResponse.json({ negotiation: existing, offer: recoveredOffer, message: recoveredMessage, sellerAutomation, replayed: true });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const [offerResult, messageResult] = await Promise.all([
      s.from("trustlayer_agent_negotiation_offers").insert({ negotiation_id: negotiation.id, round_number: 1, offered_by_user_id: user.id, offered_by_agent_id: buyer.id, amount_usd: ai.recommendedAmountUsd, scope_note: deliverable, rationale: ai.rationale, status: "open" }).select("*").single(),
      s.from("trustlayer_agent_negotiation_messages").insert({ negotiation_id: negotiation.id, sender_user_id: null, sender_agent_id: buyer.id, message_role: "assistant", content: ai.negotiationMessage, metadata: { provider: ai.provider, risks: ai.risks, summary: ai.summary, idempotency_key: idempotencyKey } }).select("*").single(),
    ]);
    if (offerResult.error || messageResult.error) return NextResponse.json({ error: "Negotiation was created but its opening offer could not be saved. Refresh before retrying." }, { status: 500 });
    // Evaluate the seller's owner-delegated authority immediately. If no authority
    // exists, the negotiation remains open for the seller owner to respond.
    const { data: sellerAutomation, error: automationError } = await s.rpc("tl_agent_apply_seller_authority", { p_negotiation_id: negotiation.id });
    if (automationError) return NextResponse.json({ error: "Negotiation was created, but seller authority evaluation failed. Refresh the negotiation before retrying." }, { status: 500 });
    return NextResponse.json({ negotiation, offer: offerResult.data, message: messageResult.data, recommendation: ai, sellerAutomation }, { status: 201 });
  } catch { return NextResponse.json({ error: "Invalid negotiation request." }, { status: 400 }); }
}

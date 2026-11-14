import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createDeal, ensureAxDealSettlementLegs, finalizeDealAgreement, type Deal } from "@/lib/domain/deals";
import { authorizeAgentDealExecution } from "@/lib/agents/execution-permissions";

export const dynamic = "force-dynamic";

type Json = Record<string, unknown>;

function positiveDecimal(value: unknown, label: string, decimals: number): string {
  const raw = String(value ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(raw) || Number(raw) <= 0 || (raw.split(".")[1]?.length ?? 0) > decimals) {
    throw new Error(`${label} must be a positive amount with no more than ${decimals} decimal places.`);
  }
  return raw;
}

function validateSolQuote(quote: unknown, amountUsd: number, amount: string) {
  if (!quote || typeof quote !== "object") throw new Error("An explicit, unexpired SOL/USD quote is required for SOL settlement.");
  const q = quote as Json;
  const rate = Number(q.rate);
  const quoteUsd = Number(q.usdAmount);
  const quoteAmount = String(q.assetAmount ?? "");
  const expires = Date.parse(String(q.expiresAt ?? ""));
  const quotedAt = Date.parse(String(q.quotedAt ?? ""));
  const convertedUsd = rate * Number(amount);
  if (!String(q.provider ?? "").trim() || !String(q.reference ?? "").trim() ||
      !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(quoteUsd) ||
      Math.abs(quoteUsd - amountUsd) > 0.01 || quoteAmount !== amount ||
      !Number.isFinite(convertedUsd) || Math.abs(convertedUsd - quoteUsd) / quoteUsd > 0.02 ||
      !Number.isFinite(quotedAt) || quotedAt > Date.now() || Date.now() - quotedAt > 5 * 60 * 1000 ||
      !Number.isFinite(expires) || expires <= Date.now()) {
    throw new Error("SOL quote is incomplete, does not match the accepted USD amount, or has expired.");
  }
  return {
    provider: String(q.provider).slice(0, 80),
    reference: String(q.reference).slice(0, 160),
    rate,
    usdAmount: quoteUsd,
    assetAmount: quoteAmount,
    quotedAt: new Date(quotedAt).toISOString(),
    expiresAt: new Date(expires).toISOString(),
  };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: tx, error: txError } = await supabase
    .from("trustlayer_agent_transactions").select("*").eq("id", id).single();
  if (txError || !tx) return NextResponse.json({ error: "Agent transaction not found." }, { status: 404 });
  if (tx.owner_user_id !== user.id) return NextResponse.json({ error: "Only the authenticated buyer-agent owner can promote this transaction." }, { status: 403 });
  if (tx.deal_id) return NextResponse.json({ dealId: tx.deal_id, replayed: true });

  let body: Json;
  try { body = await req.json() as Json; }
  catch { return NextResponse.json({ error: "Invalid bridge request." }, { status: 400 }); }

  // The human buyer explicitly confirms the existing TrustLayer agreement checklist.
  const checklist = (body.agreementChecklist && typeof body.agreementChecklist === "object")
    ? body.agreementChecklist as Json : {};
  const requiredChecks = ["descriptionMatches", "amountAssetCorrect", "fundsMoveRulesUnderstood", "photosAreActualItem"];
  if (!requiredChecks.every((key) => checklist[key] === true)) {
    return NextResponse.json({ error: "Confirm all four TrustLayer agreement checklist items before creating the deal. For a service with no physical item, photosAreActualItem confirms that no item photo is applicable." }, { status: 400 });
  }

  const { data: negotiation } = await supabase.from("trustlayer_agent_negotiations")
    .select("id,status,transaction_id,buyer_owner_user_id,seller_owner_user_id,buyer_agent_id,seller_agent_id,seller_authority_state,seller_authority_version,settlement_intent,category,instruction")
    .eq("transaction_id", id).eq("buyer_owner_user_id", user.id).maybeSingle();
  if (!negotiation || negotiation.status !== "converted" || negotiation.transaction_id !== id ||
      negotiation.seller_owner_user_id !== tx.seller_owner_user_id) {
    return NextResponse.json({ error: "The transaction is not linked to a seller-accepted negotiation." }, { status: 409 });
  }
  const { data: acceptedOffer } = await supabase.from("trustlayer_agent_negotiation_offers")
    .select("id,amount_usd,scope_note,status").eq("negotiation_id", negotiation.id)
    .eq("status", "accepted").order("round_number", { ascending: false }).limit(1).maybeSingle();
  if (!acceptedOffer || Number(acceptedOffer.amount_usd) !== Number(tx.amount_usd)) {
    return NextResponse.json({ error: "Accepted offer does not match the immutable agent transaction amount." }, { status: 409 });
  }
  const { data: sellerAcceptance } = await supabase.from("trustlayer_agent_transaction_events")
    .select("id").eq("transaction_id", id).eq("event_type", "agreement_accepted")
    .eq("actor_user_id", tx.seller_owner_user_id).limit(1).maybeSingle();
  const buyerApproval = tx.policy_decision === "approval_required"
    ? await supabase.from("trustlayer_agent_transaction_events").select("id")
        .eq("transaction_id", id).eq("event_type", "human_approved").eq("actor_user_id", user.id).limit(1).maybeSingle()
    : { data: { id: "not_required" } };
  if (tx.status !== "agreed" || tx.policy_decision === "blocked" || !sellerAcceptance || !buyerApproval.data) {
    return NextResponse.json({ error: "Seller-owner acceptance and any required buyer policy approval must be recorded before bridging." }, { status: 409 });
  }

  const settlementType = String(body.settlementAdapter ?? "solana_escrow");
  if (!["solana_escrow", "solana_ax"].includes(settlementType)) {
    return NextResponse.json({ error: "Agent bridge currently supports Solana one-leg escrow and Solana Ax only. Fiat remains an architectural rail, not a live agent settlement option." }, { status: 400 });
  }
  const rail = "crypto" as const;
  const amountUsd = Number(tx.amount_usd);
  let createInput: Parameters<typeof createDeal>[0];
  let settlement: Json;

  try {
    if (settlementType === "solana_escrow") {
      const assetCode = String(body.assetCode ?? "").toUpperCase();
      if (!["SOL", "USDC"].includes(assetCode)) throw new Error("The initial agent bridge supports explicit SOL or USDC settlement amounts.");
      const amount = positiveDecimal(body.settlementAmount, "Settlement amount", assetCode === "SOL" ? 9 : 6);
      if (assetCode === "USDC" && Math.abs(Number(amount) - amountUsd) / amountUsd > 0.02) {
        throw new Error("USDC amount must remain within 2% of the accepted USD agreement. If the parties agreed to a different amount, revise and re-accept the agent offer first.");
      }
      const quote = assetCode === "SOL" ? validateSolQuote(body.solQuote, amountUsd, amount) : null;
      const { data: wallets, error: walletError } = await admin.from("wallets")
        .select("address,user_id,asset_code,is_primary").eq("user_id", user.id)
        .eq("network", "devnet").eq("asset_code", assetCode)
        .order("is_primary", { ascending: false }).order("updated_at", { ascending: false }).limit(20);
      if (walletError) throw new Error(`Unable to verify the buyer's linked ${assetCode} wallet: ${walletError.message}`);
      type LinkedWallet = { user_id: string; address: string; asset_code: string; is_primary: boolean | null };
      const walletRows = (wallets ?? []) as LinkedWallet[];
      const requestedWallet = String(body.buyerWallet ?? "").trim();
      const linkedWallet = requestedWallet
        ? walletRows.find((w) => String(w.address) === requestedWallet)
        : walletRows[0];
      if (!linkedWallet) throw new Error("Choose a wallet already linked to your TrustLayer account for this settlement asset.");
      const wallet = String(linkedWallet.address);
      await authorizeAgentDealExecution({
        client: supabase, transactionId: id, scope: "deal:create", assetCode,
        settlementType: "solana_escrow", walletAddress: wallet,
      });
      settlement = { adapter: settlementType, rail, assetCode, amount, amountUsd, quote, walletAddress: wallet };
      createInput = {
        title: String(tx.task), description: `${tx.purpose}\n\nDeliverable: ${tx.deliverable}\n\nAcceptance criteria: ${tx.acceptance_criteria}`,
        amount, currency: assetCode, assetCode, rail, origin: "buyer_created", initiatedBy: "buyer",
        counterpartyUserId: tx.seller_owner_user_id, settlementAdapter: "solana_escrow", chain: "solana",
        feeMode: "on_top",
        creatorChecklist: {
          ...checklist, agent_transaction_id: id, agent_agreement_hash: tx.agreement_hash,
          accepted_offer_id: acceptedOffer.id, accepted_offer_snapshot: acceptedOffer,
          agent_source: "trustlayer_agent_network", agent_policy_decision: tx.policy_decision,
          agent_policy_reasons: tx.policy_reasons, agent_policy_snapshot: tx.policy_snapshot,
          agent_instruction: negotiation.instruction, agent_procurement_category: tx.procurement_category,
          agent_settlement_intent: tx.settlement_intent, agent_settlement_intent_hash: tx.settlement_intent_hash,
          settlement_quote: quote, settlement_wallet: wallet, seller_authority_snapshot: negotiation,
        },
      };
    } else {
      const intent = (tx.settlement_intent && typeof tx.settlement_intent === "object") ? tx.settlement_intent as Json : {};
      if (intent.kind !== "atomic_exchange" || intent.adapter !== "solana_ax") {
        throw new Error("Ax is permitted only when both asset legs were included in the accepted agent negotiation. A service-purchase agreement cannot be silently converted into an atomic exchange.");
      }
      const acceptedA = intent.legA as Json | undefined;
      const acceptedB = intent.legB as Json | undefined;
      const legA = body.axLegA as Json | undefined;
      const legB = body.axLegB as Json | undefined;
      if (!legA || !legB) throw new Error("Ax requires two explicit settlement legs.");
      const assetA = String(legA.assetCode ?? "").toUpperCase();
      const assetB = String(legB.assetCode ?? "").toUpperCase();
      if (!["SOL","USDC"].includes(assetA) || !["SOL","USDC"].includes(assetB)) throw new Error("The initial agent Ax bridge supports SOL and USDC legs.");
      const amountA = positiveDecimal(legA.amount, "Ax buyer leg amount", assetA === "SOL" ? 9 : 6);
      const amountB = positiveDecimal(legB.amount, "Ax seller leg amount", assetB === "SOL" ? 9 : 6);
      if (assetA !== String(acceptedA?.assetCode) || assetB !== String(acceptedB?.assetCode) ||
          amountA !== String(acceptedA?.amount) || amountB !== String(acceptedB?.amount)) {
        throw new Error("Ax settlement legs must exactly match the two legs accepted in the agent negotiation.");
      }
      const { data: wallets, error: walletError } = await admin.from("wallets")
        .select("user_id,address,asset_code,is_primary").in("user_id", [tx.owner_user_id, tx.seller_owner_user_id])
        .eq("network", "devnet").order("is_primary", { ascending: false })
        .order("updated_at", { ascending: false });
      if (walletError) throw new Error(`Unable to verify both linked Ax wallets: ${walletError.message}`);
      type LinkedWallet = { user_id: string; address: string; asset_code: string; is_primary: boolean | null };
      const walletRows = (wallets ?? []) as LinkedWallet[];
      const buyerWallets = walletRows.filter((w) => w.user_id === tx.owner_user_id && String(w.asset_code).toUpperCase() === assetA);
      const sellerWallets = walletRows.filter((w) => w.user_id === tx.seller_owner_user_id && String(w.asset_code).toUpperCase() === assetB);
      const requestedBuyerWallet = String(body.partyAWallet || body.buyerWallet || "").trim();
      const selectedBuyerWallet = requestedBuyerWallet
        ? buyerWallets.find((w) => String(w.address) === requestedBuyerWallet)
        : buyerWallets[0];
      if (!selectedBuyerWallet || !sellerWallets[0]) {
        throw new Error("Both parties must link a Devnet wallet for their respective accepted Ax asset before promotion.");
      }
      const buyerWallet = String(selectedBuyerWallet.address);
      // Never accept a seller wallet supplied by the buyer. Bind the seller leg
      // only to a wallet already linked by the seller owner.
      const sellerWallet = String(sellerWallets[0].address);
      await authorizeAgentDealExecution({
        client: supabase, transactionId: id, scope: "deal:create", assetCode: assetA,
        settlementType: "solana_ax", walletAddress: buyerWallet,
      });
      settlement = { adapter: settlementType, rail, amountUsd, partyAWallet: buyerWallet, partyBWallet: sellerWallet, legs: [
        { assetCode: assetA, amount: amountA, role: "buyer" },
        { assetCode: assetB, amount: amountB, role: "seller" },
      ] };
      createInput = {
        title: String(tx.task), description: `${tx.purpose}\n\nDeliverable: ${tx.deliverable}\n\nAcceptance criteria: ${tx.acceptance_criteria}`,
        amount: amountA, currency: assetA, assetCode: assetA, rail, origin: "buyer_created", initiatedBy: "buyer",
        counterpartyUserId: tx.seller_owner_user_id, settlementAdapter: "solana_ax", chain: "solana",
        axLegA: { assetCode: assetA, amount: amountA },
        axLegB: { assetCode: assetB, amount: amountB },
        partyAWallet: buyerWallet, partyBWallet: sellerWallet,
        creatorChecklist: {
          ...checklist, agent_transaction_id: id, agent_agreement_hash: tx.agreement_hash,
          accepted_offer_id: acceptedOffer.id, accepted_offer_snapshot: acceptedOffer,
          agent_source: "trustlayer_agent_network", agent_policy_decision: tx.policy_decision,
          agent_policy_reasons: tx.policy_reasons, agent_policy_snapshot: tx.policy_snapshot,
          agent_instruction: negotiation.instruction, agent_procurement_category: tx.procurement_category,
          agent_settlement_intent: tx.settlement_intent, agent_settlement_intent_hash: tx.settlement_intent_hash,
          settlement_party_a_wallet: buyerWallet, settlement_party_b_wallet: sellerWallet,
          seller_authority_snapshot: negotiation,
        },
      };
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid settlement configuration." }, { status: 400 });
  }

  const { data: lease, error: leaseError } = await supabase.rpc("tl_agent_begin_bridge", { p_transaction_id: id });
  if (leaseError) return NextResponse.json({ error: leaseError.message }, { status: 409 });
  if (lease?.state === "linked") return NextResponse.json({ dealId: lease.deal_id, replayed: true });
  if (lease?.state === "in_progress") return NextResponse.json({ error: "A bridge attempt is already running. Retry after the recovery window if it does not complete." }, { status: 409 });

  try {
    // Recover a deal created by an earlier request that stopped before linking.
    let deal: Deal | null = null;
    const { data: recovered, error: recoveryError } = await admin.from("deals").select("*")
      .contains("creator_checklist", { agent_transaction_id: id }).limit(1).maybeSingle();
    if (recoveryError) throw new Error(`Unable to recover a prior bridge-created deal: ${recoveryError.message}`);
    if (recovered) deal = recovered as unknown as Deal;
    if (!deal) deal = await createDeal(createInput);
    if (!deal?.id) throw new Error("Existing TrustLayer deal creation returned no deal ID.");
    const { data: verifiedDeal, error: verifiedDealError } = await admin.from("deals").select("*").eq("id", deal.id).single();
    if (verifiedDealError || !verifiedDeal) throw new Error(verifiedDealError?.message || "Unable to verify the created TrustLayer deal.");
    const verifiedChecklist = (verifiedDeal.creator_checklist ?? {}) as Record<string, unknown>;
    if (verifiedDeal.buyer_id !== tx.owner_user_id || verifiedDeal.seller_id !== tx.seller_owner_user_id ||
        verifiedChecklist.agent_transaction_id !== id || verifiedChecklist.agent_agreement_hash !== tx.agreement_hash ||
        verifiedDeal.rail !== "crypto" || verifiedDeal.settlement_adapter !== settlementType) {
      throw new Error("Recovered deal does not match the authenticated agent owners, frozen agreement and selected settlement adapter.");
    }
    deal = verifiedDeal as unknown as Deal;
    if (settlementType === "solana_ax") {
      if (!createInput.axLegA || !createInput.axLegB || !createInput.partyAWallet || !createInput.partyBWallet) {
        throw new Error("Ax recovery is missing the accepted two-leg configuration or linked party wallets.");
      }
      await ensureAxDealSettlementLegs({
        dealId: deal.id, legA: createInput.axLegA, legB: createInput.axLegB,
        partyAWallet: createInput.partyAWallet, partyBWallet: createInput.partyBWallet,
        lockedByUserId: user.id, feeMode: createInput.feeMode,
      });
    }
    if (String(deal.status) === "draft") {
      deal = await finalizeDealAgreement(deal.id);
    }

    const { data: linked, error: linkError } = await supabase.rpc("tl_agent_complete_bridge", {
      p_transaction_id: id, p_deal_id: deal.id,
      p_metadata: { negotiation_id: negotiation.id, accepted_offer_id: acceptedOffer.id,
        accepted_offer_snapshot: acceptedOffer,
        original_agreement_hash: tx.agreement_hash, settlement_intent_hash: tx.settlement_intent_hash,
        policy_decision: tx.policy_decision, policy_reasons: tx.policy_reasons,
        policy_snapshot: tx.policy_snapshot, instruction: negotiation.instruction,
        procurement_category: tx.procurement_category, seller_authority: negotiation, settlement },
    });
    if (linkError) throw new Error(linkError.message);
    return NextResponse.json({ transactionId: id, dealId: deal.id, bridge: linked, dealStatus: deal.status, fundingPath: `/deals/${deal.id}` }, { status: 201 });
  } catch (e) {
    await supabase.rpc("tl_agent_fail_bridge", { p_transaction_id: id, p_reason: e instanceof Error ? e.message : "Bridge failed" });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to create TrustLayer deal." }, { status: 500 });
  }
}

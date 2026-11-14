import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { DEVNET_RPC_URL, deriveEscrowPda } from "@/lib/crypto/solana";
import {
  decodeEscrowAccount,
  ESCROW_ACCOUNT_MIN_LEN,
} from "@/lib/crypto/escrow-accounts";

const PROGRAM_ID = new PublicKey(
  "99bimYMBRnPkLjFS8CTVy2aUUyoWNC9rLXpaLqUWr7Lb"
);



const MIN_ESCROW_ACCOUNT_LEN = ESCROW_ACCOUNT_MIN_LEN;

function isValidSignature(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(value);
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      session?: string;
      signature?: string;
      buyerWallet?: string;
      milestoneIndex?: number;
    };

    if (!body.session || !body.signature || !body.buyerWallet) {
      return NextResponse.json(
        { error: "Session, signature, and buyer wallet are required." },
        { status: 400 }
      );
    }

    if (!isValidSignature(body.signature)) {
      return NextResponse.json(
        { error: "Invalid transaction signature." },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const mIndex = Number(body.milestoneIndex ?? 0);
    if (!Number.isInteger(mIndex) || mIndex < 0 || mIndex > 9) {
      return NextResponse.json({ error: "Invalid milestone index." }, { status: 400 });
    }

    const capabilityHash = createHash("sha256")
      .update(body.session, "utf8")
      .digest("hex");

    const admin = createSupabaseAdminClient();
    const { data: session, error: sessionError } = await (admin.rpc as any)(
      "validate_crypto_payment_session",
      {
        p_capability_hash: capabilityHash,
        p_actor_user_id: user.id,
        p_milestone_index: mIndex,
      }
    );

    if (sessionError || !session) {
      return NextResponse.json(
        { error: sessionError?.message || "Invalid crypto session." },
        { status: 403 }
      );
    }
    if (session.action !== "fund") {
      return NextResponse.json({ error: "This crypto session is not authorized for funding." }, { status: 403 });
    }

    const { data: deal, error: dealError } = await admin
      .from("deals")
      .select(
        "id, deal_code, buyer_id, seller_id, rail, asset_code, currency, amount, status, agent_transaction_id, creator_checklist"
      )
      .eq("id", session.deal_id)
      .maybeSingle();

    if (dealError || !deal) {
      return NextResponse.json({ error: "Deal not found." }, { status: 404 });
    }

    if (deal.creator_checklist?.agent_transaction_id && !deal.agent_transaction_id) {
      return NextResponse.json({ error: "This agent-originated deal is not linked yet. Complete the agent-to-deal bridge before funding." }, { status: 409 });
    }
    if (deal.rail !== "crypto" || deal.buyer_id !== user.id) {
      return NextResponse.json(
        { error: "Invalid crypto deal for funding." },
        { status: 400 }
      );
    }

    let buyer: PublicKey;
    try {
      buyer = new PublicKey(body.buyerWallet);
    } catch {
      return NextResponse.json({ error: "Invalid buyer wallet." }, { status: 400 });
    }

    // ========== MILESTONE INDEX FROM BODY (not hard-coded 0) ==========
    const { data: settlement, error: settlementError } = await admin
      .from("crypto_settlements")
      .select("*")
      .eq("deal_id", deal.id)
      .eq("milestone_index", mIndex)
      .maybeSingle();

    if (settlementError || !settlement) {
      return NextResponse.json(
        {
          error: "Crypto settlement is not prepared for this milestone.",
          milestoneIndex: mIndex,
        },
        { status: 400 }
      );
    }

    if (settlement.program_id !== PROGRAM_ID.toBase58()) {
      return NextResponse.json(
        {
          error:
            "Settlement program does not match the deployed TrustLayer program.",
        },
        { status: 409 }
      );
    }

    if (settlement.buyer_wallet !== buyer.toBase58()) {
      return NextResponse.json(
        {
          error: "Connected buyer wallet does not match this escrow.",
          connected: buyer.toBase58(),
          expected: settlement.buyer_wallet,
        },
        { status: 403 }
      );
    }

    if (settlement.onchain_status !== "created_unfunded" || settlement.funded) {
      if (settlement.onchain_status === "funded" || settlement.funded) {
        return NextResponse.json({
          verified: true,
          status: "funded",
          alreadyFunded: true,
          escrowPda: settlement.escrow_pda,
          totalLocked: String(settlement.total_locked ?? "0"),
          milestoneIndex: mIndex,
        });
      }

      return NextResponse.json(
        { error: "This escrow is not ready to be funded." },
        { status: 409 }
      );
    }

    // PDA seed = initiator (buyer-created: initiator === buyer)
    let initiator: PublicKey;
    try {
      initiator = new PublicKey(
        String(settlement.initiator_wallet || settlement.buyer_wallet)
      );
    } catch {
      initiator = buyer;
    }

    const settlementMIndex = Number(settlement.milestone_index ?? mIndex);
    const [escrowPda] = deriveEscrowPda(
      initiator,
      String(settlement.chain_deal_id),
      settlementMIndex
    );

    if (
      settlement.escrow_pda &&
      settlement.escrow_pda !== escrowPda.toBase58()
    ) {
      return NextResponse.json(
        {
          error:
            "Stored escrow PDA does not match initiator + chain deal ID + milestone.",
          stored: settlement.escrow_pda,
          derived: escrowPda.toBase58(),
        },
        { status: 409 }
      );
    }

    const connection = new Connection(DEVNET_RPC_URL, "confirmed");
    const account = await connection.getAccountInfo(escrowPda, "confirmed");

    if (!account || !account.owner.equals(PROGRAM_ID)) {
      return NextResponse.json(
        { error: "The TrustLayer escrow account was not found on Devnet." },
        { status: 409 }
      );
    }

    const raw = Buffer.from(account.data);

    if (raw.length < MIN_ESCROW_ACCOUNT_LEN) {
      console.error("fund account debug (too short)", {
        length: raw.length,
        expectedMin: MIN_ESCROW_ACCOUNT_LEN,
        escrowPda: escrowPda.toBase58(),
      });
      return NextResponse.json(
        { error: "Invalid TrustLayer escrow account.", length: raw.length },
        { status: 409 }
      );
    }

    const chain = decodeEscrowAccount(raw);

    console.error("fund account debug", {
      length: raw.length,
      dealId: chain.dealId,
      milestoneIndex: chain.milestoneIndex,
      initiator: chain.initiator,
      buyer: chain.buyer,
      seller: chain.seller,
      assetType: chain.assetType,
      amount: chain.amount,
      funded: chain.funded,
      totalLocked: chain.totalLocked,
      status: chain.status,
      connected: buyer.toBase58(),
      settlementBuyer: settlement.buyer_wallet,
      settlementInitiator: settlement.initiator_wallet,
      requestedMilestoneIndex: mIndex,
    });

    if (chain.dealId !== String(settlement.chain_deal_id)) {
      return NextResponse.json(
        { error: "On-chain deal ID does not match the TrustLayer settlement." },
        { status: 409 }
      );
    }

    if (Number(chain.milestoneIndex) !== settlementMIndex) {
      return NextResponse.json(
        {
          error: "On-chain milestone index does not match the settlement.",
          onchain: chain.milestoneIndex,
          expected: settlementMIndex,
        },
        { status: 409 }
      );
    }

    const buyerMatches =
      chain.buyer === buyer.toBase58() ||
      chain.initiator === buyer.toBase58() ||
      chain.initiator === initiator.toBase58();

    if (!buyerMatches) {
      return NextResponse.json(
        {
          error: "On-chain buyer does not match the connected wallet.",
          connected: buyer.toBase58(),
          onchainBuyer: chain.buyer,
          onchainInitiator: chain.initiator,
        },
        { status: 409 }
      );
    }

    if (BigInt(chain.amount) !== BigInt(String(settlement.amount_base_units))) {
      return NextResponse.json(
        {
          error: "On-chain amount does not match the TrustLayer settlement.",
          onchain: chain.amount,
          expected: String(settlement.amount_base_units),
        },
        { status: 409 }
      );
    }

    const statusResult = await connection.getSignatureStatuses([body.signature]);
    const txStatus = statusResult.value[0];

    if (!txStatus || txStatus.err) {
      return NextResponse.json(
        {
          error:
            "The submitted funding transaction was not confirmed successfully.",
        },
        { status: 409 }
      );
    }

    const transaction = await connection.getTransaction(body.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!transaction || transaction.meta?.err) {
      return NextResponse.json(
        { error: "Unable to inspect the submitted funding transaction." },
        { status: 409 }
      );
    }

    // Log strings vary by program deploy; do not reject on logs alone.
    // Primary proof: confirmed signature + PDA funded + locked amount (below).
    const fundingLogPresent =
      transaction.meta?.logMessages?.some(
        (message) =>
          message.includes("Buyer escrow funded") ||
          message.includes("SPL buyer escrow funded") ||
          message.toLowerCase().includes("escrow funded") ||
          message.includes("Instruction: Fund") ||
          message.includes("Instruction: FundSpl")
      ) ?? false;

    const fundedAccount = await connection.getAccountInfo(escrowPda, "confirmed");
    if (!fundedAccount) {
      return NextResponse.json(
        { error: "The escrow account disappeared while verifying funding." },
        { status: 409 }
      );
    }

    const fundedRaw = Buffer.from(fundedAccount.data);
    if (fundedRaw.length < MIN_ESCROW_ACCOUNT_LEN) {
      return NextResponse.json(
        {
          error: "Invalid TrustLayer escrow account after funding.",
          length: fundedRaw.length,
        },
        { status: 409 }
      );
    }

    const after = decodeEscrowAccount(fundedRaw);

    const totalLocked =
      BigInt(String(settlement.amount_base_units)) +
      BigInt(String(settlement.settlement_fee_amount ?? "0"));

    if (!after.funded) {
      return NextResponse.json(
        {
          error:
            "The submitted transaction did not leave the escrow in a funded state.",
          fundingLogPresent,
          logs: transaction.meta?.logMessages ?? [],
        },
        { status: 409 }
      );
    }

    if (BigInt(after.totalLocked) !== totalLocked) {
      return NextResponse.json(
        {
          error:
            "On-chain funding state does not match the expected locked amount.",
          expected: totalLocked.toString(),
          actual: after.totalLocked,
        },
        { status: 409 }
      );
    }

    // Update THIS milestone settlement only
    const { error: settlementUpdateError } = await admin
      .from("crypto_settlements")
      .update({
        funded: true,
        total_locked: totalLocked.toString(),
        onchain_status: "funded",
        last_tx_signature: body.signature,
        last_verified_at: new Date().toISOString(),
        escrow_pda: escrowPda.toBase58(),
        fund_tx_signature: body.signature,
      })
      .eq("id", settlement.id);

    if (settlementUpdateError) {
      return NextResponse.json(
        {
          error:
            "Escrow was funded, but TrustLayer could not record the funding verification.",
        },
        { status: 500 }
      );
    }

    // ========== DEAL STATUS: funded only when ALL milestones are funded ==========
    const { data: allRows } = await admin
      .from("crypto_settlements")
      .select("funded, onchain_status, milestone_index")
      .eq("deal_id", deal.id);

    const everyFunded =
      (allRows?.length ?? 0) > 0 &&
      allRows!.every(
        (row) =>
          row.funded === true ||
          row.onchain_status === "funded" ||
          row.onchain_status === "released" ||
          row.onchain_status === "cancelled"
      );

    if (everyFunded) {
      const { error: dealUpdateError } = await admin
        .from("deals")
        .update({ status: "funded" })
        .eq("id", deal.id)
        .in("status", ["accepted", "awaiting_payment"]);

      if (dealUpdateError) {
        console.error("Deal funding status update failed:", dealUpdateError);
      }
    } else {
      // Keep / force awaiting_payment while any milestone is still open
      const { error: dealUpdateError } = await admin
        .from("deals")
        .update({ status: "awaiting_payment" })
        .eq("id", deal.id)
        .in("status", ["accepted", "awaiting_payment", "funded"]);

      if (dealUpdateError) {
        console.error(
          "Deal awaiting_payment status update failed:",
          dealUpdateError
        );
      }
    }

    await admin.from("crypto_sessions").update({ status: "used", used_at: new Date().toISOString() }).eq("id", session.id);

    await admin.from("deal_events").insert({
      deal_id: deal.id,
      actor_user_id: user.id,
      actor_type: "user",
      event_type: "crypto_fund_verified",
      metadata: {
        signature: body.signature,
        escrow_pda: escrowPda.toBase58(),
        chain_deal_id: settlement.chain_deal_id,
        total_locked: totalLocked.toString(),
        milestone_index: settlementMIndex,
        all_milestones_funded: everyFunded,
      },
    });

    if ((deal as { agent_transaction_id?: string | null }).agent_transaction_id) {
      const { error: agentSyncError } = await admin.rpc("tl_agent_sync_verified_deal", {
        p_deal_id: deal.id, p_chain_state: "funded", p_signature: body.signature,
      });
      if (agentSyncError) console.error("Agent deal funding sync failed:", agentSyncError.message);
    }

    return NextResponse.json({
      verified: true,
      status: "funded",
      escrowPda: escrowPda.toBase58(),
      chainDealId: settlement.chain_deal_id,
      totalLocked: totalLocked.toString(),
      milestoneIndex: settlementMIndex,
      dealFullyFunded: everyFunded,
    });
  } catch (error) {
    console.error("Crypto funding verification failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to verify escrow funding.",
      },
      { status: 500 }
    );
  }
}
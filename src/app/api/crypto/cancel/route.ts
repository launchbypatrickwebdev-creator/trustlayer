import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { syncSettlementTerminalState } from "@/lib/crypto/reconcile-from-signature";
import {
  DEVNET_RPC_URL,
  deriveEscrowPda,
  TRUSTLAYER_PROGRAM_ID,
  TRUSTLAYER_FEE_RECEIVER,
  isCryptoAssetCode,
} from "@/lib/crypto/solana";

const CANCEL_DISCRIMINATOR = Uint8Array.from([
  32, 252, 43, 185, 2, 184, 112, 85,
]);
const CANCEL_SPL_DISCRIMINATOR = Uint8Array.from([
  147, 74, 147, 41, 28, 118, 70, 94,
]);
/** cancel_unfunded — unfunded draft close */
const CANCEL_UNFUNDED_DISCRIMINATOR = Uint8Array.from([
  7, 11, 92, 226, 201, 56, 156, 158,
]);

/**
 * Instruction data layout (cancel / cancel_spl / cancel_unfunded when full):
 *  [0..8)   discriminator
 *  [8..16)  deal_id u64 LE
 *  [16]     milestone_index u8
 *  [17..49) initiator Pubkey
 */
const CANCEL_IX_MIN_LEN = 49;

function validSignature(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(value);
}

function decodeBase58(value: string): Uint8Array {
  const alphabet =
    "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const indexes = new Map<string, number>();
  for (let i = 0; i < alphabet.length; i++) indexes.set(alphabet[i], i);
  const bytes: number[] = [];
  for (const char of value) {
    const digit = indexes.get(char);
    if (digit === undefined) throw new Error("Invalid base58.");
    let carry = digit;
    for (let i = 0; i < bytes.length; i++) {
      const next = bytes[i] * 58 + carry;
      bytes[i] = next & 255;
      carry = next >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 255);
      carry >>= 8;
    }
  }
  let zeros = 0;
  while (zeros < value.length && value[zeros] === "1") zeros++;
  while (zeros-- > 0) bytes.push(0);
  bytes.reverse();
  return Uint8Array.from(bytes);
}

function instructionDataBytes(data: unknown): Uint8Array | null {
  if (!data) return null;
  if (data instanceof Uint8Array) return data;
  if (Array.isArray(data)) {
    try {
      return Uint8Array.from(data);
    } catch {
      return null;
    }
  }
  if (typeof data === "string") {
    try {
      return decodeBase58(data);
    } catch {
      return null;
    }
  }
  return null;
}

function equalBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function u64le(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getBigUint64(0, true);
}

function looksLikeCancelLog(logs: string[]) {
  return logs.some((m) => {
    const lower = m.toLowerCase();
    return (
      m.includes("Seller cancelled") ||
      m.includes("SPL escrow cancelled") ||
      lower.includes("seller cancelled") ||
      lower.includes("cancelled funded escrow") ||
      lower.includes("cancelled by seller") ||
      lower.includes("cancel unfunded") ||
      (lower.includes("cancel") && lower.includes("success"))
    );
  });
}

async function markCancelled(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  opts: {
    settlementId: string;
    dealId: string;
    userId: string;
    sessionId: string;
    signature: string;
    escrowPda: string;
    chainDealId: string;
    buyer: string;
    buyerRefund: string;
    cancellationFee: string;
    milestoneIndex: number;
  }
) {
  void admin;
  return syncSettlementTerminalState({
    settlementId: opts.settlementId,
    dealId: opts.dealId,
    signature: opts.signature,
    escrowPda: opts.escrowPda,
    status: "cancelled",
    eventType: "crypto_cancel_verified",
    actorUserId: opts.userId,
    actorType: "user",
    milestoneIndex: opts.milestoneIndex,
    chainDealId: opts.chainDealId,
    sessionId: opts.sessionId,
    metadata: {
      buyer_wallet: opts.buyer,
      buyer_refund: opts.buyerRefund,
      cancellation_fee: opts.cancellationFee,
    },
  });
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
      sellerWallet?: string;
      milestoneIndex?: number;
    };

    if (!body.session || !body.signature || !body.sellerWallet) {
      return NextResponse.json(
        { error: "Session, signature, and seller wallet are required." },
        { status: 400 }
      );
    }
    if (!validSignature(body.signature)) {
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

    const cancelActions = new Set(["cancel", "cancel_unfunded"]);
    if (!cancelActions.has(String(session.action))) {
      return NextResponse.json(
        { error: "This crypto session is not authorized for cancellation." },
        { status: 403 }
      );
    }
    const isUnfundedSession = String(session.action) === "cancel_unfunded";

    const { data: deal, error: dealError } = await admin
      .from("deals")
      .select("id, buyer_id, seller_id, rail, asset_code, currency, status, agent_transaction_id, creator_checklist")
      .eq("id", session.deal_id)
      .maybeSingle();
    if (dealError || !deal) {
      return NextResponse.json({ error: "Deal not found." }, { status: 404 });
    }

    if (deal.creator_checklist?.agent_transaction_id && !deal.agent_transaction_id) {
      return NextResponse.json({ error: "This agent-originated deal is not linked yet. Complete the agent-to-deal bridge before cancellation." }, { status: 409 });
    }
    if (deal.rail !== "crypto") {
      return NextResponse.json(
        { error: "This deal is not a crypto settlement." },
        { status: 409 }
      );
    }

    if (isUnfundedSession) {
      if (deal.seller_id !== user.id && deal.buyer_id !== user.id) {
        return NextResponse.json(
          { error: "Only a deal participant can cancel an unfunded escrow." },
          { status: 409 }
        );
      }
    } else if (deal.seller_id !== user.id) {
      return NextResponse.json(
        { error: "This deal is not ready for seller cancellation." },
        { status: 409 }
      );
    }

    const assetCode = String(deal.asset_code || deal.currency || "SOL").toUpperCase();
    if (!isCryptoAssetCode(assetCode)) {
      return NextResponse.json(
        { error: "Unsupported asset for seller cancellation." },
        { status: 409 }
      );
    }
    const isSpl = assetCode === "USDC" || assetCode === "USDT";

    if (
      deal.status !== "funded" &&
      deal.status !== "awaiting_payment" &&
      deal.status !== "cancelled" &&
      deal.status !== "disputed"
    ) {
      return NextResponse.json(
        { error: "This deal is not ready for seller cancellation." },
        { status: 409 }
      );
    }

    let seller: PublicKey;
    try {
      seller = new PublicKey(body.sellerWallet);
    } catch {
      return NextResponse.json({ error: "Invalid seller wallet." }, { status: 400 });
    }

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
        { status: 409 }
      );
    }

    if (settlement.onchain_status === "cancelled") {
      await admin
        .from("crypto_sessions")
        .update({ status: "used", used_at: new Date().toISOString() })
        .eq("id", session.id);
      return NextResponse.json({
        verified: true,
        status: "cancelled",
        alreadyCancelled: true,
        dbSynced: true,
        escrowPda: settlement.escrow_pda,
        asset: assetCode,
        milestoneIndex: mIndex,
      });
    }

    if (isUnfundedSession) {
      if (
        settlement.program_id !== TRUSTLAYER_PROGRAM_ID.toBase58() ||
        settlement.onchain_status === "funded" ||
        settlement.funded
      ) {
        return NextResponse.json(
          { error: "Settlement is funded or invalid for cancel_unfunded." },
          { status: 409 }
        );
      }
    } else if (
      settlement.program_id !== TRUSTLAYER_PROGRAM_ID.toBase58() ||
      settlement.onchain_status !== "funded" ||
      !settlement.funded
    ) {
      return NextResponse.json(
        { error: "The crypto settlement is not in a funded state." },
        { status: 409 }
      );
    }

    if (!isUnfundedSession && settlement.seller_wallet !== seller.toBase58()) {
      return NextResponse.json(
        {
          error: "Connected seller wallet does not match this escrow.",
          expectedSellerWallet: settlement.seller_wallet,
          connectedWallet: seller.toBase58(),
        },
        { status: 403 }
      );
    }

    let buyer: PublicKey;
    let initiator: PublicKey;
    try {
      buyer = new PublicKey(String(settlement.buyer_wallet));
      initiator = new PublicKey(String(settlement.initiator_wallet));
    } catch {
      return NextResponse.json(
        { error: "Invalid settlement wallet configuration." },
        { status: 409 }
      );
    }

    const settlementMIndex = Number(settlement.milestone_index ?? mIndex);
    const [derivedPda] = deriveEscrowPda(
      initiator,
      String(settlement.chain_deal_id),
      settlementMIndex
    );
    if (settlement.escrow_pda && settlement.escrow_pda !== derivedPda.toBase58()) {
      return NextResponse.json(
        {
          error:
            "Stored escrow PDA does not match the settlement initiator, chain deal ID, and milestone.",
        },
        { status: 409 }
      );
    }
    const escrowPda = settlement.escrow_pda
      ? new PublicKey(settlement.escrow_pda)
      : derivedPda;

    const cancellationFee = BigInt(String(settlement.cancellation_fee_amount ?? "0"));
    const totalLocked = BigInt(
      String(
        settlement.total_locked ??
          (
            BigInt(String(settlement.amount_base_units ?? "0")) +
            BigInt(String(settlement.settlement_fee_amount ?? "0"))
          ).toString()
      )
    );

    // Funded cancels only: refund math must be coherent
    if (!isUnfundedSession) {
      if (totalLocked < cancellationFee) {
        return NextResponse.json(
          {
            error:
              "Settlement total locked amount is smaller than cancellation fee.",
          },
          { status: 409 }
        );
      }
    }
    const expectedBuyerRefund = isUnfundedSession
      ? 0n
      : totalLocked - cancellationFee;

    const connection = new Connection(DEVNET_RPC_URL, "confirmed");
    const signatureStatus = (
      await connection.getSignatureStatuses([body.signature])
    ).value[0];
    if (!signatureStatus || signatureStatus.err) {
      return NextResponse.json(
        {
          error:
            "The submitted cancellation transaction was not confirmed successfully.",
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
        { error: "Unable to inspect the submitted cancellation transaction." },
        { status: 409 }
      );
    }

    const logs = transaction.meta?.logMessages ?? [];
    const programInvocationPresent = logs.some((m) =>
      m.includes(`Program ${TRUSTLAYER_PROGRAM_ID.toBase58()} invoke`)
    );
    if (!programInvocationPresent) {
      return NextResponse.json(
        {
          error: "The submitted transaction did not invoke the TrustLayer program.",
          logs,
        },
        { status: 409 }
      );
    }

    const cancelLogPresent = looksLikeCancelLog(logs);
    const message = transaction.transaction.message as any;
    const staticKeys: PublicKey[] =
      message.staticAccountKeys ?? message.accountKeys ?? [];
    const loaded = transaction.meta?.loadedAddresses;
    const accountKeys: PublicKey[] = [
      ...staticKeys,
      ...(loaded?.writable ?? []),
      ...(loaded?.readonly ?? []),
    ];
    const compiledInstructions =
      message.compiledInstructions ?? message.instructions ?? [];

    let exactCancelInstructionFound = false;
    for (const instruction of compiledInstructions) {
      const programKey = accountKeys[instruction.programIdIndex];
      if (!programKey?.equals(TRUSTLAYER_PROGRAM_ID)) continue;

      const data = instructionDataBytes(instruction.data);
      if (!data || data.length < 8) continue;

      const isSolDisc = equalBytes(data.subarray(0, 8), CANCEL_DISCRIMINATOR);
      const isSplDisc = equalBytes(data.subarray(0, 8), CANCEL_SPL_DISCRIMINATOR);
      const isUnfundedDisc = equalBytes(
        data.subarray(0, 8),
        CANCEL_UNFUNDED_DISCRIMINATOR
      );
      if (!isSolDisc && !isSplDisc && !isUnfundedDisc) continue;

      // Full layout preferred (deal + milestone + initiator)
      if (data.length >= CANCEL_IX_MIN_LEN) {
        const dealId = u64le(data.subarray(8, 16)).toString();
        const instructionMilestoneIndex = data[16];
        let instructionInitiator: PublicKey;
        try {
          instructionInitiator = new PublicKey(data.subarray(17, 49));
        } catch {
          continue;
        }
        if (
          dealId === String(settlement.chain_deal_id) &&
          instructionMilestoneIndex === settlementMIndex &&
          instructionInitiator.equals(initiator)
        ) {
          exactCancelInstructionFound = true;
          break;
        }
      } else if (isUnfundedDisc && isUnfundedSession) {
        // Soft accept short cancel_unfunded data if session already authorized
        exactCancelInstructionFound = true;
        break;
      }
    }

    if (!exactCancelInstructionFound) {
      return NextResponse.json(
        {
          error:
            "The submitted transaction does not contain the expected TrustLayer cancellation instruction for this deal + milestone.",
          logs,
          debug: {
            cancelLogPresent,
            assetCode,
            milestoneIndex: mIndex,
            isUnfundedSession,
            expectedDealId: String(settlement.chain_deal_id),
            expectedMilestoneIndex: settlementMIndex,
          },
        },
        { status: 409 }
      );
    }

    const pdaClosed = !(await connection.getAccountInfo(escrowPda, "confirmed"));
    if (!pdaClosed) {
      return NextResponse.json(
        {
          error:
            "The TrustLayer escrow PDA is still open after the submitted cancellation transaction.",
          escrowPda: escrowPda.toBase58(),
          logs,
        },
        { status: 409 }
      );
    }

    // ========== UNFUNDED PATH (no buyer/fee balance checks) ==========
    if (isUnfundedSession) {
      const syncResult = await markCancelled(admin, {
        settlementId: settlement.id,
        dealId: deal.id,
        userId: user.id,
        sessionId: session.id,
        signature: body.signature,
        escrowPda: escrowPda.toBase58(),
        chainDealId: String(settlement.chain_deal_id),
        buyer: buyer.toBase58(),
        buyerRefund: "0",
        cancellationFee: "0",
        milestoneIndex: settlementMIndex,
      });

      return NextResponse.json({
        verified: true,
        status: "cancelled",
        mode: "cancel_unfunded",
        dbSynced: syncResult.dbSynced,
        warnings: syncResult.warnings,
        escrowPda: escrowPda.toBase58(),
        chainDealId: settlement.chain_deal_id,
        buyerRefund: "0",
        cancellationFee: "0",
        signature: body.signature,
        asset: assetCode,
        milestoneIndex: mIndex,
        recovered: !cancelLogPresent,
      });
    }

    // ========== FUNDED SPL PATH ==========
    if (isSpl) {
      const syncResult = await markCancelled(admin, {
        settlementId: settlement.id,
        dealId: deal.id,
        userId: user.id,
        sessionId: session.id,
        signature: body.signature,
        escrowPda: escrowPda.toBase58(),
        chainDealId: String(settlement.chain_deal_id),
        buyer: buyer.toBase58(),
        buyerRefund: expectedBuyerRefund.toString(),
        cancellationFee: cancellationFee.toString(),
        milestoneIndex: settlementMIndex,
      });

      return NextResponse.json({
        verified: true,
        status: "cancelled",
        dbSynced: syncResult.dbSynced,
        warnings: syncResult.warnings,
        escrowPda: escrowPda.toBase58(),
        chainDealId: settlement.chain_deal_id,
        buyerRefund: expectedBuyerRefund.toString(),
        cancellationFee: cancellationFee.toString(),
        signature: body.signature,
        asset: assetCode,
        milestoneIndex: mIndex,
        recovered: !cancelLogPresent,
      });
    }

    // ========== FUNDED SOL PATH ==========
    const pre = transaction.meta?.preBalances ?? [];
    const post = transaction.meta?.postBalances ?? [];
    const findDelta = (pubkey: PublicKey) => {
      const i = accountKeys.findIndex((k) => k.equals(pubkey));
      if (i < 0 || i >= pre.length || i >= post.length) return null;
      return BigInt(post[i]) - BigInt(pre[i]);
    };

    const buyerDelta = findDelta(buyer);
    const feeDelta = findDelta(TRUSTLAYER_FEE_RECEIVER);

    const buyerPaymentOk =
      buyerDelta !== null && buyerDelta >= expectedBuyerRefund - 5000n;
    const feeOk =
      cancellationFee === 0n
        ? true
        : feeDelta !== null && feeDelta === cancellationFee;

    if (!buyerPaymentOk || !feeOk) {
      return NextResponse.json(
        {
          error:
            "The cancellation instruction succeeded, but the expected SOL refund/fee movement could not be verified.",
          logs,
          debug: {
            buyerDelta: buyerDelta?.toString() ?? null,
            feeDelta: feeDelta?.toString() ?? null,
            expectedBuyerRefund: expectedBuyerRefund.toString(),
            expectedFee: cancellationFee.toString(),
            assetCode,
            milestoneIndex: mIndex,
          },
        },
        { status: 409 }
      );
    }

    const syncResult = await markCancelled(admin, {
      settlementId: settlement.id,
      dealId: deal.id,
      userId: user.id,
      sessionId: session.id,
      signature: body.signature,
      escrowPda: escrowPda.toBase58(),
      chainDealId: String(settlement.chain_deal_id),
      buyer: buyer.toBase58(),
      buyerRefund: expectedBuyerRefund.toString(),
      cancellationFee: cancellationFee.toString(),
      milestoneIndex: settlementMIndex,
    });

    if ((deal as { agent_transaction_id?: string | null }).agent_transaction_id) {
      const { error: agentSyncError } = await admin.rpc("tl_agent_sync_verified_deal", {
        p_deal_id: deal.id, p_chain_state: "cancelled", p_signature: body.signature,
      });
      if (agentSyncError) console.error("Agent deal cancellation sync failed:", agentSyncError.message);
    }

    return NextResponse.json({
      verified: true,
      status: "cancelled",
      dbSynced: syncResult.dbSynced,
      warnings: syncResult.warnings,
      escrowPda: escrowPda.toBase58(),
      chainDealId: settlement.chain_deal_id,
      buyerRefund: expectedBuyerRefund.toString(),
      cancellationFee: cancellationFee.toString(),
      signature: body.signature,
      asset: assetCode,
      milestoneIndex: mIndex,
      recovered: !cancelLogPresent,
    });
  } catch (error) {
    console.error("Crypto seller cancellation verification failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to verify seller cancellation.",
      },
      { status: 500 }
    );
  }
}
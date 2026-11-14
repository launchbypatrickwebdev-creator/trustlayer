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

const RELEASE_DISCRIMINATOR = Uint8Array.from([
  253, 249, 15, 206, 28, 127, 193, 241,
]);

const RELEASE_SPL_DISCRIMINATOR = Uint8Array.from([
  115, 22, 93, 89, 235, 139, 53, 130,
]);

/** Instruction data layout (release / release_spl):
 *  [0..8)  discriminator
 *  [8..16) deal_id u64 LE
 *  [16]    milestone_index u8
 *  [17..49) initiator Pubkey
 */
const RELEASE_IX_MIN_LEN = 49;

function isValidSignature(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(value);
}

function decodeBase58(value: string): Uint8Array {
  const alphabet =
    "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const indexes = new Map<string, number>();
  for (let i = 0; i < alphabet.length; i += 1) indexes.set(alphabet[i], i);

  const bytes: number[] = [];
  for (const char of value) {
    const digit = indexes.get(char);
    if (digit === undefined) throw new Error("Invalid base58.");

    let carry = digit;
    for (let i = 0; i < bytes.length; i += 1) {
      const next = bytes[i] * 58 + carry;
      bytes[i] = next & 0xff;
      carry = next >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  let leadingZeros = 0;
  while (leadingZeros < value.length && value[leadingZeros] === "1") {
    leadingZeros += 1;
  }
  while (leadingZeros > 0) {
    bytes.push(0);
    leadingZeros -= 1;
  }

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
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function u64FromLittleEndian(bytes: Uint8Array): bigint {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getBigUint64(0, true);
}

function looksLikeReleaseLog(logs: string[]) {
  return logs.some((m) => {
    const lower = m.toLowerCase();
    return (
      m.includes("Escrow released successfully") ||
      m.includes("SPL escrow released") ||
      lower.includes("released successfully") ||
      lower.includes("escrow released") ||
      (lower.includes("release") && lower.includes("success"))
    );
  });
}

async function markReleased(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  opts: {
    settlementId: string;
    dealId: string;
    userId: string;
    sessionId: string;
    signature: string;
    escrowPda: string;
    chainDealId: string;
    seller: string;
    amount: string;
    settlementFee: string;
    milestoneIndex: number;
  }
) {
  void admin;
  return syncSettlementTerminalState({
    settlementId: opts.settlementId,
    dealId: opts.dealId,
    signature: opts.signature,
    escrowPda: opts.escrowPda,
    status: "released",
    eventType: "crypto_release_verified",
    actorUserId: opts.userId,
    actorType: "user",
    milestoneIndex: opts.milestoneIndex,
    chainDealId: opts.chainDealId,
    sessionId: opts.sessionId,
    metadata: {
      seller_wallet: opts.seller,
      seller_amount: opts.amount,
      settlement_fee: opts.settlementFee,
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

    if (session.action !== "release" || session.role !== "buyer") {
      return NextResponse.json(
        { error: "This crypto session is not authorized for release." },
        { status: 403 }
      );
    }

    const { data: deal, error: dealError } = await admin
      .from("deals")
      .select("id, deal_code, buyer_id, seller_id, rail, asset_code, currency, status, agent_transaction_id, creator_checklist")
      .eq("id", session.deal_id)
      .maybeSingle();

    if (dealError || !deal) {
      return NextResponse.json({ error: "Deal not found." }, { status: 404 });
    }

    if (deal.creator_checklist?.agent_transaction_id && !deal.agent_transaction_id) {
      return NextResponse.json({ error: "This agent-originated deal is not linked yet. Complete the agent-to-deal bridge before release." }, { status: 409 });
    }
    if (deal.rail !== "crypto" || deal.buyer_id !== user.id) {
      return NextResponse.json(
        { error: "This deal is not ready for crypto release." },
        { status: 409 }
      );
    }

    const assetCode = String(deal.asset_code || deal.currency || "SOL").toUpperCase();
    if (!isCryptoAssetCode(assetCode)) {
      return NextResponse.json(
        { error: "Unsupported asset for release." },
        { status: 409 }
      );
    }
    const isSpl = assetCode === "USDC" || assetCode === "USDT";

    if (
      deal.status !== "funded" &&
      deal.status !== "awaiting_payment" &&
      deal.status !== "completed" &&
      deal.status !== "disputed"
    ) {
      return NextResponse.json(
        { error: "This deal is not ready for crypto release." },
        { status: 409 }
      );
    }

    let buyer: PublicKey;
    try {
      buyer = new PublicKey(body.buyerWallet);
    } catch {
      return NextResponse.json({ error: "Invalid buyer wallet." }, { status: 400 });
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

    if (settlement.onchain_status === "released") {
      await admin
        .from("crypto_sessions")
        .update({ status: "used", used_at: new Date().toISOString() })
        .eq("id", session.id);
      return NextResponse.json({
        verified: true,
        status: "completed",
        alreadyReleased: true,
        dbSynced: true,
        escrowPda: settlement.escrow_pda,
        asset: assetCode,
        milestoneIndex: mIndex,
      });
    }

    if (
      settlement.program_id !== TRUSTLAYER_PROGRAM_ID.toBase58() ||
      settlement.onchain_status !== "funded" ||
      !settlement.funded
    ) {
      return NextResponse.json(
        { error: "The crypto settlement is not in a funded state." },
        { status: 409 }
      );
    }

    let seller: PublicKey;
    let initiator: PublicKey;
    try {
      seller = new PublicKey(String(settlement.seller_wallet));
      initiator = new PublicKey(String(settlement.initiator_wallet));
    } catch {
      return NextResponse.json(
        { error: "Invalid settlement wallet configuration." },
        { status: 409 }
      );
    }

    if (settlement.buyer_wallet !== buyer.toBase58()) {
      return NextResponse.json(
        { error: "Connected buyer wallet does not match this escrow." },
        { status: 403 }
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

    const amount = BigInt(String(settlement.amount_base_units));
    const settlementFee = BigInt(String(settlement.settlement_fee_amount ?? "0"));

    const connection = new Connection(DEVNET_RPC_URL, "confirmed");

    const statusResult = await connection.getSignatureStatuses([body.signature]);
    const signatureStatus = statusResult.value[0];
    if (!signatureStatus || signatureStatus.err) {
      return NextResponse.json(
        {
          error:
            "The submitted release transaction was not confirmed successfully.",
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
        { error: "Unable to inspect the submitted release transaction." },
        { status: 409 }
      );
    }

    const logs = transaction.meta?.logMessages ?? [];
    const programInvocationPresent = logs.some((message) =>
      message.includes(`Program ${TRUSTLAYER_PROGRAM_ID.toBase58()} invoke`)
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

    const releaseLogPresent = looksLikeReleaseLog(logs);

    const message = transaction.transaction.message as any;
    const staticKeys: PublicKey[] =
      message.staticAccountKeys ?? message.accountKeys ?? [];
    const loadedAddresses = transaction.meta?.loadedAddresses;
    const accountKeys: PublicKey[] = [
      ...staticKeys,
      ...(loadedAddresses?.writable ?? []),
      ...(loadedAddresses?.readonly ?? []),
    ];

    const compiledInstructions =
      message.compiledInstructions ?? message.instructions ?? [];

    let exactReleaseInstructionFound = false;

    for (const instruction of compiledInstructions) {
      const programKey = accountKeys[instruction.programIdIndex];
      if (!programKey || !programKey.equals(TRUSTLAYER_PROGRAM_ID)) continue;

      const data = instructionDataBytes(instruction.data);
      if (!data || data.length < RELEASE_IX_MIN_LEN) continue;

      const isSolDisc = equalBytes(data.subarray(0, 8), RELEASE_DISCRIMINATOR);
      const isSplDisc = equalBytes(data.subarray(0, 8), RELEASE_SPL_DISCRIMINATOR);

      if (!isSolDisc && !isSplDisc) continue;

      const dealId = u64FromLittleEndian(data.subarray(8, 16)).toString();
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
        exactReleaseInstructionFound = true;
        break;
      }
    }

    if (!exactReleaseInstructionFound) {
      return NextResponse.json(
        {
          error:
            "The submitted transaction does not contain the expected TrustLayer release instruction for this deal + milestone.",
          logs,
          debug: {
            releaseLogPresent,
            assetCode,
            milestoneIndex: mIndex,
            expectedDealId: String(settlement.chain_deal_id),
            expectedMilestoneIndex: settlementMIndex,
          },
        },
        { status: 409 }
      );
    }

    const escrowAfter = await connection.getAccountInfo(escrowPda, "confirmed");
    const pdaClosed = !escrowAfter;
    if (!pdaClosed) {
      return NextResponse.json(
        {
          error:
            "The TrustLayer escrow PDA is still open after the submitted release transaction.",
          escrowPda: escrowPda.toBase58(),
          logs,
        },
        { status: 409 }
      );
    }

    // ========== SPL PATH ==========
    if (isSpl) {
      const syncResult = await markReleased(admin, {
        settlementId: settlement.id,
        dealId: deal.id,
        userId: user.id,
        sessionId: session.id,
        signature: body.signature,
        escrowPda: escrowPda.toBase58(),
        chainDealId: String(settlement.chain_deal_id),
        seller: seller.toBase58(),
        amount: amount.toString(),
        settlementFee: settlementFee.toString(),
        milestoneIndex: settlementMIndex,
      });

      return NextResponse.json({
        verified: true,
        status: "completed",
      dbSynced: syncResult.dbSynced,
      warnings: syncResult.warnings,
        escrowPda: escrowPda.toBase58(),
        chainDealId: settlement.chain_deal_id,
        sellerAmount: amount.toString(),
        settlementFee: settlementFee.toString(),
        signature: body.signature,
        asset: assetCode,
        milestoneIndex: mIndex,
        recovered: !releaseLogPresent,
      });
    }

    // ========== SOL PATH ==========
    const preBalances = transaction.meta?.preBalances ?? [];
    const postBalances = transaction.meta?.postBalances ?? [];

    const findBalanceDelta = (pubkey: PublicKey) => {
      const index = accountKeys.findIndex((key) => key.equals(pubkey));
      if (index < 0 || index >= preBalances.length || index >= postBalances.length) {
        return null;
      }
      return BigInt(postBalances[index]) - BigInt(preBalances[index]);
    };

    const sellerDelta = findBalanceDelta(seller);
    const feeDelta = findBalanceDelta(TRUSTLAYER_FEE_RECEIVER);

    const paymentsOk =
      sellerDelta !== null &&
      sellerDelta === amount &&
      feeDelta !== null &&
      feeDelta === settlementFee;

    if (!paymentsOk) {
      return NextResponse.json(
        {
          error:
            "The release instruction succeeded, but the expected SOL seller payment and fee movement could not be verified.",
          logs,
          debug: {
            releaseLogPresent,
            sellerDelta: sellerDelta?.toString() ?? null,
            feeDelta: feeDelta?.toString() ?? null,
            expectedAmount: amount.toString(),
            expectedFee: settlementFee.toString(),
            assetCode,
            milestoneIndex: mIndex,
          },
        },
        { status: 409 }
      );
    }

    const syncResult = await markReleased(admin, {
      settlementId: settlement.id,
      dealId: deal.id,
      userId: user.id,
      sessionId: session.id,
      signature: body.signature,
      escrowPda: escrowPda.toBase58(),
      chainDealId: String(settlement.chain_deal_id),
      seller: seller.toBase58(),
      amount: amount.toString(),
      settlementFee: settlementFee.toString(),
      milestoneIndex: settlementMIndex,
    });

    if ((deal as { agent_transaction_id?: string | null }).agent_transaction_id) {
      const { error: agentSyncError } = await admin.rpc("tl_agent_sync_verified_deal", {
        p_deal_id: deal.id, p_chain_state: "released", p_signature: body.signature,
      });
      if (agentSyncError) console.error("Agent deal release sync failed:", agentSyncError.message);
    }

    return NextResponse.json({
      verified: true,
      status: "completed",
      escrowPda: escrowPda.toBase58(),
      chainDealId: settlement.chain_deal_id,
      sellerAmount: amount.toString(),
      settlementFee: settlementFee.toString(),
      signature: body.signature,
      asset: assetCode,
      milestoneIndex: mIndex,
      recovered: !releaseLogPresent,
    });
  } catch (error) {
    console.error("Crypto release verification failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to verify escrow release.",
      },
      { status: 500 }
    );
  }
}

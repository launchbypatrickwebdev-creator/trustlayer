import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";

import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import {
  DEVNET_RPC_URL,
  deriveEscrowPda,
  TRUSTLAYER_PROGRAM_ID,
  TRUSTLAYER_FEE_RECEIVER,
  isCryptoAssetCode,
} from "@/lib/crypto/solana";
import {
  decodeEscrowAccount,
  ESCROW_ACCOUNT_MIN_LEN,
} from "@/lib/crypto/escrow-accounts";

const MIN_ESCROW_ACCOUNT_LEN = ESCROW_ACCOUNT_MIN_LEN;

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}


export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      session?: string;
      buyerWallet?: string;
      milestoneIndex?: number;
    };

    if (!body.session || !body.buyerWallet) {
      return NextResponse.json(
        { error: "Release session and buyer wallet are required." },
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
      .select(
        "id, deal_code, title, amount, currency, rail, asset_code, buyer_id, seller_id, status"
      )
      .eq("id", session.deal_id)
      .maybeSingle();

    if (dealError || !deal || !isUuid(deal.id)) {
      return NextResponse.json({ error: "Deal not found." }, { status: 404 });
    }

    if (deal.rail !== "crypto" || deal.buyer_id !== user.id) {
      return NextResponse.json(
        { error: "This deal is not ready for crypto release." },
        { status: 409 }
      );
    }

    if (
      deal.status !== "funded" &&
      deal.status !== "awaiting_payment" &&
      deal.status !== "completed" &&
      deal.status !== "disputed"
    ) {
      return NextResponse.json(
        { error: "This deal is not ready for release." },
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
      return NextResponse.json({
        alreadyReleased: true,
        deal: {
          id: deal.id,
          dealCode: deal.deal_code,
          title: deal.title,
          amount: String(deal.amount),
          currency: deal.currency,
          status: deal.status,
        },
        settlement: {
          chainDealId: String(settlement.chain_deal_id),
          escrowPda: settlement.escrow_pda,
          buyerWallet: settlement.buyer_wallet,
          initiatorWallet: settlement.initiator_wallet,
          sellerWallet: settlement.seller_wallet,
          feeReceiver: TRUSTLAYER_FEE_RECEIVER.toBase58(),
          amountBaseUnits: String(settlement.amount_base_units),
          settlementFeeAmount: String(settlement.settlement_fee_amount ?? "0"),
          programId: TRUSTLAYER_PROGRAM_ID.toBase58(),
          systemProgram: SystemProgram.programId.toBase58(),
          status: "released",
          milestoneIndex: Number(settlement.milestone_index ?? mIndex),
          assetCode,
        },
      });
    }

    if (
      settlement.program_id !== TRUSTLAYER_PROGRAM_ID.toBase58() ||
      settlement.onchain_status !== "funded" ||
      !settlement.funded
    ) {
      return NextResponse.json(
        {
          error: "This milestone escrow is not in a funded state.",
          milestoneIndex: mIndex,
          onchain_status: settlement.onchain_status,
        },
        { status: 409 }
      );
    }

    let buyer: PublicKey;
    let seller: PublicKey;
    let initiator: PublicKey;

    try {
      buyer = new PublicKey(body.buyerWallet);
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
    const [escrowPda] = deriveEscrowPda(
      initiator,
      String(settlement.chain_deal_id),
      settlementMIndex
    );

    if (settlement.escrow_pda && settlement.escrow_pda !== escrowPda.toBase58()) {
      return NextResponse.json(
        {
          error:
            "Stored escrow PDA does not match the settlement initiator, chain deal ID, and milestone.",
        },
        { status: 409 }
      );
    }

    const connection = new Connection(DEVNET_RPC_URL, "confirmed");
    const account = await connection.getAccountInfo(escrowPda, "confirmed");

    if (!account) {
      return NextResponse.json(
        {
          error:
            "The funded TrustLayer escrow account was not found on Devnet. It may already have been released.",
          code: "ESCROW_PDA_MISSING",
          escrowPda: escrowPda.toBase58(),
        },
        { status: 409 }
      );
    }

    if (!account.owner.equals(TRUSTLAYER_PROGRAM_ID)) {
      return NextResponse.json(
        { error: "Account is not owned by the TrustLayer program." },
        { status: 409 }
      );
    }

    const raw = Buffer.from(account.data);

    if (raw.length < MIN_ESCROW_ACCOUNT_LEN) {
      return NextResponse.json(
        {
          error: "Invalid TrustLayer escrow account layout.",
          length: raw.length,
        },
        { status: 409 }
      );
    }

    const chain = decodeEscrowAccount(raw);

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

    const buyerOk =
      chain.buyer === buyer.toBase58() ||
      chain.initiator === buyer.toBase58() ||
      chain.initiator === initiator.toBase58();

    if (!buyerOk) {
      return NextResponse.json(
        {
          error: "On-chain initiator/buyer does not match connected wallet.",
          connected: buyer.toBase58(),
          onchainBuyer: chain.buyer,
          onchainInitiator: chain.initiator,
          settlementInitiator: initiator.toBase58(),
        },
        { status: 409 }
      );
    }

    if (chain.seller !== seller.toBase58()) {
      return NextResponse.json(
        {
          error: "On-chain seller does not match the TrustLayer settlement.",
          onchainSeller: chain.seller,
          expectedSeller: seller.toBase58(),
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

    const expectedTotalLocked =
      BigInt(String(settlement.amount_base_units)) +
      BigInt(String(settlement.settlement_fee_amount ?? "0"));

    if (!chain.funded) {
      return NextResponse.json(
        { error: "The on-chain escrow is not funded." },
        { status: 409 }
      );
    }

    if (BigInt(chain.totalLocked) !== expectedTotalLocked) {
      return NextResponse.json(
        {
          error: "On-chain total_locked does not match expected amount + fee.",
          expected: expectedTotalLocked.toString(),
          actual: chain.totalLocked,
        },
        { status: 409 }
      );
    }

    // Cross-check DB asset vs on-chain asset_type (0 = SOL, 1 = SPL)
    const expectSpl = assetCode === "USDC" || assetCode === "USDT";
    const onchainSpl = chain.assetType === 1;
    if (expectSpl !== onchainSpl) {
      return NextResponse.json(
        {
          error: "Deal asset_code does not match on-chain escrow asset_type.",
          assetCode,
          onchainAssetType: chain.assetType,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      deal: {
        id: deal.id,
        dealCode: deal.deal_code,
        title: deal.title,
        amount: String(deal.amount),
        currency: deal.currency,
        status: deal.status,
      },
      settlement: {
        chainDealId: String(settlement.chain_deal_id),
        escrowPda: escrowPda.toBase58(),
        buyerWallet: buyer.toBase58(),
        initiatorWallet: initiator.toBase58(),
        sellerWallet: seller.toBase58(),
        feeReceiver: TRUSTLAYER_FEE_RECEIVER.toBase58(),
        amountBaseUnits: String(settlement.amount_base_units),
        settlementFeeAmount: String(settlement.settlement_fee_amount ?? "0"),
        programId: TRUSTLAYER_PROGRAM_ID.toBase58(),
        systemProgram: SystemProgram.programId.toBase58(),
        milestoneIndex: settlementMIndex,
        assetCode,
        // on-chain: 0 = SOL, 1 = SPL — client can cross-check
        assetType: chain.assetType,
      },
    });
  } catch (error) {
    console.error("Crypto release prepare failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to prepare escrow release.",
      },
      { status: 500 }
    );
  }
}

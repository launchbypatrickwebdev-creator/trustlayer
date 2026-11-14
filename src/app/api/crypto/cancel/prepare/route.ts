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


export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      session?: string;
      sellerWallet?: string;
      milestoneIndex?: number;
    };

    if (!body.session || !body.sellerWallet) {
      return NextResponse.json(
        { error: "Cancel session and seller wallet are required." },
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
    if (
      !cancelActions.has(String(session.action)) ||
      (session.role !== "seller" && session.role !== "buyer")
    ) {
      return NextResponse.json(
        { error: "Crypto session is not valid for this action." },
        { status: 403 }
      );
    }

    const { data: deal, error: dealError } = await admin
      .from("deals")
      .select(
        "id, deal_code, buyer_id, seller_id, rail, asset_code, currency, status"
      )
      .eq("id", session.deal_id)
      .maybeSingle();

    if (dealError || !deal) {
      return NextResponse.json({ error: "Deal not found." }, { status: 404 });
    }

    if (deal.rail !== "crypto" || (deal.seller_id !== user.id && deal.buyer_id !== user.id)) {
      return NextResponse.json(
        { error: "This deal is not ready for cancellation." },
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
      return NextResponse.json({
        alreadyCancelled: true,
        assetCode,
        settlement: {
          chainDealId: String(settlement.chain_deal_id),
          escrowPda: settlement.escrow_pda,
          sellerWallet: settlement.seller_wallet,
          buyerWallet: settlement.buyer_wallet,
          initiatorWallet: settlement.initiator_wallet,
          feeReceiver: TRUSTLAYER_FEE_RECEIVER.toBase58(),
          amountBaseUnits: String(settlement.amount_base_units),
          cancellationFeeAmount: String(
            settlement.cancellation_fee_amount ?? "0"
          ),
          totalLocked: String(settlement.total_locked ?? "0"),
          programId: TRUSTLAYER_PROGRAM_ID.toBase58(),
          systemProgram: SystemProgram.programId.toBase58(),
          status: "cancelled",
          milestoneIndex: Number(settlement.milestone_index ?? mIndex),
          assetCode,
        },
      });
    }

    const programOk =
      settlement.program_id === TRUSTLAYER_PROGRAM_ID.toBase58();
    const isFunded =
      programOk &&
      (settlement.onchain_status === "funded" || settlement.funded === true);

    // Unfunded draft: cancel_unfunded (either party). Program closes PDA; rent → initiator.
    if (programOk && !isFunded) {
      const initiatorWallet = String(settlement.initiator_wallet || "");
      const buyerWallet = String(settlement.buyer_wallet || "");
      const sellerWallet = String(settlement.seller_wallet || "");
      if (
        seller.toBase58() !== initiatorWallet &&
        seller.toBase58() !== buyerWallet &&
        seller.toBase58() !== sellerWallet
      ) {
        // body.sellerWallet is the connected wallet for this prepare call
        return NextResponse.json(
          {
            error:
              "Connected wallet is not a party on this unfunded escrow.",
            initiatorWallet,
            buyerWallet,
            sellerWallet,
          },
          { status: 403 }
        );
      }
      return NextResponse.json({
        mode: "cancel_unfunded",
        assetCode,
        settlement: {
          chainDealId: String(settlement.chain_deal_id),
          escrowPda: settlement.escrow_pda,
          sellerWallet: settlement.seller_wallet,
          buyerWallet: settlement.buyer_wallet,
          initiatorWallet: settlement.initiator_wallet,
          feeReceiver: TRUSTLAYER_FEE_RECEIVER.toBase58(),
          amountBaseUnits: String(settlement.amount_base_units),
          cancellationFeeAmount: "0",
          totalLocked: String(settlement.total_locked ?? "0"),
          programId: TRUSTLAYER_PROGRAM_ID.toBase58(),
          systemProgram: SystemProgram.programId.toBase58(),
          status: settlement.onchain_status,
          milestoneIndex: Number(settlement.milestone_index ?? mIndex),
          assetCode,
        },
      });
    }

    if (!isFunded) {
      return NextResponse.json(
        {
          error: "This milestone escrow is not in a funded state.",
          milestoneIndex: mIndex,
          onchain_status: settlement.onchain_status,
        },
        { status: 409 }
      );
    }

    if (settlement.seller_wallet !== seller.toBase58()) {
      return NextResponse.json(
        {
          error:
            "Connected seller wallet does not match this escrow. Switch Phantom to the seller wallet on the settlement.",
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
    const [escrow] = deriveEscrowPda(
      initiator,
      String(settlement.chain_deal_id),
      settlementMIndex
    );
    if (settlement.escrow_pda && settlement.escrow_pda !== escrow.toBase58()) {
      return NextResponse.json(
        {
          error:
            "Stored escrow PDA does not match initiator + chain deal ID + milestone.",
        },
        { status: 409 }
      );
    }

    const connection = new Connection(DEVNET_RPC_URL, "confirmed");
    const account = await connection.getAccountInfo(escrow, "confirmed");

    if (!account) {
      return NextResponse.json(
        {
          error:
            "The funded TrustLayer escrow account was not found on Devnet. It may already have been cancelled.",
          code: "ESCROW_PDA_MISSING",
          escrowPda: escrow.toBase58(),
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

    if (
      chain.initiator !== initiator.toBase58() &&
      chain.seller !== seller.toBase58()
    ) {
      return NextResponse.json(
        {
          error: "On-chain initiator/seller does not match settlement.",
          onchainInitiator: chain.initiator,
          onchainSeller: chain.seller,
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

    if (!chain.funded) {
      return NextResponse.json(
        { error: "The on-chain escrow is not funded." },
        { status: 409 }
      );
    }

    return NextResponse.json({
      assetCode,
      settlement: {
        chainDealId: String(settlement.chain_deal_id),
        escrowPda: escrow.toBase58(),
        sellerWallet: seller.toBase58(),
        buyerWallet: buyer.toBase58(),
        initiatorWallet: initiator.toBase58(),
        feeReceiver: TRUSTLAYER_FEE_RECEIVER.toBase58(),
        amountBaseUnits: String(settlement.amount_base_units),
        cancellationFeeAmount: String(
          settlement.cancellation_fee_amount ?? "0"
        ),
        totalLocked: chain.totalLocked,
        programId: TRUSTLAYER_PROGRAM_ID.toBase58(),
        systemProgram: SystemProgram.programId.toBase58(),
        milestoneIndex: settlementMIndex,
        assetCode,
      },
    });
  } catch (error) {
    console.error("Crypto cancel prepare failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to prepare seller cancellation.",
      },
      { status: 500 }
    );
  }
}

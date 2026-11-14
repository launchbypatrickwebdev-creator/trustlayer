import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import {
  assetMeta,
  defaultDeadlineUnix,
  deriveEscrowPda,
  toBaseUnits,
  TRUSTLAYER_PROGRAM_ID,
  DEVNET_RPC_URL,
  isCryptoAssetCode,
} from "@/lib/crypto/solana";
import { isEscrowFunded } from "@/lib/crypto/escrow-accounts";
import { ON_CHAIN_SETTLEMENT_FEE_BPS } from "@/lib/domain/fee";
import { authorizeAgentDealExecution } from "@/lib/agents/execution-permissions";

/** Classic SPL Token program (USDC/USDT on Solana). */
const SPL_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

function chainDealIdFromUuid(dealId: string): string {
  const h = createHash("sha256").update(dealId).digest();
  const view = new DataView(h.buffer, h.byteOffset, 8);
  let n = view.getBigUint64(0, true);
  if (n === 0n) n = 1n;
  return n.toString();
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
      action?: string;
    };

    if (!body.session || !body.buyerWallet) {
      return NextResponse.json(
        { error: "Session and buyer wallet are required." },
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
        { error: sessionError?.message || "Invalid or expired crypto session." },
        { status: 401 }
      );
    }
    if (session.action !== "create" && session.action !== "fund") {
      return NextResponse.json(
        { error: "This crypto session is not authorized for payment preparation." },
        { status: 403 }
      );
    }

    const dealId = session.deal_id as string;
    const { data: deal, error: dealError } = await admin
      .from("deals")
      .select("*")
      .eq("id", dealId)
      .maybeSingle();

    if (dealError || !deal) {
      return NextResponse.json({ error: "Deal not found." }, { status: 404 });
    }

    if (deal.creator_checklist?.agent_transaction_id && !deal.agent_transaction_id) {
      return NextResponse.json({ error: "This agent-originated deal is not linked yet. Complete the agent-to-deal bridge before funding." }, { status: 409 });
    }

    if (deal.rail !== "crypto") {
      return NextResponse.json({ error: "Not a crypto deal." }, { status: 409 });
    }

    if (!["accepted", "awaiting_payment", "funded"].includes(deal.status)) {
      return NextResponse.json(
        { error: "Deal is not ready for crypto settlement." },
        { status: 409 }
      );
    }

    const assetCode = (deal.asset_code || deal.currency || "SOL").toUpperCase();
    if (!isCryptoAssetCode(assetCode)) {
      return NextResponse.json({ error: "Unsupported asset." }, { status: 400 });
    }

    if (deal.agent_transaction_id) {
      try {
        await authorizeAgentDealExecution({
          client: supabase,
          transactionId: String(deal.agent_transaction_id),
          scope: session.action === "create" ? "settlement:create" : "settlement:fund",
          assetCode,
          settlementType: "solana_escrow",
          walletAddress: String(body.buyerWallet || ""),
        });
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Agent execution grant denied." }, { status: 403 });
      }
    }

    const meta = assetMeta(assetCode);
    const isNativeSol = assetCode === "SOL";
    const assetTypeDb = isNativeSol ? "native_sol" : "spl";

    const mintForDb = isNativeSol ? null : meta.mint.toBase58();
    const tokenProgramForDb = isNativeSol ? null : SPL_TOKEN_PROGRAM_ID;

    const mCount = Number(deal.milestone_count || 1);
    if (mIndex < 0 || mIndex >= mCount) {
      return NextResponse.json({ error: "Invalid milestone index." }, { status: 400 });
    }

    const { data: sellerWallet } = await admin
      .from("wallets")
      .select("address")
      .eq("user_id", deal.seller_id)
      .eq("network", "devnet")
      .eq("asset_code", assetCode === "SOL" ? "SOL" : assetCode)
      .eq("is_primary", true)
      .maybeSingle();

    let sellerAddress = sellerWallet?.address;
    if (!sellerAddress && assetCode !== "SOL") {
      const { data: solW } = await admin
        .from("wallets")
        .select("address")
        .eq("user_id", deal.seller_id)
        .eq("network", "devnet")
        .eq("asset_code", "SOL")
        .eq("is_primary", true)
        .maybeSingle();
      sellerAddress = solW?.address;
    }

    if (!sellerAddress) {
      return NextResponse.json(
        { error: "Seller has not linked a primary Devnet wallet." },
        { status: 400 }
      );
    }

    let amountStr = String(deal.amount);
    const { data: existingSettlement } = await admin
      .from("crypto_settlements")
      .select("*")
      .eq("deal_id", deal.id)
      .eq("milestone_index", mIndex)
      .maybeSingle();

    if (deal.escrow_type === "milestone" && mCount > 1) {
      const { data: snap } = await admin
        .from("deal_events")
        .select("metadata")
        .eq("deal_id", deal.id)
        .eq("event_type", "deal_created_snapshot")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const milestones = (snap?.metadata as any)?.milestones as
        | { index: number; amount: string }[]
        | undefined;
      const row = milestones?.find((x) => x.index === mIndex);
      if (row?.amount) amountStr = String(row.amount);
    }

    const faceBaseUnits = toBaseUnits(amountStr, meta.decimals);
    if (faceBaseUnits <= 0n) {
      return NextResponse.json(
        { error: "Amount must be greater than zero (e.g. 0.1 SOL)." },
        { status: 400 }
      );
    }

    // Fee mode: on_top (default) | from_amount
    // on_top:      principal = face, fee = BPS% of face, total lock = face + fee
    // from_amount: principal = face - fee, fee = BPS% of face, total lock = face
    // BPS must match program DEFAULT_SETTLEMENT_FEE_BPS (250 = 2.5%)
    const feeMode =
      String((deal as { fee_mode?: string }).fee_mode || "on_top") ===
      "from_amount"
        ? "from_amount"
        : "on_top";
    const feeBps = BigInt(ON_CHAIN_SETTLEMENT_FEE_BPS);
    let settlementFeeFace = (faceBaseUnits * feeBps) / 10000n;
    if (settlementFeeFace === 0n && faceBaseUnits > 0n) settlementFeeFace = 1n;
    let amountBaseUnits = faceBaseUnits;
    let settlementFee = settlementFeeFace;
    if (feeMode === "from_amount") {
      if (faceBaseUnits <= settlementFeeFace) {
        return NextResponse.json(
          {
            error:
              "Deal amount is too small for from_amount fee mode after the platform fee.",
          },
          { status: 400 }
        );
      }
      amountBaseUnits = faceBaseUnits - settlementFeeFace;
      settlementFee = settlementFeeFace;
    }

    const chainDealId =
      existingSettlement?.chain_deal_id ||
      chainDealIdFromUuid(deal.id + ":" + mIndex);

    const agreed =
      deal.agreed_deadline || deal.deadline
        ? Math.floor(
            new Date(deal.agreed_deadline || deal.deadline).getTime() / 1000
          )
        : defaultDeadlineUnix();

    const buyer = new PublicKey(body.buyerWallet);
    const [escrowPda] = deriveEscrowPda(buyer, chainDealId, mIndex);

    // ── Idempotent create: if PDA already exists on-chain, treat as created ──
    let onchainStatus =
      String(existingSettlement?.onchain_status || "not_created");
    let alreadyCreatedOnChain = false;
    let alreadyFundedOnChain = false;

    try {
      const connection = new Connection(DEVNET_RPC_URL, "confirmed");
      const info = await connection.getAccountInfo(escrowPda, "confirmed");
      if (info && info.owner.equals(TRUSTLAYER_PROGRAM_ID)) {
        alreadyCreatedOnChain = true;
        // funded flag at byte 219 (after 8-byte discriminator layout used elsewhere)
        if (isEscrowFunded(info.data)) {
          alreadyFundedOnChain = true;
          onchainStatus = "funded";
        } else if (
          onchainStatus === "not_created" ||
          onchainStatus === "created_unfunded"
        ) {
          onchainStatus = "created_unfunded";
        }
      }
    } catch (rpcErr) {
      console.error("prepare PDA probe failed (non-fatal):", rpcErr);
    }

    const refundFee = (amountBaseUnits * 50n) / 10000n;
    const cancelFee = 0n; // program: no cancellation fee

    const settlementFields: Record<string, unknown> = {
      chain_deal_id: chainDealId,
      amount_base_units: amountBaseUnits.toString(),
      settlement_fee_amount: settlementFee.toString(),
      refund_fee_amount: refundFee.toString(),
      cancellation_fee_amount: cancelFee.toString(),
      buyer_wallet: buyer.toBase58(),
      seller_wallet: sellerAddress,
      initiator_wallet: buyer.toBase58(),
      escrow_pda: escrowPda.toBase58(),
      asset_code: assetCode,
      asset_type: assetTypeDb,
      mint: mintForDb,
      token_program: tokenProgramForDb,
      decimals: meta.decimals,
      milestone_index: mIndex,
      milestone_count: mCount,
      program_id: TRUSTLAYER_PROGRAM_ID.toBase58(),
    };

    // Catch DB up to chain when PDA already exists (no second Create tx needed)
    if (alreadyCreatedOnChain) {
      if (alreadyFundedOnChain) {
        settlementFields.onchain_status = "funded";
        settlementFields.funded = true;
      } else if (
        !existingSettlement ||
        existingSettlement.onchain_status === "not_created"
      ) {
        settlementFields.onchain_status = "created_unfunded";
        settlementFields.funded = false;
      }
    }

    if (existingSettlement?.id) {
      // Do not downgrade terminal / funded statuses
      const current = String(existingSettlement.onchain_status || "");
      if (
        ["released", "cancelled", "refunded", "funded"].includes(current) &&
        settlementFields.onchain_status &&
        settlementFields.onchain_status !== current
      ) {
        delete settlementFields.onchain_status;
        delete settlementFields.funded;
      }

      const { error: updateError } = await admin
        .from("crypto_settlements")
        .update(settlementFields)
        .eq("id", existingSettlement.id);

      if (updateError) {
        console.error("crypto_settlements update failed:", updateError);
        return NextResponse.json(
          {
            error: `Could not update crypto settlement: ${updateError.message}`,
            details: updateError,
          },
          { status: 500 }
        );
      }
    } else {
      const { data: inserted, error: insertError } = await admin
        .from("crypto_settlements")
        .insert({
          deal_id: deal.id,
          ...settlementFields,
          onchain_status: alreadyCreatedOnChain
            ? alreadyFundedOnChain
              ? "funded"
              : "created_unfunded"
            : "not_created",
          funded: alreadyFundedOnChain,
        })
        .select("id, deal_id, chain_deal_id, onchain_status")
        .single();

      if (insertError || !inserted) {
        console.error("crypto_settlements insert failed:", insertError);
        return NextResponse.json(
          {
            error: `Could not create crypto settlement: ${
              insertError?.message || "unknown insert error"
            }`,
            details: insertError,
          },
          { status: 500 }
        );
      }
    }

    if (deal.status === "accepted") {
      await admin
        .from("deals")
        .update({ status: "awaiting_payment" })
        .eq("id", deal.id)
        .eq("status", "accepted");
    }

    const resolvedStatus = alreadyFundedOnChain
      ? "funded"
      : alreadyCreatedOnChain
        ? "created_unfunded"
        : String(
            (settlementFields.onchain_status as string) ||
              existingSettlement?.onchain_status ||
              "not_created"
          );

    return NextResponse.json({
      deal: {
        id: deal.id,
        dealCode: deal.deal_code,
        title: deal.title,
        amount: amountStr,
        currency: assetCode,
        status: deal.status,
      },
      settlement: {
        chainDealId,
        escrowPda: escrowPda.toBase58(),
        amountBaseUnits: amountBaseUnits.toString(),
        settlementFeeAmount: settlementFee.toString(),
        // total lock = principal + fee (same for on_top and from_amount)
        totalLockBaseUnits: (amountBaseUnits + settlementFee).toString(),
        feeMode,
        sellerWallet: sellerAddress,
        buyerWallet: buyer.toBase58(),
        initiatorWallet: buyer.toBase58(),
        programId: TRUSTLAYER_PROGRAM_ID.toBase58(),
        status: resolvedStatus,
        deadlineUnix: agreed,
        milestoneIndex: mIndex,
        milestoneCount: mCount,
        assetCode,
        alreadyCreatedOnChain,
        alreadyFundedOnChain,
      },
    });
  } catch (error) {
    console.error("Crypto prepare failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to prepare escrow.",
      },
      { status: 500 }
    );
  }
}

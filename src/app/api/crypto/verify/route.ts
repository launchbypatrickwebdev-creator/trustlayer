import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import {
  isCryptoAssetCode,
  DEVNET_RPC_URL,
  deriveEscrowPda,
  TRUSTLAYER_PROGRAM_ID,
} from "@/lib/crypto/solana";
import {
  decodeEscrowAccount,
  ESCROW_ACCOUNT_MIN_LEN,
} from "@/lib/crypto/escrow-accounts";

const MIN_ESCROW_LEN = ESCROW_ACCOUNT_MIN_LEN;

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
      return NextResponse.json({ error: "Invalid crypto session." }, { status: 403 });
    }

    const { data: deal } = await admin
      .from("deals")
      .select(
        "id, buyer_id, seller_id, rail, asset_code, amount, currency, deadline, status"
      )
      .eq("id", session.deal_id)
      .maybeSingle();

    if (!deal || deal.buyer_id !== user.id || deal.rail !== "crypto") {
      return NextResponse.json({ error: "Invalid crypto deal." }, { status: 400 });
    }

    const assetCode = String(deal.asset_code || deal.currency || "SOL").toUpperCase();
    if (!isCryptoAssetCode(assetCode)) {
      return NextResponse.json({ error: "Unsupported crypto asset." }, { status: 400 });
    }

    const milestoneIndex = Number(body.milestoneIndex ?? 0);

    const buyer = new PublicKey(body.buyerWallet);
    const { data: settlement, error: settlementError } = await admin
      .from("crypto_settlements")
      .select("*")
      .eq("deal_id", deal.id)
      .eq("milestone_index", milestoneIndex)
      .maybeSingle();

    if (settlementError || !settlement || !settlement.chain_deal_id) {
      return NextResponse.json(
        { error: "Crypto settlement is not prepared." },
        { status: 400 }
      );
    }

    // PDA seeds: [escrow, initiator, deal_id, milestone_index]
    // Buyer-created: initiator === buyer
    const initiatorKey = new PublicKey(
      settlement.initiator_wallet || body.buyerWallet
    );
    const [escrowPda] = deriveEscrowPda(
      initiatorKey,
      String(settlement.chain_deal_id),
      Number(settlement.milestone_index ?? milestoneIndex)
    );

    const connection = new Connection(DEVNET_RPC_URL, "confirmed");
    const account = await connection.getAccountInfo(escrowPda, "confirmed");
    const programId = new PublicKey(
      settlement.program_id || TRUSTLAYER_PROGRAM_ID.toBase58()
    );

    if (!account || !account.owner.equals(programId)) {
      return NextResponse.json(
        {
          error: "The escrow account was not found on the TrustLayer program.",
          escrowPda: escrowPda.toBase58(),
        },
        { status: 409 }
      );
    }

    const raw = Buffer.isBuffer(account.data)
      ? account.data
      : Buffer.from(account.data);

    if (raw.length < MIN_ESCROW_LEN) {
      return NextResponse.json(
        {
          error: "Invalid TrustLayer escrow account.",
          length: raw.length,
          expectedMin: MIN_ESCROW_LEN,
        },
        { status: 409 }
      );
    }

    const chain = decodeEscrowAccount(raw);
    const buyerStr = buyer.toBase58();
    const expectedSeller = String(settlement.seller_wallet || "").trim();
    const mismatches: string[] = [];

    if (String(chain.dealId) !== String(settlement.chain_deal_id)) {
      mismatches.push(
        `deal_id chain=${chain.dealId} db=${settlement.chain_deal_id}`
      );
    }

    if (Number(chain.milestoneIndex) !== Number(settlement.milestone_index ?? 0)) {
      mismatches.push(
        `milestone_index chain=${chain.milestoneIndex} db=${settlement.milestone_index}`
      );
    }

    if (chain.initiator !== buyerStr && chain.initiator !== String(settlement.initiator_wallet || "")) {
      mismatches.push(
        `initiator chain=${chain.initiator} expected=${buyerStr}`
      );
    }

    if (chain.buyer !== buyerStr) {
      mismatches.push(`buyer chain=${chain.buyer} expected=${buyerStr}`);
    }

    if (expectedSeller && chain.seller !== expectedSeller) {
      mismatches.push(
        `seller chain=${chain.seller} expected=${expectedSeller}`
      );
    }

    // AssetType::NativeSol = 0, Spl = 1
    if (assetCode === "SOL" && chain.assetType !== 0) {
      mismatches.push(`assetType chain=${chain.assetType} expected=0 (NativeSol)`);
    }
    if ((assetCode === "USDC" || assetCode === "USDT") && chain.assetType !== 1) {
      mismatches.push(`assetType chain=${chain.assetType} expected=1 (Spl)`);
    }

    try {
      if (BigInt(chain.amount) !== BigInt(String(settlement.amount_base_units))) {
        mismatches.push(
          `amount chain=${chain.amount} db=${settlement.amount_base_units}`
        );
      }
    } catch {
      mismatches.push(
        `amount parse failed chain=${chain.amount} db=${settlement.amount_base_units}`
      );
    }

    try {
      const expectedFee = BigInt(String(settlement.settlement_fee_amount ?? "0"));
      if (expectedFee > 0n && BigInt(chain.settlementFeeAmount) !== expectedFee) {
        mismatches.push(
          `settlement_fee chain=${chain.settlementFeeAmount} db=${settlement.settlement_fee_amount}`
        );
      }
    } catch {
      mismatches.push(
        `settlement_fee parse failed chain=${chain.settlementFeeAmount} db=${settlement.settlement_fee_amount}`
      );
    }

    // create_escrow leaves funded = false
    if (chain.funded) {
      mismatches.push(`funded chain=true expected=false`);
    }

    // EscrowStatus::Active = 0
    if (chain.status !== 0) {
      mismatches.push(`status chain=${chain.status} expected=0 (Active)`);
    }

    if (mismatches.length > 0) {
      console.error("Escrow verify mismatch:", {
        escrowPda: escrowPda.toBase58(),
        dataLen: raw.length,
        chain,
        mismatches,
        settlementId: settlement.id,
      });

      return NextResponse.json(
        {
          error: "On-chain escrow data does not match the TrustLayer deal.",
          mismatches,
          escrowPda: escrowPda.toBase58(),
          decoded: {
            dealId: chain.dealId,
            milestoneIndex: chain.milestoneIndex,
            initiator: chain.initiator,
            buyer: chain.buyer,
            seller: chain.seller,
            assetType: chain.assetType,
            amount: chain.amount,
            funded: chain.funded,
            status: chain.status,
          },
        },
        { status: 409 }
      );
    }

    const confirmation = await connection.getSignatureStatuses([body.signature]);
    const sigStatus = confirmation.value[0];
    if (!sigStatus || sigStatus.err) {
      return NextResponse.json(
        { error: "The submitted transaction was not confirmed successfully." },
        { status: 409 }
      );
    }

    const { error: updateError } = await admin
      .from("crypto_settlements")
      .update({
        escrow_pda: escrowPda.toBase58(),
        buyer_wallet: buyer.toBase58(),
        create_tx_signature: body.signature,
        last_tx_signature: body.signature,
        onchain_status: "created_unfunded",
        last_verified_at: new Date().toISOString(),
        program_id: programId.toBase58(),
      })
      .eq("id", settlement.id);

    if (updateError) {
      return NextResponse.json(
        {
          error:
            "Escrow was created but TrustLayer could not record the verification.",
        },
        { status: 500 }
      );
    }

    await admin.from("crypto_sessions").update({ status: "used", used_at: new Date().toISOString() }).eq("id", session.id);

    await admin.from("deal_events").insert({
      deal_id: deal.id,
      actor_user_id: user.id,
      actor_type: "user",
      event_type: "crypto_create_verified",
      metadata: {
        signature: body.signature,
        escrow_pda: escrowPda.toBase58(),
        chain_deal_id: settlement.chain_deal_id,
        milestone_index: chain.milestoneIndex,
        amount: chain.amount,
      },
    });

    return NextResponse.json({
      verified: true,
      escrowPda: escrowPda.toBase58(),
      chainDealId: settlement.chain_deal_id,
      status: "created_unfunded",
      milestoneIndex: chain.milestoneIndex,
      assetCode,
    });
  } catch (error) {
    console.error("Crypto verification failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to verify escrow.",
      },
      { status: 500 }
    );
  }
}
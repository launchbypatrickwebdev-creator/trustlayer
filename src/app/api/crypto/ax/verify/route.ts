/**
 * POST /api/crypto/ax/verify
 *
 * Read Ax PDA from chain, decode status, optionally sync crypto_settlements.
 * Body: { dealId, chainDealId?, partyAWallet?, partyBWallet? }
 */

import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import {
  DEVNET_RPC_URL,
  deriveAxPda,
} from "@/lib/crypto/solana";
import { decodeAxSwapAccount } from "@/lib/crypto/ax-accounts";
import { assertAxWalletsBound } from "@/lib/domain/ax-legs";
import { isAxAdapter } from "@/lib/domain/settlement";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const dealId = String(body.dealId || "");
    if (!dealId) {
      return NextResponse.json({ error: "dealId required" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: deal } = await supabase
      .from("deals")
      .select("id, buyer_id, seller_id, settlement_adapter")
      .eq("id", dealId)
      .single();

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }
    if (!isAxAdapter(deal.settlement_adapter)) {
      return NextResponse.json(
        { error: "Not an Ax deal" },
        { status: 400 }
      );
    }

    const { data: settlement } = await supabase
      .from("crypto_settlements")
      .select("*")
      .eq("deal_id", dealId)
      .eq("milestone_index", 0)
      .maybeSingle();

    let partyA = String(body.partyAWallet || settlement?.buyer_wallet || "").trim();
    let partyB = String(body.partyBWallet || settlement?.seller_wallet || "").trim();

    if (!partyA || !partyB) {
      const { createSupabaseAdminClient } = await import(
        "@/lib/db/supabase-admin"
      );
      const adminWallets = createSupabaseAdminClient();
      const { data: wallets } = await adminWallets
        .from("wallets")
        .select("user_id, address")
        .in("user_id", [deal.buyer_id, deal.seller_id].filter(Boolean));
      const map = new Map((wallets || []).map((w) => [w.user_id, w.address]));
      if (!partyA && deal.buyer_id) partyA = map.get(deal.buyer_id) || "";
      if (!partyB && deal.seller_id) partyB = map.get(deal.seller_id) || "";
    }

    const bound = assertAxWalletsBound({
      partyAWallet: partyA,
      partyBWallet: partyB,
    });

    const chainDealId = String(
      body.chainDealId || settlement?.chain_deal_id || ""
    );
    if (!chainDealId) {
      return NextResponse.json(
        { error: "chainDealId required" },
        { status: 400 }
      );
    }

    const [axPda] = deriveAxPda(
      chainDealId,
      new PublicKey(bound.partyAWallet),
      new PublicKey(bound.partyBWallet)
    );

    const connection = new Connection(DEVNET_RPC_URL, "confirmed");
    const info = await connection.getAccountInfo(axPda, "confirmed");

    if (!info) {
      return NextResponse.json({
        ok: true,
        exists: false,
        axPda: axPda.toBase58(),
        chainDealId,
        onchainStatus: "not_created",
        fundedA: false,
        fundedB: false,
      });
    }

    const decoded = decodeAxSwapAccount(Buffer.from(info.data));

    const bothFunded = decoded.fundedA && decoded.fundedB;
    let onchainStatus = "created_unfunded";
    if (decoded.status === "released") onchainStatus = "released";
    else if (decoded.status === "cancelled") onchainStatus = "cancelled";
    else if (decoded.status === "refunded") onchainStatus = "refunded";
    else if (decoded.status === "disputed") onchainStatus = "disputed";
    else if (bothFunded) onchainStatus = "funded";
    else if (decoded.fundedA || decoded.fundedB) onchainStatus = "created_unfunded";

    // Soft sync settlement row when present
    if (settlement?.id) {
      await supabase
        .from("crypto_settlements")
        .update({
          escrow_pda: axPda.toBase58(),
          funded: bothFunded,
          onchain_status: onchainStatus,
          total_locked: (
            BigInt(decoded.lockedA) + BigInt(decoded.lockedB)
          ).toString(),
          last_verified_at: new Date().toISOString(),
          settlement_kind: "ax",
          buyer_wallet: bound.partyAWallet,
          seller_wallet: bound.partyBWallet,
          initiator_wallet: bound.partyAWallet,
        })
        .eq("id", settlement.id);
    }

    return NextResponse.json({
      ok: true,
      exists: true,
      axPda: axPda.toBase58(),
      chainDealId,
      decoded,
      onchainStatus,
      fundedA: decoded.fundedA,
      fundedB: decoded.fundedB,
      bothFunded,
      status: decoded.status,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ax verify failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

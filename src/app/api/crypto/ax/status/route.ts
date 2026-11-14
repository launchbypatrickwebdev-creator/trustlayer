/**
 * GET /api/crypto/ax/status?dealId=
 * Two-row model: reads both ax_leg_index 0 and 1 for fund history + status.
 */

import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import {
  deriveAxPda,
  DEVNET_RPC_URL,
  TRUSTLAYER_ADMIN,
} from "@/lib/crypto/solana";
import { isAxAdapter } from "@/lib/domain/settlement";

export async function GET(request: Request) {
  try {
    const dealId = new URL(request.url).searchParams.get("dealId") || "";
    if (
      !dealId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        dealId
      )
    ) {
      return NextResponse.json({ error: "dealId required" }, { status: 400 });
    }

    const url = new URL(request.url);
    const walletQ = String(url.searchParams.get("wallet") || "").trim();

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // Ax authority share-link: allow unauthenticated read (deal UUID is the gate)

    const admin = createSupabaseAdminClient();

    // Never select settlement_kind on deals — column is on crypto_settlements only
    const { data: deal, error: dealErr } = await admin
      .from("deals")
      .select(
        "id, buyer_id, seller_id, created_by, settlement_adapter, status, rail, chain, ax_release_authority, creator_checklist"
      )
      .eq("id", dealId)
      .maybeSingle();

    if (dealErr || !deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const buyerId = (deal.buyer_id as string | null) || null;
    const sellerId = (deal.seller_id as string | null) || null;
    const createdBy = (deal.created_by as string | null) || null;

    const isParty = Boolean(
      user &&
        (user.id === buyerId || user.id === sellerId || user.id === createdBy)
    );

    let isAdmin = false;
    if (user) {
      try {
        const { data } = await (admin.rpc as any)("is_trustlayer_admin", {
          p_user_id: user.id,
        });
        isAdmin = data === true;
      } catch {
        isAdmin = false;
      }
    }

    // Resolve authority pubkey early so custom authority can load status
    const clEarly = (deal.creator_checklist || {}) as Record<string, unknown>;
    const releaseModeEarly = String(
      clEarly.releaseAuthorityMode ||
        (deal.ax_release_authority ? "custom" : "admin")
    ).toLowerCase();
    const customPkEarly = String(
      deal.ax_release_authority ||
        clEarly.releaseAuthorityPubkey ||
        clEarly.release_authority_pubkey ||
        ""
    ).trim();
    const releaseAuthorityEarly =
      releaseModeEarly === "custom" && customPkEarly.length >= 32
        ? customPkEarly
        : TRUSTLAYER_ADMIN.toBase58();

    // Custom authority: logged-in user with that Solana address linked on profile
    let isAuthorityUser = false;
    if (user) {
      try {
        const { data: myWallets } = await admin
          .from("wallets")
          .select("address")
          .eq("user_id", user.id)
          .limit(20);
        isAuthorityUser = (myWallets || []).some(
          (w) =>
            String(w.address || "").trim() === releaseAuthorityEarly &&
            releaseAuthorityEarly.length >= 32
        );
      } catch {
        isAuthorityUser = false;
      }
    }

    const isConnectedAuthority =
      walletQ.length >= 32 &&
      releaseAuthorityEarly.length >= 32 &&
      walletQ === releaseAuthorityEarly;

    const isAxDeal = isAxAdapter(String(deal.settlement_adapter || ""));

    // Party, admin, profile-linked authority, connected authority wallet, or Ax UUID share-link
    if (!isParty && !isAdmin && !isAuthorityUser && !isConnectedAuthority && !isAxDeal) {
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }

    let role: "buyer" | "seller" | "observer" | "authority" = "observer";
    if (user && user.id === buyerId) role = "buyer";
    else if (user && user.id === sellerId) role = "seller";
    if (isConnectedAuthority || isAuthorityUser) role = "authority";

    const { data: settlements } = await admin
      .from("crypto_settlements")
      .select("*")
      .eq("deal_id", dealId)
      .eq("milestone_index", 0)
      .order("ax_leg_index", { ascending: true, nullsFirst: true });

    const leg0 =
      (settlements || []).find(
        (r) => r.ax_leg_index == null || Number(r.ax_leg_index) === 0
      ) || null;
    const leg1 =
      (settlements || []).find((r) => Number(r.ax_leg_index) === 1) || null;
    const primary = leg0 || (settlements || [])[0] || null;

    const { data: legRows } = await admin
      .from("deal_settlement_legs")
      .select(
        "leg_index, party_role, asset_code, amount_base_units, fee_amount, decimals, mint"
      )
      .eq("deal_id", dealId)
      .order("leg_index", { ascending: true });

    const ids = [buyerId, sellerId].filter(Boolean) as string[];
    const { data: wallets } =
      ids.length > 0
        ? await admin.from("wallets").select("user_id, address").in("user_id", ids)
        : { data: [] as { user_id: string; address: string }[] };

    const byUser = new Map(
      (wallets || []).map((w) => [w.user_id, String(w.address || "")])
    );
    const partyA = (buyerId && byUser.get(buyerId)) || "";
    const partyB = (sellerId && byUser.get(sellerId)) || "";

    let chainDealId = primary?.chain_deal_id
      ? String(primary.chain_deal_id)
      : "";
    let axPda = primary?.escrow_pda ? String(primary.escrow_pda) : null;
    let onchainStatus = String(
      primary?.onchain_status || "not_created"
    ).toLowerCase();

    let fundedA = !!leg0?.funded;
    let fundedB = !!leg1?.funded;
    if (onchainStatus === "funded" || onchainStatus === "released") {
      if (!leg1) {
        fundedA = true;
        fundedB = true;
      }
    }

    if (chainDealId && partyA && partyB) {
      try {
        const [pda] = deriveAxPda(
          chainDealId,
          new PublicKey(partyA),
          new PublicKey(partyB)
        );
        axPda = pda.toBase58();
        const connection = new Connection(
          process.env.NEXT_PUBLIC_SOLANA_RPC_URL || DEVNET_RPC_URL,
          "confirmed"
        );
        const info = await connection.getAccountInfo(pda, "confirmed");
        if (info?.data) {
          const { decodeAxSwapAccount } = await import(
            "@/lib/crypto/ax-accounts"
          );
          const decoded = decodeAxSwapAccount(Buffer.from(info.data));
          fundedA = !!decoded.fundedA;
          fundedB = !!decoded.fundedB;
          if (decoded.status === "released") onchainStatus = "released";
          else if (decoded.status === "cancelled") onchainStatus = "cancelled";
          else if (decoded.status === "refunded") onchainStatus = "refunded";
          else if (decoded.status === "disputed") onchainStatus = "disputed";
          else if (fundedA && fundedB) onchainStatus = "funded";
          else if (chainDealId) onchainStatus = "created_unfunded";
        } else {
          // PDA closed/missing: if legs were funded, prefer terminal from DB sigs
          const anyRelease = (settlements || []).some(
            (s) => s.release_tx_signature
          );
          const anyCancel = (settlements || []).some(
            (s) => s.cancel_tx_signature
          );
          if (anyRelease) onchainStatus = "released";
          else if (anyCancel) onchainStatus = "cancelled";
          else if (fundedA && fundedB) onchainStatus = "funded";
          else if (!primary) onchainStatus = "not_created";
        }
      } catch (e) {
        console.warn("[ax/status] chain read:", e);
      }
    }

    const cl = (deal.creator_checklist || {}) as Record<string, unknown>;
    const releaseMode = String(
      cl.releaseAuthorityMode ||
        (deal.ax_release_authority ? "custom" : "admin")
    ).toLowerCase();
    const customPk = String(
      deal.ax_release_authority ||
        cl.releaseAuthorityPubkey ||
        cl.release_authority_pubkey ||
        ""
    ).trim();
    const releaseAuthority =
      releaseMode === "custom" && customPk.length >= 32
        ? customPk
        : TRUSTLAYER_ADMIN.toBase58();


    // If chain already terminal but DB lagging (record 403 / closed PDA), heal deals + settlements
    if (
      onchainStatus === "released" ||
      onchainStatus === "cancelled" ||
      onchainStatus === "refunded"
    ) {
      try {
        const dealStatus =
          onchainStatus === "released"
            ? "completed"
            : onchainStatus === "refunded"
              ? "refunded"
              : "cancelled";
        await admin
          .from("deals")
          .update({ status: dealStatus })
          .eq("id", dealId)
          .in("status", [
            "funded",
            "awaiting_payment",
            "awaiting_delivery",
            "accepted",
            "disputed",
            "draft",
          ]);
        await admin
          .from("crypto_settlements")
          .update({
            onchain_status: onchainStatus,
            funded: onchainStatus === "released",
          })
          .eq("deal_id", dealId);
      } catch (e) {
        console.warn("[ax/status] terminal sync:", e);
      }
    }

    const bothFunded = fundedA && fundedB;
    const canAuthoritySettle =
      bothFunded &&
      (onchainStatus === "funded" || onchainStatus === "disputed");

    return NextResponse.json({
      dealId,
      isAdmin,
      isAuthorityUser: isAuthorityUser || isConnectedAuthority,
      isConnectedAuthority,
      isAx: isAxAdapter(String(deal.settlement_adapter || "")),
      role,
      dealStatus: deal.status,
      onchainStatus,
      chainDealId: chainDealId || null,
      axPda,
      fundedA,
      fundedB,
      bothFunded,
      canAuthoritySettle,
      releaseAuthorityMode: releaseMode,
      releaseAuthorityPubkey: releaseAuthority,
      authoritySettlePath: `/deals/${dealId}/ax?action=authority`,
      trustlayerAdmin: TRUSTLAYER_ADMIN.toBase58(),
      adminDefaultAuthority: TRUSTLAYER_ADMIN.toBase58(),
      createTx:
        primary?.create_tx_signature || leg0?.create_tx_signature || null,
      fundATx: leg0?.fund_tx_signature || null,
      fundBTx: leg1?.fund_tx_signature || null,
      releaseTx:
        primary?.release_tx_signature || leg0?.release_tx_signature || null,
      cancelTx:
        primary?.cancel_tx_signature || leg0?.cancel_tx_signature || null,
      legs: legRows || [],
      settlements: (settlements || []).map((s) => ({
        id: s.id,
        ax_leg_index: s.ax_leg_index,
        asset_code: s.asset_code,
        amount_base_units: s.amount_base_units,
        funded: s.funded,
        onchain_status: s.onchain_status,
        fund_tx_signature: s.fund_tx_signature,
        create_tx_signature: s.create_tx_signature,
      })),
    });
  } catch (e) {
    console.error("[ax/status]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "status failed" },
      { status: 500 }
    );
  }
}
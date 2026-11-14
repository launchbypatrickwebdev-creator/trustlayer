/**
 * GET /api/admin/ax-pending
 *
 * List Ax deals ready for authority Release / Cancel.
 * UI "funded A:✓ B:✓" often comes from chain while DB rows lag
 * (onchain_status still created_unfunded, or settlement_kind not 'ax').
 * So we key off deals.settlement_adapter + leg fund signals, not a single filter.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { isAxAdapter } from "@/lib/domain/settlement";

const OPEN_DEAL_STATUSES = [
  "accepted",
  "awaiting_payment",
  "funded",
  "awaiting_delivery",
  "disputed",
];

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();
    const { data: isAdmin } = await (admin.rpc as any)("is_trustlayer_admin", {
      p_user_id: user.id,
    });
    if (isAdmin !== true) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    // 1) Candidate Ax deals (adapter), not terminal
    const { data: axDeals, error: dealsErr } = await admin
      .from("deals")
      .select(
        "id, deal_code, title, status, settlement_adapter, creator_checklist, ax_release_authority, updated_at"
      )
      .in("status", OPEN_DEAL_STATUSES)
      .order("updated_at", { ascending: false })
      .limit(80);

    if (dealsErr) {
      return NextResponse.json({ error: dealsErr.message }, { status: 500 });
    }

    const axOnly = (axDeals || []).filter((d) =>
      isAxAdapter(String(d.settlement_adapter || ""))
    );
    if (axOnly.length === 0) {
      return NextResponse.json({ count: 0, items: [], reason: "no_ax_deals" });
    }

    const dealIds = axOnly.map((d) => d.id as string);

    // 2) All settlement rows for those deals (any status / kind)
    const { data: settlements, error: setErr } = await admin
      .from("crypto_settlements")
      .select(
        "id, deal_id, chain_deal_id, onchain_status, funded, ax_leg_index, fund_tx_signature, create_tx_signature, escrow_pda, updated_at, settlement_kind"
      )
      .in("deal_id", dealIds)
      .order("updated_at", { ascending: false });

    if (setErr) {
      return NextResponse.json({ error: setErr.message }, { status: 500 });
    }

    type Group = {
      chainDealId: string | null;
      escrowPda: string | null;
      updatedAt: string | null;
      fundA: string | null;
      fundB: string | null;
      statuses: Set<string>;
      fundedFlags: { a: boolean; b: boolean };
      rowCount: number;
    };

    const byDeal = new Map<string, Group>();

    for (const s of settlements || []) {
      const id = s.deal_id as string;
      let g = byDeal.get(id);
      if (!g) {
        g = {
          chainDealId: null,
          escrowPda: null,
          updatedAt: null,
          fundA: null,
          fundB: null,
          statuses: new Set(),
          fundedFlags: { a: false, b: false },
          rowCount: 0,
        };
        byDeal.set(id, g);
      }
      g.rowCount += 1;
      if (s.chain_deal_id) g.chainDealId = String(s.chain_deal_id);
      if (s.escrow_pda) g.escrowPda = String(s.escrow_pda);
      if (s.updated_at) g.updatedAt = String(s.updated_at);
      if (s.onchain_status) g.statuses.add(String(s.onchain_status).toLowerCase());

      const idx =
        s.ax_leg_index == null || s.ax_leg_index === undefined
          ? null
          : Number(s.ax_leg_index);

      if (s.funded) {
        if (idx === 1) g.fundedFlags.b = true;
        else g.fundedFlags.a = true; // 0 or null → treat as A / aggregate
      }

      if (s.fund_tx_signature) {
        if (idx === 1) g.fundB = String(s.fund_tx_signature);
        else if (idx === 0 || idx === null) {
          if (!g.fundA) g.fundA = String(s.fund_tx_signature);
        }
      }
      // Two rows without reliable leg index: first fund → A, second → B
      if (
        s.fund_tx_signature &&
        idx === null &&
        g.fundA &&
        g.fundA !== String(s.fund_tx_signature) &&
        !g.fundB
      ) {
        g.fundB = String(s.fund_tx_signature);
      }
    }

    const items = [];
    for (const d of axOnly) {
      const dealId = d.id as string;
      const g = byDeal.get(dealId);
      if (!g || !g.chainDealId) continue; // never created on-chain

      const statusFunded =
        g.statuses.has("funded") || g.statuses.has("disputed");
      const bothFundFlags = g.fundedFlags.a && g.fundedFlags.b;
      const bothFundTx = Boolean(g.fundA && g.fundB);
      const dealSaysFunded = String(d.status || "") === "funded";

      // Ready for authority settle if we have strong signal both legs locked
      const ready =
        statusFunded ||
        bothFundFlags ||
        bothFundTx ||
        (dealSaysFunded && Boolean(g.fundA || g.fundedFlags.a));

      // Skip already fully released/cancelled in DB
      if (
        g.statuses.has("released") ||
        g.statuses.has("cancelled") ||
        g.statuses.has("refunded")
      ) {
        if (!g.statuses.has("funded") && !g.statuses.has("disputed")) continue;
      }

      if (!ready) continue;

      const cl = (d.creator_checklist || {}) as Record<string, unknown>;
      const mode = String(
        cl.releaseAuthorityMode ||
          (d.ax_release_authority ? "custom" : "admin")
      ).toLowerCase();

      items.push({
        dealId,
        dealCode: d.deal_code ?? null,
        title: d.title ?? null,
        dealStatus: d.status ?? null,
        chainDealId: g.chainDealId,
        onchainStatus: statusFunded
          ? g.statuses.has("disputed")
            ? "disputed"
            : "funded"
          : bothFundTx || bothFundFlags
            ? "funded"
            : [...g.statuses][0] || "created_unfunded",
        escrowPda: g.escrowPda,
        fundATx: g.fundA,
        fundBTx: g.fundB,
        releaseAuthorityMode: mode,
        releaseAuthorityPubkey:
          mode === "custom"
            ? d.ax_release_authority || cl.releaseAuthorityPubkey || null
            : "admin",
        settleUrl: `/deals/${dealId}/ax?action=authority`,
        updatedAt: g.updatedAt || d.updated_at || null,
        debug: {
          rowCount: g.rowCount,
          statuses: [...g.statuses],
          fundedFlags: g.fundedFlags,
          bothFundTx,
        },
      });
    }

    return NextResponse.json({
      count: items.length,
      items,
      scannedAxDeals: axOnly.length,
    });
  } catch (e) {
    console.error("[ax-pending]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 }
    );
  }
}

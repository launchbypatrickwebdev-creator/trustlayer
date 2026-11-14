import TokenIcon from "@/components/TokenIcon";
import PageBackLink from "@/components/layout/PageBackLink";
import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import SolanaCreateEscrow from "@/components/crypto/SolanaCreateEscrow";
import CrossChainFundPanel from "@/components/deals/CrossChainFundPanel";
import DepositMilestoneSwitcher from "@/components/crypto/DepositMilestoneSwitcher";

interface Props {
  searchParams: Promise<{ session?: string; milestoneIndex?: string }>;
}

export default async function CryptoDepositPage({ searchParams }: Props) {
  const params = await searchParams;
  if (!params.session) redirect("/dashboard");

  const capability = params.session;
  const milestoneIndexFromUrl = Number(params.milestoneIndex ?? 0);
  if (
    !Number.isInteger(milestoneIndexFromUrl) ||
    milestoneIndexFromUrl < 0 ||
    milestoneIndexFromUrl > 9
  ) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <PageBackLink href="/deals" label="Back to deals" />
        <p className="text-sm text-red-600">
          Invalid milestone. Open the deal and start the action again.
        </p>
      </main>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createSupabaseAdminClient();
  const capabilityHash = createHash("sha256")
    .update(capability, "utf8")
    .digest("hex");

  // Master Lock: validate requires capability + actor + milestone_index
  const { data: session, error: sessionError } = await (admin.rpc as any)(
    "validate_crypto_payment_session",
    {
      p_capability_hash: capabilityHash,
      p_actor_user_id: user.id,
      p_milestone_index: milestoneIndexFromUrl,
    }
  );

  if (sessionError || !session) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <PageBackLink href="/deals" label="Back to deals" />
        <p className="text-sm text-red-600">
          Invalid or expired crypto session. Open the deal and start the action
          again.
        </p>
      </main>
    );
  }

  const dealId = String(session.deal_id);
  const milestoneIndex = Number(session.milestone_index ?? milestoneIndexFromUrl);

  const { data: deal } = await admin
    .from("deals")
    .select("*")
    .eq("id", dealId)
    .single();
  if (!deal) redirect("/dashboard");

  const { data: milestones } = await admin
    .from("deal_milestones")
    .select("milestone_index, amount, label")
    .eq("deal_id", dealId)
    .order("milestone_index", { ascending: true });

  const { data: settlements } = await admin
    .from("crypto_settlements")
    .select("*")
    .eq("deal_id", dealId)
    .order("milestone_index", { ascending: true });

  const settlement =
    settlements?.find((s) => Number(s.milestone_index) === milestoneIndex) ||
    null;

  const assetCode = String(deal.asset_code || deal.currency || "SOL").toUpperCase();
  const walletAsset = assetCode === "SOL" ? "SOL" : assetCode;

  let { data: sellerWallet } = await admin
    .from("wallets")
    .select("address")
    .eq("user_id", deal.seller_id)
    .eq("network", "devnet")
    .eq("asset_code", walletAsset)
    .eq("is_primary", true)
    .maybeSingle();

  if (!sellerWallet?.address && walletAsset !== "SOL") {
    const { data: solW } = await admin
      .from("wallets")
      .select("address")
      .eq("user_id", deal.seller_id)
      .eq("network", "devnet")
      .eq("asset_code", "SOL")
      .eq("is_primary", true)
      .maybeSingle();
    sellerWallet = solW;
  }

  const role =
    deal.buyer_id === user.id
      ? "buyer"
      : deal.seller_id === user.id
        ? "seller"
        : null;
  if (!role) redirect("/dashboard");

  const { data: openDisputes } = await admin
    .from("deal_disputes")
    .select("status, milestone_index")
    .eq("deal_id", dealId)
    .eq("status", "open");

  const disputedIndexes = (openDisputes ?? []).map((d: { milestone_index: number }) =>
    Number(d.milestone_index)
  );
  const dispute = (openDisputes ?? []).find(
    (d: { milestone_index: number }) => Number(d.milestone_index) === milestoneIndex
  );

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
        <PageBackLink href={`/deals/${dealId}`} label="Back to deal" />
      <div>
        <h1 className="text-xl font-semibold">{deal.title}</h1>
        <p className="mt-1 text-sm text-gray-600">
          {deal.deal_code} ·{" "}
          <span className="inline-flex items-center gap-1">
            <TokenIcon code={assetCode} size={14} />
            {assetCode}
          </span>{" "}
          · {deal.escrow_type || "one_time"}
        </p>
        {deal.agreed_deadline && (
          <p className="mt-1 text-xs text-gray-500">
            Agreed trade deadline:{" "}
            {new Date(deal.agreed_deadline).toLocaleString()}
          </p>
        )}
      </div>

      {(milestones?.length ?? 0) > 0 && (
        <DepositMilestoneSwitcher
          dealId={dealId}
          assetCode={assetCode}
          currentIndex={milestoneIndex}
          milestones={(milestones ?? []).map((m) => ({
            milestone_index: Number(m.milestone_index),
            amount: m.amount,
            label: m.label,
          }))}
          settlements={(settlements ?? []).map((s) => ({
            milestone_index: Number(s.milestone_index),
            onchain_status: s.onchain_status,
          }))}
          disputedIndexes={disputedIndexes}
        />
      )}

      {["SOL", "USDC", "USDT"].includes(String(assetCode || "").toUpperCase()) && (
        <div className="mb-5">
          <CrossChainFundPanel
            dealId={deal.id}
            destinationAsset={String(assetCode || "USDC").toUpperCase()}
          />
        </div>
      )}

      <SolanaCreateEscrow
        dealId={deal.id}
        session={capability}
        sellerWallet={sellerWallet?.address || settlement?.seller_wallet || ""}
        initialStatus={deal.status}
        initialOnchainStatus={settlement?.onchain_status || "not_created"}
        role={role}
        milestoneIndex={milestoneIndex}
        milestoneCount={Number(deal.milestone_count || 1)}
        assetCode={assetCode}
        disputed={Boolean(dispute)}
      />
    </main>
  );
}
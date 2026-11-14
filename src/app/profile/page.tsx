import TokenIcon from "@/components/TokenIcon";
import {
  CheckCircle2,
  Pencil,
  UserRound,
  Wallet,
  Radio,
} from "lucide-react";
import AuthenticatedShell from "@/components/layout/AuthenticatedShell";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { getFinancialEligibility } from "@/lib/domain/financial-eligibility";
import { ensureProfileUsername } from "@/lib/domain/ensure-username";
import DeviceBinding from "@/components/profile/DeviceBinding";
import ChannelsSection from "@/components/profile/ChannelsSection";
import WalletsSection from "@/components/profile/WalletsSection";
import ProfileEditSection from "@/components/profile/ProfileEditSection";

const TERMINAL = new Set([
  "completed",
  "cancelled",
  "refunded",
  "declined",
  "expired",
]);

function initials(display: string, username: string, email: string) {
  const base = (display || username || email || "TL").trim();
  const parts = base.split(/[\s@_]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return base.slice(0, 2).toUpperCase();
}

function memberSince(iso?: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function shortAddress(addr?: string | null) {
  if (!addr) return "Not connected";
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  await ensureProfileUsername(user.id, user.email);

  const [
    { data: profile },
    { data: wallets },
    { data: channels },
    { data: dealRows },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "username, display_name, full_name, phone, country, region, telegram_user_id, telegram_username, created_at"
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("wallets")
      .select("id, network, asset_code, address, is_primary")
      .eq("user_id", user.id)
      .order("is_primary", { ascending: false }),
    (supabase as any)
      .from("channel_connections")
      .select("id, channel, status, channel_user_id")
      .eq("user_id", user.id),
    supabase
      .from("deals")
      .select("id, status")
      .or(
        `created_by.eq.${user.id},buyer_id.eq.${user.id},seller_id.eq.${user.id}`
      ),
  ]);

  const eligibility = await getFinancialEligibility("NGN", "fiat", user.id);
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet";

  const username = String(profile?.username || "").trim();
  const displayName = String(
    profile?.display_name || username || user.email?.split("@")[0] || "Member"
  ).trim();
  const fullName = String(profile?.full_name || "").trim();
  const email = user.email || "";
  const walletList = (wallets ?? []) as Array<{
    id: string;
    network: string;
    asset_code: string;
    address: string;
    is_primary: boolean;
  }>;
  const channelList = (channels ?? []) as Array<{
    id: string;
    channel: string;
    status: string;
    channel_user_id: string;
  }>;

  const primaryWallet =
    walletList.find((w) => w.is_primary && w.asset_code === "SOL") ||
    walletList.find((w) => w.is_primary) ||
    walletList[0];

  const deals = dealRows ?? [];
  const totalDeals = deals.length;
  const completedDeals = deals.filter((d) => d.status === "completed").length;
  const activeDeals = deals.filter(
    (d) => d.status && !TERMINAL.has(String(d.status))
  ).length;

  const profileComplete = Boolean(username && fullName && displayName);
  const cryptoReady = Boolean(username && walletList.length > 0);
  const statusLabel = cryptoReady
    ? "Crypto-ready"
    : profileComplete
      ? "Profile complete"
      : email
        ? "Email linked"
        : "Getting started";

  const since = memberSince(profile?.created_at);

  return (
    <AuthenticatedShell>
      <main className="mx-auto max-w-[960px] px-4 py-7 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-[var(--tl-ink)]">
              Profile
            </h1>
            <p className="mt-2 text-sm text-[var(--tl-muted)]">
              Manage your account and deal identity.
            </p>
          </div>
          <a
            href="#edit-profile"
            className="tl-button tl-button-success inline-flex w-fit items-center gap-2 no-underline"
          >
            <Pencil size={15} />
            Edit profile
          </a>
        </div>

        <section className="mt-6 rounded-[22px] border border-[var(--tl-line)] bg-[var(--tl-card)] p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[var(--tl-emerald)]/30 bg-[var(--tl-emerald-soft)] text-lg font-black text-[var(--tl-emerald)]">
              {initials(displayName, username, email)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-xl font-bold text-[var(--tl-ink)]">
                  {displayName}
                </h2>
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--tl-emerald)]/30 bg-[var(--tl-emerald-soft)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--tl-emerald)]">
                  <CheckCircle2 size={12} />
                  {statusLabel}
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--tl-muted)]">
                {username ? `@${username}` : "Set a TrustLayer username"}
                {since ? ` · Member since ${since}` : ""}
              </p>
              <p className="mt-2 max-w-xl text-xs leading-5 text-[var(--tl-muted)]">
                Solana escrow is non-custodial — wallet control stays with you.
                Fiat limits apply only when fiat is enabled.
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-[var(--tl-line)] pt-5">
            <Stat label="Total deals" value={totalDeals} />
            <Stat label="Active deals" value={activeDeals} />
            <Stat label="Completed" value={completedDeals} />
          </div>
        </section>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Snapshot
            icon={<UserRound size={16} />}
            label="Account identity"
            value={username ? `@${username}` : "—"}
          />
          <Snapshot
            icon={<Wallet size={16} />}
            label="Wallets connected"
            value={String(walletList.length)}
          />
          <Snapshot
            icon={<Radio size={16} />}
            label="Connected channels"
            value={String(channelList.length)}
          />
        </div>

        <section className="mt-5 rounded-[20px] border border-[var(--tl-line)] bg-[var(--tl-card)] p-5">
          <h3 className="text-sm font-bold text-[var(--tl-ink)]">
            Account information
          </h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--tl-line)]/80 pb-3">
              <dt className="text-[var(--tl-muted)]">Email</dt>
              <dd className="font-medium text-[var(--tl-ink)]">
                {email || "—"}
              </dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--tl-line)]/80 pb-3">
              <dt className="text-[var(--tl-muted)]">Primary wallet</dt>
              <dd className="inline-flex flex-wrap items-center gap-1.5 font-mono text-xs font-medium text-[var(--tl-ink)]">
                {shortAddress(primaryWallet?.address)}
                {primaryWallet ? (
                  <>
                    <span>·</span>
                    <TokenIcon code={primaryWallet.asset_code} size={14} />
                    <span>
                      {primaryWallet.asset_code} ({primaryWallet.network})
                    </span>
                  </>
                ) : null}
              </dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-[var(--tl-muted)]">Full legal name</dt>
              <dd className="font-medium text-[var(--tl-ink)]">
                {fullName || "Not set"}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-[11px] text-[var(--tl-muted)]">
            TrustLayer username is your deal handle. Telegram @ stays under
            Connected channels.
          </p>
        </section>

        <section className="mt-5 rounded-[20px] border border-[var(--tl-emerald)]/20 bg-[var(--tl-card)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[var(--tl-ink)]">
              Deal readiness
            </h3>
            <span className="text-xs font-bold text-[var(--tl-emerald)]">
              {cryptoReady ? "Ready for Solana deals" : "Finish setup"}
            </span>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            <ReadyRow ok={Boolean(email)} label="Email on file" />
            <ReadyRow ok={Boolean(username)} label="TrustLayer username" />
            <ReadyRow ok={Boolean(fullName)} label="Full legal name" />
            <ReadyRow
              ok={walletList.length > 0}
              label="Solana wallet linked"
            />
          </ul>
        </section>

        <ProfileEditSection
          username={username}
          displayName={String(profile?.display_name || "")}
          fullName={fullName}
          phone={String(profile?.phone || "")}
          country={String(profile?.country || "")}
          region={String(profile?.region || "")}
        />

        <details className="mt-5 rounded-[20px] border border-[var(--tl-line)] bg-[var(--tl-card)]">
          <summary className="cursor-pointer list-none px-5 py-4 text-sm font-bold text-[var(--tl-ink)] marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="flex items-center justify-between gap-2">
              Fiat eligibility (when live)
              <span className="rounded-full border border-[var(--tl-line)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--tl-muted)]">
                Coming
              </span>
            </span>
            <span className="mt-1 block text-xs font-normal text-[var(--tl-muted)]">
              NGN-style limits apply only to fiat deals. Crypto has no ₦ cap.
            </span>
          </summary>
          <div className="border-t border-[var(--tl-line)] px-5 py-4">
            <p className="text-2xl font-black text-[var(--tl-ink)]">
              Level {eligibility.verificationLevel ?? 0}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl bg-[var(--tl-bg-elevated)] p-3">
                <p className="font-bold text-[var(--tl-muted)]">Single</p>
                <p className="mt-1 font-black text-[var(--tl-ink)]">
                  ₦
                  {Number(
                    eligibility.singleDealLimit || 100000
                  ).toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl bg-[var(--tl-bg-elevated)] p-3">
                <p className="font-bold text-[var(--tl-muted)]">Open</p>
                <p className="mt-1 font-black text-[var(--tl-ink)]">
                  ₦
                  {Number(
                    eligibility.openExposureLimit || 200000
                  ).toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl bg-[var(--tl-bg-elevated)] p-3">
                <p className="font-bold text-[var(--tl-muted)]">Current</p>
                <p className="mt-1 font-black text-[var(--tl-ink)]">
                  ₦{Number(eligibility.openExposure || 0).toLocaleString()}
                </p>
              </div>
            </div>
            <p className="mt-4 text-xs text-[var(--tl-muted)]">
              Country-specific ID types appear here when a fiat provider is
              enabled — not required for non-custodial Solana escrow.
            </p>
          </div>
        </details>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <WalletsSection wallets={walletList as any} cluster={cluster} />
          <div className="space-y-4">
            <ChannelsSection
              channels={channelList as any}
              telegramUserId={(profile as any)?.telegram_user_id}
              telegramUsername={(profile as any)?.telegram_username}
            />
            <section className="rounded-[20px] border border-[var(--tl-line)] bg-[var(--tl-card)] p-5">
              <DeviceBinding />
            </section>
          </div>
        </div>
      </main>
    </AuthenticatedShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center sm:text-left">
      <p className="text-2xl font-black text-[var(--tl-ink)]">{value}</p>
      <p className="mt-1 text-[11px] font-medium text-[var(--tl-muted)]">
        {label}
      </p>
    </div>
  );
}

function Snapshot({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[18px] border border-[var(--tl-line)] bg-[var(--tl-card)] p-4">
      <div className="flex items-center gap-2 text-[var(--tl-muted)]">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--tl-emerald)]/20 bg-[var(--tl-emerald-soft)] text-[var(--tl-emerald)]">
          {icon}
        </span>
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-3 truncate text-lg font-bold text-[var(--tl-ink)]">
        {value}
      </p>
    </div>
  );
}

function ReadyRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-[var(--tl-ink)]">
      <span
        className={`h-2 w-2 rounded-full ${
          ok ? "bg-[var(--tl-emerald)]" : "bg-[var(--tl-line)]"
        }`}
      />
      <span className={ok ? "" : "text-[var(--tl-muted)]"}>{label}</span>
      <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-[var(--tl-muted)]">
        {ok ? "Done" : "Needed"}
      </span>
    </li>
  );
}
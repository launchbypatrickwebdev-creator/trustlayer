import PartnerShell from "@/components/partner/PartnerShell";
import ApiKeyManager from "@/components/partner/ApiKeyManager";
import { requirePartnerMember } from "@/lib/domain/partner-api/partner-console";

export default async function PartnerKeysPage({
  searchParams,
}: {
  searchParams: Promise<{ partner?: string }>;
}) {
  const sp = await searchParams;
  const { membership, memberships, admin } = await requirePartnerMember({
    partnerIdQuery: sp.partner, allowedRoles: ["owner", "developer"],
  });

  const { data: keys } = await admin
    .from("api_credentials")
    .select(
      "id, key_prefix, label, scopes, environment, status, last_used_at, created_at, revoked_at"
    )
    .eq("partner_id", membership.partnerId)
    .order("created_at", { ascending: false });

  return (
    <PartnerShell active="keys" partnerName={membership.partnerName} partnerId={membership.partnerId} memberships={memberships} role={membership.role} environmentHint="all">
      <div className="mb-6"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">Security</p><h1 className="mt-1 text-3xl font-black tracking-tight text-white">API keys</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Create least-privilege credentials for each integration and environment. Live keys require owner access; secrets are shown only once.</p></div>
      <ApiKeyManager partnerId={membership.partnerId} role={membership.role} keys={(keys ?? []) as any[]} />
    </PartnerShell>
  );
}

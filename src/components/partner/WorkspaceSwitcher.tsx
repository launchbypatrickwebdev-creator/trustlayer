"use client";
import { useRouter } from "next/navigation";
import type { PartnerMembership } from "@/lib/domain/partner-api/partner-console";
export default function WorkspaceSwitcher({ memberships, partnerId }: { memberships: PartnerMembership[]; partnerId: string }) {
  const router = useRouter();
  if (memberships.length < 2) return null;
  return <label className="block"><span className="sr-only">Switch workspace</span><select aria-label="Switch workspace" value={partnerId} onChange={(e) => router.push(`/partner?partner=${encodeURIComponent(e.target.value)}`)} className="max-w-36 rounded-lg border border-[#2a3c50] bg-[#0d1b2b] px-3 py-2 text-xs text-slate-200">{memberships.map(m => <option key={m.partnerId} value={m.partnerId}>{m.partnerName}</option>)}</select></label>;
}

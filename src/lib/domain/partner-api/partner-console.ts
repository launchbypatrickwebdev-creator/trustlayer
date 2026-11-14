import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { redirect } from "next/navigation";

export type PartnerMembership = {
  partnerId: string;
  partnerName: string;
  partnerStatus: string;
  role: "owner" | "developer" | "viewer" | "operator";
  userId: string;
};

export async function requirePartnerMember(opts?: {
  partnerIdQuery?: string | null;
  allowedRoles?: string[];
}): Promise<{
  membership: PartnerMembership;
  memberships: PartnerMembership[];
  admin: ReturnType<typeof createSupabaseAdminClient>;
}> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/partner");

  const admin = createSupabaseAdminClient();
  // Admin = trustlayer_admins (profiles has no is_admin / role columns)
  let isAdmin = false;
  try {
    const { data: adm } = await (admin.rpc as any)("is_trustlayer_admin", {
      p_user_id: user.id,
    });
    isAdmin = adm === true;
  } catch {
    isAdmin = false;
  }

  if (opts?.partnerIdQuery && isAdmin) {
    const { data: partner } = await admin.from("api_partners")
      .select("id, name, status").eq("id", opts.partnerIdQuery).maybeSingle();
    if (!partner) redirect("/admin/partners");
    const membership: PartnerMembership = {
      partnerId: partner.id, partnerName: partner.name, partnerStatus: partner.status,
      role: "viewer", userId: user.id,
    };
    return { admin, membership, memberships: [membership] };
  }

  const { data: rows, error } = await admin.from("partner_members")
    .select("role, partner_id, api_partners(id, name, status)")
    .eq("user_id", user.id).order("created_at", { ascending: true });
  if (error || !rows?.length) redirect("/partner/no-access");

  const memberships: PartnerMembership[] = rows.flatMap((row: any) => {
    const partner = Array.isArray(row.api_partners) ? row.api_partners[0] : row.api_partners;
    if (!partner) return [];
    return [{
      partnerId: partner.id, partnerName: partner.name, partnerStatus: partner.status,
      role: row.role as PartnerMembership["role"], userId: user.id,
    }];
  });
  const membership = (opts?.partnerIdQuery && memberships.find(m => m.partnerId === opts.partnerIdQuery))
    || memberships[0];
  if (!membership) redirect("/partner/no-access");
  const allowedRoles = opts?.allowedRoles || ["owner", "developer", "viewer"];
  if (!allowedRoles.includes(membership.role)) {
    redirect(membership.role === "operator" ? `/partner/tasks?partner=${encodeURIComponent(membership.partnerId)}` : "/partner/no-access");
  }
  // A workspace query is never authorization: only memberships returned from the user's own rows are selectable.
  return { admin, membership, memberships };
}

export function canManagePartner(role: string) {
  return role === "owner" || role === "developer";
}
export function isPartnerOwner(role: string) {
  return role === "owner";
}

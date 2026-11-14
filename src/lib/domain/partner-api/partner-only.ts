import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { redirect } from "next/navigation";

/**
 * If this user is a partner-only member (and not a platform admin),
 * send them to the Partner Console instead of deal UI.
 */
export async function redirectIfPartnerOnly(
  userId: string | undefined | null
) {
  if (!userId) return;
  const admin = createSupabaseAdminClient();

  // Platform admin bypasses partner-only redirect
  try {
    const { data: isAdmin } = await (admin.rpc as any)("is_trustlayer_admin", {
      p_user_id: userId,
    });
    if (isAdmin === true) return;
  } catch {
    /* not admin */
  }

  const { data: rows } = await admin
    .from("partner_members")
    .select("partner_only")
    .eq("user_id", userId)
    .eq("partner_only", true)
    .limit(1);

  if (rows && rows.length > 0) {
    redirect("/partner");
  }
}

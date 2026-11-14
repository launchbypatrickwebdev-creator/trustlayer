import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { redirectIfPartnerOnly } from "@/lib/domain/partner-api/partner-only";

export default async function AuthenticatedShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Partner-only operators skip deal UI → Partner Console
  await redirectIfPartnerOnly(user.id);

  let isAdmin = false;
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await (admin.rpc as any)("is_trustlayer_admin", {
      p_user_id: user.id,
    });
    isAdmin = data === true;
  } catch {
    /* admin navigation is optional; authorization remains server-side */
  }

  return (
    <AppShell userEmail={user.email} isAdmin={isAdmin}>
      {children}
    </AppShell>
  );
}
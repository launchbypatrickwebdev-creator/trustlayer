import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";

export async function requireAdminUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Authentication required.");
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await (admin.rpc as any)("is_trustlayer_admin", {
    p_user_id: user.id,
  });

  if (error || data !== true) {
    throw new Error("Admin access required.");
  }

  return { user, admin };
}

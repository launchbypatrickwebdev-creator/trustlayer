import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { TrustLayerDatabase } from "@/lib/db/supabase-types";

let adminClient: SupabaseClient<TrustLayerDatabase> | null = null;

/**
 * Server-only Supabase client.
 *
 * Never import this module into Client Components. The service-role key
 * bypasses RLS and is reserved for controlled TrustLayer server operations.
 */
export function createSupabaseAdminClient(): SupabaseClient<TrustLayerDatabase> {
  if (adminClient) {
    return adminClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase server configuration is missing.");
  }

  adminClient = createClient<TrustLayerDatabase>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return adminClient;
}

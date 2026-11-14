import { createBrowserClient } from "@supabase/ssr";
import type { TrustLayerDatabase } from "@/lib/db/supabase-types";

export function createSupabaseBrowserClient() {
  return createBrowserClient<TrustLayerDatabase>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { TrustLayerDatabase } from "@/lib/db/supabase-types";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<TrustLayerDatabase>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components may not be able to write cookies.
            // Middleware handles session refresh.
          }
        },
      },
    }
  );
}

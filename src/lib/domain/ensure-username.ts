import crypto from "crypto";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";

/**
 * Ensure profiles.username is set for a real user.
 * Prefer email local-part when free; otherwise user_<random>.
 * Does not overwrite an existing username.
 */
export async function ensureProfileUsername(
  userId: string,
  email?: string | null
): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("profiles")
    .select("id, username")
    .eq("id", userId)
    .maybeSingle();

  if (!existing) return null;
  if (existing.username) return existing.username;

  const local = String(email || "")
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24);

  const candidates: string[] = [];
  if (local.length >= 3) candidates.push(local);
  for (let i = 0; i < 8; i++) {
    const suffix = crypto.randomBytes(3).toString("hex");
    if (local.length >= 2) candidates.push(`${local.slice(0, 20)}_${suffix}`);
    candidates.push(`user_${suffix}`);
  }

  for (const candidate of candidates) {
    if (!/^[a-z0-9_]{3,32}$/.test(candidate)) continue;
    const { data: taken } = await admin
      .from("profiles")
      .select("id")
      .ilike("username", candidate)
      .maybeSingle();
    if (taken) continue;

    const { error } = await admin
      .from("profiles")
      .update({ username: candidate })
      .eq("id", userId)
      .is("username", null);
    if (!error) return candidate;
  }

  return null;
}

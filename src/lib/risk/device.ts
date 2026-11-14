import crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";

export function hashDeviceKey(deviceKey: string) {
  const value = deviceKey.trim();
  if (value.length < 16) throw new Error("Invalid device key.");
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function registerDeviceBinding(userId: string, deviceKey: string, metadata: Record<string, unknown> = {}) {
  const hash = hashDeviceKey(deviceKey);
  const admin = createSupabaseAdminClient();
  const { data, error } = await (admin as any).from("device_bindings").upsert({
    user_id: userId, device_key_hash: hash, last_seen_at: new Date().toISOString(), metadata,
  }, { onConflict: "user_id,device_key_hash" }).select("id,status,risk_score,last_seen_at").maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

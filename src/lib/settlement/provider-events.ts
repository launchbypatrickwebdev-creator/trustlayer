import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";

export async function recordProviderEvent(input: {
  provider: string;
  providerEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await (admin as any)
    .from("settlement_provider_events")
    .insert({ provider: input.provider, provider_event_id: input.providerEventId, event_type: input.eventType, payload: input.payload })
    .select("id,provider,provider_event_id,status")
    .maybeSingle();

  if (error?.code === "23505") {
    const { data: existing, error: readError } = await (admin as any)
      .from("settlement_provider_events")
      .select("id,provider,provider_event_id,status")
      .eq("provider", input.provider)
      .eq("provider_event_id", input.providerEventId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    return { duplicate: true, event: existing };
  }
  if (error) throw new Error(error.message);
  return { duplicate: false, event: data };
}

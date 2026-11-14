import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import AuthenticatedShell from "@/components/layout/AuthenticatedShell";
import ActivityWorkspace from "@/components/activity/ActivityWorkspace";

export default async function ActivityPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: deals } = await supabase
    .from("deals")
    .select("id, deal_code, title")
    .or(
      `created_by.eq.${user.id},buyer_id.eq.${user.id},seller_id.eq.${user.id}`
    )
    .limit(100);

  const dealIds = (deals || []).map((d) => d.id);
  const dealMap = new Map(
    (deals || []).map((d) => [d.id, d as { id: string; deal_code: string; title: string | null }])
  );

  let events: Array<{
    id: string;
    deal_id: string;
    event_type: string;
    actor_type: string | null;
    created_at: string;
    metadata: Record<string, unknown> | null;
  }> = [];

  if (dealIds.length > 0) {
    const { data } = await supabase
      .from("deal_events")
      .select("id, deal_id, event_type, actor_type, created_at, metadata")
      .in("deal_id", dealIds)
      .order("created_at", { ascending: false })
      .limit(120);
    events = (data || []) as typeof events;
  }

  const rows = events.map((e) => {
    const deal = dealMap.get(e.deal_id);
    return {
      id: e.id,
      deal_id: e.deal_id,
      deal_code: deal?.deal_code || "—",
      deal_title: deal?.title || null,
      event_type: e.event_type,
      actor_type: e.actor_type || "user",
      created_at: e.created_at,
      metadata: e.metadata,
    };
  });

  return (
    <AuthenticatedShell>
      <ActivityWorkspace events={rows} />
    </AuthenticatedShell>
  );
}
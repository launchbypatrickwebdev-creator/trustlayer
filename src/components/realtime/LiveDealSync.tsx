"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/db/supabase-browser";

// Tables that filter by deal_id
const DEAL_ID_TABLES = [
  "deal_milestones",
  "crypto_settlements",
  "deal_invitations",
  "deal_disputes",
  "deal_events",
  "deal_attachments",
  "dispute_messages",
] as const;

export default function LiveDealSync({ dealId }: { dealId: string }) {
  const router = useRouter();

  useEffect(() => {
    if (!dealId) return;

    const supabase = createSupabaseBrowserClient();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      window.dispatchEvent(
        new CustomEvent("trustlayer:deal-updated", { detail: { dealId } })
      );
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 80);
    };

    // Build the channel first; register ALL .on() before .subscribe()
    const channel = supabase.channel(`trustlayer-deal-${dealId}`);

    // deals table primary key is `id`, not `deal_id`
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "deals",
        filter: `id=eq.${dealId}`,
      },
      refresh
    );

    // All other tables use deal_id
    for (const table of DEAL_ID_TABLES) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `deal_id=eq.${dealId}`,
        },
        refresh
      );
    }

    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [dealId, router]);

  return null;
}
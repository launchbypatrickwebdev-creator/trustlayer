"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/db/supabase-browser";

export default function LiveAccountSync({ userId }: { userId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(`trustlayer-account-${userId}`);
    const refresh = () => router.refresh();
    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "deals", filter: `created_by=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "deals", filter: `buyer_id=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "deals", filter: `seller_id=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "deal_invitations", filter: `inviter_id=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "deal_invitations", filter: `invitee_user_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId, router]);
  return null;
}

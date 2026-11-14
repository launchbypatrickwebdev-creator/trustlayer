"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/db/supabase-browser";
export default function LiveAdminSync(){ const router=useRouter(); useEffect(()=>{const s=createSupabaseBrowserClient();const c=s.channel("trustlayer-admin-live");const refresh=()=>router.refresh();["deal_disputes","deals","crypto_settlements","deal_events","dispute_messages"].forEach(table=>c.on("postgres_changes",{event:"*",schema:"public",table},refresh));c.subscribe();return()=>{void s.removeChannel(c)}},[router]);return null; }

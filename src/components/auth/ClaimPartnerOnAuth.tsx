"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

const STORAGE_KEY = "tl_partner_claim_token";
const NEXT_KEY = "tl_partner_claim_next";

export default function ClaimPartnerOnAuth({ isAuthenticated }: { isAuthenticated: boolean }) {
  const search = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    const fromUrl = search.get("partner_claim");
    if (fromUrl) {
      try {
        sessionStorage.setItem(STORAGE_KEY, fromUrl);
        const next = search.get("next");
        if (next && next.startsWith("/")) sessionStorage.setItem(NEXT_KEY, next);
      } catch { /* ignore */ }
    }
  }, [search]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let token: string | null = search.get("partner_claim");
    let next: string | null = search.get("next");
    if (!token) {
      try {
        token = sessionStorage.getItem(STORAGE_KEY);
        next = next || sessionStorage.getItem(NEXT_KEY);
      } catch { token = null; }
    }
    if (!token || attempted.current === token) return;
    attempted.current = token;
    let cancelled = false;
    (async () => {
      setMessage("Linking this partner deal to your account…");
      try {
        const res = await fetch("/api/partner-claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, next: next || undefined }),
        });
        const body = (await res.json()) as { error?: string; redirectTo?: string; alreadyClaimed?: boolean; dealId?: string };
        if (!res.ok) throw new Error(body.error || "Could not claim partner deal.");
        try { sessionStorage.removeItem(STORAGE_KEY); sessionStorage.removeItem(NEXT_KEY); } catch { /* */ }
        if (cancelled) return;
        setMessage(body.alreadyClaimed ? "Already linked. Opening deal…" : "Deal linked. Opening…");
        const dest = body.redirectTo || (body.dealId ? `/deals/${body.dealId}` : "/dashboard");
        window.location.href = dest.startsWith("/") ? dest : "/dashboard";
      } catch (e) {
        if (!cancelled) setMessage(e instanceof Error ? e.message : "Could not claim partner deal.");
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, search]);

  if (!message) return null;
  return <p className="mx-auto max-w-lg px-4 py-2 text-center text-sm text-[var(--tl-muted)]">{message}</p>;
}

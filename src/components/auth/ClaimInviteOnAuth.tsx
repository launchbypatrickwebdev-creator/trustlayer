"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const STORAGE_KEY = "tl_invite_token";

/**
 * Drop into /login and /dashboard (or layout).
 * - Saves ?invite= from URL into sessionStorage
 * - After the user is authenticated, POSTs /api/invites/claim and routes to the deal
 */
export default function ClaimInviteOnAuth({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  const search = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const fromUrl = search.get("invite");
    if (fromUrl) {
      try {
        sessionStorage.setItem(STORAGE_KEY, fromUrl);
      } catch {
        /* ignore */
      }
    }
  }, [search]);

  useEffect(() => {
    if (!isAuthenticated) return;

    let token: string | null = search.get("invite");
    if (!token) {
      try {
        token = sessionStorage.getItem(STORAGE_KEY);
      } catch {
        token = null;
      }
    }
    if (!token) return;

    let cancelled = false;

    (async () => {
      setMessage("Linking your invitation…");
      try {
        const res = await fetch("/api/invites/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = (await res.json()) as {
          error?: string;
          redirectTo?: string;
          dealId?: string;
          alreadyClaimed?: boolean;
        };
        if (!res.ok) {
          throw new Error(body.error || "Could not claim invitation.");
        }
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
        if (cancelled) return;
        setMessage(
          body.alreadyClaimed
            ? "Invitation already linked. Opening deal…"
            : "Invitation linked. Opening deal…"
        );
        router.replace(body.redirectTo || `/deals/${body.dealId}`);
        router.refresh();
      } catch (e) {
        if (!cancelled) {
          setMessage(
            e instanceof Error ? e.message : "Could not claim invitation."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, search, router]);

  if (!message) return null;

  return (
    <p className="mx-auto max-w-lg px-4 py-2 text-center text-sm text-[var(--tl-muted)]">
      {message}
    </p>
  );
}

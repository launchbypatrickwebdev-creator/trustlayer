"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const KEY = "tl_partner_invite_token";

export default function ClaimPartnerInviteOnAuth({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || ran.current) return;
    let token: string | null = null;
    try {
      const q = new URLSearchParams(window.location.search);
      token = q.get("partner_invite");
      if (!token) token = sessionStorage.getItem(KEY);
    } catch {
      return;
    }
    if (!token) return;
    ran.current = true;

    (async () => {
      try {
        const res = await fetch("/api/partner/invites/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const json = await res.json().catch(() => ({}));
        try {
          sessionStorage.removeItem(KEY);
        } catch {
          /* ignore */
        }
        if (res.ok) {
          router.replace("/partner");
          router.refresh();
          return;
        }
        console.warn("[partner invite]", json.error || res.status);
      } catch (e) {
        console.warn("[partner invite]", e);
      }
    })();
  }, [isAuthenticated, router]);

  return null;
}

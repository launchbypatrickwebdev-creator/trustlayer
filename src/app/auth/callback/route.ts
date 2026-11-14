import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { claimInviteByToken } from "@/lib/domain/claim-invite";
import { claimBotIdentity } from "@/lib/domain/claim-bot";
import { claimPartnerToken } from "@/lib/domain/partner-api/claim-tokens";
import { ensureProfileUsername } from "@/lib/domain/ensure-username";

/**
 * Magic-link return. Claims invite and/or bot_claim SERVER-SIDE so email
 * clients that open a clean browser still attach deals.
 * Also assigns a TrustLayer username once if the profile has none.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;

  const code = requestUrl.searchParams.get("code");
  const nextRaw = requestUrl.searchParams.get("next") || "/dashboard";

  let invite = requestUrl.searchParams.get("invite");
  let botClaim = requestUrl.searchParams.get("bot_claim");
  let partnerClaim = requestUrl.searchParams.get("partner_claim");
  let nextPath = nextRaw;

  try {
    if (nextRaw.startsWith("/")) {
      const nested = new URL(nextRaw, origin);
      if (!invite) invite = nested.searchParams.get("invite");
      if (!botClaim) botClaim = nested.searchParams.get("bot_claim");
      if (!partnerClaim) partnerClaim = nested.searchParams.get("partner_claim");
      nextPath = nested.pathname + nested.search;
    }
  } catch {
    /* keep nextRaw */
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", origin));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=auth_failed", origin));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.id) {
    try {
      await ensureProfileUsername(user.id, user.email);
    } catch (e) {
      console.warn(
        "[auth/callback] ensure username:",
        e instanceof Error ? e.message : e
      );
    }
  }

  if (invite && user?.id) {
    try {
      const result = await claimInviteByToken(invite, user.id);
      return NextResponse.redirect(new URL(`/deals/${result.dealId}`, origin));
    } catch (e) {
      console.warn(
        "[auth/callback] invite claim failed:",
        e instanceof Error ? e.message : e
      );
      const fallback = new URL("/dashboard", origin);
      fallback.searchParams.set("invite", invite);
      return NextResponse.redirect(fallback);
    }
  }

  if (botClaim && user?.id) {
    try {
      await claimBotIdentity(botClaim, user.id);
      let dest = "/dashboard";
      try {
        if (nextPath.startsWith("/")) {
          const nested = new URL(nextPath, origin);
          const n = nested.searchParams.get("next");
          if (n && n.startsWith("/") && !n.startsWith("//")) dest = n;
          else if (nested.pathname.startsWith("/deals/")) {
            dest = nested.pathname;
          }
        }
      } catch {
        /* dashboard */
      }
      return NextResponse.redirect(new URL(dest, origin));
    } catch (e) {
      console.warn(
        "[auth/callback] bot claim failed:",
        e instanceof Error ? e.message : e
      );
      const fallback = new URL("/dashboard", origin);
      fallback.searchParams.set("bot_claim", botClaim);
      return NextResponse.redirect(fallback);
    }
  }


  if (partnerClaim && user?.id) {
    try {
      const result = await claimPartnerToken(partnerClaim, user.id);
      let dest = `/deals/${result.dealId}`;
      try {
        if (nextPath.startsWith("/")) {
          const nested = new URL(nextPath, origin);
          const n = nested.searchParams.get("next");
          if (n && n.startsWith("/") && !n.startsWith("//")) dest = n;
          else if (nested.pathname.startsWith("/deals/")) dest = nested.pathname;
        }
      } catch { /* deal */ }
      return NextResponse.redirect(new URL(dest, origin));
    } catch (e) {
      console.warn("[auth/callback] partner claim failed:", e instanceof Error ? e.message : e);
      const fallback = new URL("/dashboard", origin);
      fallback.searchParams.set("partner_claim", partnerClaim);
      return NextResponse.redirect(fallback);
    }
  }

  const safeNext =
    nextPath.startsWith("/") && !nextPath.startsWith("//")
      ? nextPath
      : "/dashboard";

  return NextResponse.redirect(new URL(safeNext, origin));
}

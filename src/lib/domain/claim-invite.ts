import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";

export type ClaimInviteResult = {
  dealId: string;
  dealCode: string | null;
  status: string | null;
  role: "buyer" | "seller";
  alreadyClaimed: boolean;
};

/**
 * Live schema: deal_invitations.token (there is NO invitation_token column).
 * Moves pending buyer_id/seller_id onto the real signed-in user.
 */
export async function claimInviteByToken(
  token: string,
  realUserId: string
): Promise<ClaimInviteResult> {
  const clean = String(token || "").trim();
  if (!clean || clean.length < 16) {
    throw new Error("Invalid invitation token.");
  }
  if (!realUserId) {
    throw new Error("Authentication required.");
  }

  const admin = createSupabaseAdminClient();

  // ONLY column that exists in your DB
  let inv: {
    id: string;
    deal_id: string;
    status?: string | null;
    token?: string | null;
  } | null = null;

  {
    const { data, error: invErr } = await admin
      .from("deal_invitations")
      .select("id, deal_id, status, token")
      .eq("token", clean)
      .maybeSingle();
    if (invErr) {
      throw new Error(invErr.message || "Unable to load invitation.");
    }
    inv = data as { id: string; deal_id: string; status?: string | null; token?: string | null } | null;
  }

  // Retry: some rows may store token without hyphens (or vice versa)
  if (!inv?.deal_id) {
    const alt = clean.replace(/-/g, "");
    if (alt !== clean) {
      const { data } = await admin
        .from("deal_invitations")
        .select("id, deal_id, status, token")
        .eq("token", alt)
        .maybeSingle();
      inv = data as { id: string; deal_id: string; status?: string | null; token?: string | null } | null;
    }
  }

  if (!inv?.deal_id) {
    throw new Error(
      "This invitation link does not match any deal_invitations.token row. Create a new deal after deploying the token sync fix, or recover the seat with SQL."
    );
  }

  const { data: deal, error: dealErr } = await admin
    .from("deals")
    .select("id, deal_code, status, created_by, buyer_id, seller_id")
    .eq("id", inv.deal_id)
    .single();

  if (dealErr || !deal) {
    throw new Error(dealErr?.message || "Deal not found for this invitation.");
  }

  if (deal.buyer_id === realUserId || deal.seller_id === realUserId) {
    return {
      dealId: deal.id,
      dealCode: deal.deal_code,
      status: deal.status,
      role: deal.buyer_id === realUserId ? "buyer" : "seller",
      alreadyClaimed: true,
    };
  }

  if (deal.created_by === realUserId) {
    throw new Error("You created this deal; the invite is for the counterparty.");
  }

  const creatorId = deal.created_by as string;
  let role: "buyer" | "seller";
  let pendingId: string | null = null;

  if (deal.buyer_id && deal.buyer_id !== creatorId) {
    role = "buyer";
    pendingId = deal.buyer_id as string;
  } else if (deal.seller_id && deal.seller_id !== creatorId) {
    role = "seller";
    pendingId = deal.seller_id as string;
  } else if (!deal.buyer_id) {
    role = "buyer";
    pendingId = null;
  } else if (!deal.seller_id) {
    role = "seller";
    pendingId = null;
  } else {
    throw new Error(
      "This invitation is already linked to another TrustLayer account."
    );
  }

  if (pendingId && pendingId !== realUserId) {
    let provisional = true;
    try {
      const { data: authUser } = await (admin as any).auth.admin.getUserById(
        pendingId
      );
      const email = (authUser?.user?.email || "").toLowerCase();
      provisional =
        email.includes("@users.trustlayer.internal") ||
        email.startsWith("pending_");
    } catch {
      provisional = true;
    }
    if (!provisional) {
      throw new Error(
        "This invitation is already linked to another TrustLayer account."
      );
    }
  }

  const patch: Record<string, string> = {};
  if (role === "buyer") patch.buyer_id = realUserId;
  else patch.seller_id = realUserId;

  const { error: upErr } = await admin
    .from("deals")
    .update(patch)
    .eq("id", deal.id);

  if (upErr) {
    throw new Error(upErr.message || "Unable to attach you to this deal.");
  }

  // Verify seat stuck (admin client should bypass RLS)
  {
    const { data: verify } = await admin
      .from("deals")
      .select("buyer_id, seller_id")
      .eq("id", deal.id)
      .single();
    const ok =
      (role === "buyer" && verify?.buyer_id === realUserId) ||
      (role === "seller" && verify?.seller_id === realUserId);
    if (!ok) {
      throw new Error(
        "Seat update did not stick. Check deals RLS or contact support."
      );
    }
  }

  // RPC respond_to_deal_invitation requires invitee_user_id = actor
  {
    const { error: invUpErr } = await admin
      .from("deal_invitations")
      .update({
        invitee_user_id: realUserId,
        status: "pending",
      })
      .eq("id", inv.id);
    if (invUpErr) {
      console.warn("[claimInvite] invitee_user_id update:", invUpErr.message);
      // try by deal_id if id update failed
      await admin
        .from("deal_invitations")
        .update({ invitee_user_id: realUserId, status: "pending" })
        .eq("deal_id", deal.id)
        .eq("token", clean);
    }
  }

  try {
    if (pendingId) {
      const { data: pendingProfile } = await admin
        .from("profiles")
        .select("username, display_name, telegram_username")
        .eq("id", pendingId)
        .maybeSingle();
      if (pendingProfile) {
        const { data: myProfile } = await admin
          .from("profiles")
          .select("username, display_name")
          .eq("id", realUserId)
          .maybeSingle();
        const updates: Record<string, string> = {};
        if (!myProfile?.username && pendingProfile.username) {
          updates.username = pendingProfile.username;
        }
        if (!myProfile?.display_name && pendingProfile.display_name) {
          updates.display_name = pendingProfile.display_name;
        }
        if (Object.keys(updates).length) {
          await admin.from("profiles").update(updates).eq("id", realUserId);
        }
      }
    }
  } catch {
    /* non-fatal */
  }

  await admin.from("deal_events").insert({
    deal_id: deal.id,
    actor_user_id: realUserId,
    actor_type: "user",
    event_type: "invitation_claimed",
    metadata: {
      token_prefix: clean.slice(0, 8),
      role,
      previous_party_id: pendingId,
    },
  });

  return {
    dealId: deal.id,
    dealCode: deal.deal_code,
    status: deal.status,
    role,
    alreadyClaimed: false,
  };
}

/**
 * Manual recovery: attach real user to a deal by deal id when invite token was lost.
 * Only replaces provisional pending_* seats.
 */
export async function claimInviteByDealId(
  dealId: string,
  realUserId: string
): Promise<ClaimInviteResult> {
  const admin = createSupabaseAdminClient();
  const { data: deal, error } = await admin
    .from("deals")
    .select("id, deal_code, status, created_by, buyer_id, seller_id")
    .eq("id", dealId)
    .single();
  if (error || !deal) throw new Error(error?.message || "Deal not found.");

  if (deal.buyer_id === realUserId || deal.seller_id === realUserId) {
    return {
      dealId: deal.id,
      dealCode: deal.deal_code,
      status: deal.status,
      role: deal.buyer_id === realUserId ? "buyer" : "seller",
      alreadyClaimed: true,
    };
  }

  // Load token for this deal if any, then reuse main path logic via seat patch
  const creatorId = deal.created_by as string;
  let role: "buyer" | "seller";
  let pendingId: string | null = null;
  if (deal.buyer_id && deal.buyer_id !== creatorId) {
    role = "buyer";
    pendingId = deal.buyer_id;
  } else if (deal.seller_id && deal.seller_id !== creatorId) {
    role = "seller";
    pendingId = deal.seller_id;
  } else {
    throw new Error("Cannot determine counterparty seat on this deal.");
  }

  if (pendingId) {
    const { data: authUser } = await (admin as any).auth.admin.getUserById(
      pendingId
    );
    const email = (authUser?.user?.email || "").toLowerCase();
    const provisional =
      email.includes("@users.trustlayer.internal") ||
      email.startsWith("pending_");
    if (!provisional) {
      throw new Error("Counterparty seat is not a pending invite party.");
    }
  }

  const patch =
    role === "buyer"
      ? { buyer_id: realUserId }
      : { seller_id: realUserId };
  const { error: upErr } = await admin
    .from("deals")
    .update(patch)
    .eq("id", deal.id);
  if (upErr) throw new Error(upErr.message);

  await admin
    .from("deal_invitations")
    .update({ invitee_user_id: realUserId, status: "pending" })
    .eq("deal_id", deal.id);

  await admin.from("deal_events").insert({
    deal_id: deal.id,
    actor_user_id: realUserId,
    actor_type: "user",
    event_type: "invitation_claimed",
    metadata: { via: "deal_id", role, previous_party_id: pendingId },
  });

  return {
    dealId: deal.id,
    dealCode: deal.deal_code,
    status: deal.status,
    role,
    alreadyClaimed: false,
  };
}
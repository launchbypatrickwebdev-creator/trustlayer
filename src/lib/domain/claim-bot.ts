import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";

const SYNTHETIC_EMAIL_RE =
  /@(bot\.trustlayer\.local|telegram\.trustlayer\.local|users\.trustlayer\.internal)$/i;

export type ClaimBotResult = {
  alreadyClaimed: boolean;
  userId: string;
  sourceUserId: string;
  seatsMoved: number;
};

async function mustOk(
  label: string,
  res: { error: { message: string } | null }
) {
  if (res.error) {
    throw new Error(`${label}: ${res.error.message}`);
  }
}

/**
 * Move seats SOURCE → TARGET without violating deals_creator_is_party.
 * Same path for buyer and seller: any of created_by / buyer_id / seller_id
 * owned by SOURCE are rewritten to TARGET in one atomic update per deal.
 * Never UPDATE deal_events.
 */
async function reassignSeatsFromSource(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  sourceUserId: string,
  targetUserId: string
): Promise<number> {
  if (!sourceUserId || !targetUserId || sourceUserId === targetUserId) {
    return 0;
  }

  let moved = 0;

  const { data: dealRows, error: dealFindErr } = await admin
    .from("deals")
    .select("id, created_by, buyer_id, seller_id")
    .or(
      `created_by.eq.${sourceUserId},buyer_id.eq.${sourceUserId},seller_id.eq.${sourceUserId}`
    );

  if (dealFindErr) {
    throw new Error(`Seat move deals find: ${dealFindErr.message}`);
  }

  for (const d of dealRows || []) {
    const next = {
      created_by:
        d.created_by === sourceUserId ? targetUserId : d.created_by,
      buyer_id: d.buyer_id === sourceUserId ? targetUserId : d.buyer_id,
      seller_id: d.seller_id === sourceUserId ? targetUserId : d.seller_id,
    };

    if (
      next.created_by !== next.buyer_id &&
      next.created_by !== next.seller_id
    ) {
      if (d.created_by === sourceUserId) {
        if (d.buyer_id === sourceUserId) next.buyer_id = targetUserId;
        else if (d.seller_id === sourceUserId) next.seller_id = targetUserId;
      }
    }

    const { error } = await admin.from("deals").update(next).eq("id", d.id);
    if (error) {
      throw new Error(`Seat move deals ${d.id}: ${error.message}`);
    }
    moved += 1;
  }

  const { data: invs, error: invErr } = await admin
    .from("deal_invitations")
    .update({ invitee_user_id: targetUserId })
    .eq("invitee_user_id", sourceUserId)
    .select("id");
  if (invErr) throw new Error(`Seat move invitations: ${invErr.message}`);
  moved += (invs || []).length;

  const { data: wallets, error: wErr } = await admin
    .from("wallets")
    .update({ user_id: targetUserId })
    .eq("user_id", sourceUserId)
    .select("id");
  if (wErr) throw new Error(`Seat move wallets: ${wErr.message}`);
  moved += (wallets || []).length;

  const { data: conns, error: cErr } = await admin
    .from("channel_connections")
    .update({ user_id: targetUserId })
    .eq("user_id", sourceUserId)
    .select("id");
  if (cErr) throw new Error(`Seat move connections: ${cErr.message}`);
  moved += (conns || []).length;

  return moved;
}

/**
 * Bot-issued claim: token.user_id = provisional party (SOURCE).
 * Merges SOURCE → TARGET (email user). Same path for buyer and seller.
 */
export async function claimBotIdentity(
  token: string,
  realUserId?: string
): Promise<ClaimBotResult> {
  const clean = String(token || "").trim();
  if (!clean) throw new Error("Missing bot claim token.");

  let targetUserId = realUserId;
  if (!targetUserId) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required.");
    targetUserId = user.id;
  }

  const admin = createSupabaseAdminClient();

  const { data: row, error: tokErr } = await admin
    .from("channel_link_tokens")
    .select("id, user_id, channel, expires_at, used_at")
    .eq("token", clean)
    .maybeSingle();

  if (tokErr) throw new Error(tokErr.message);

  if (!row) {
    throw new Error(
      "Invalid or expired claim link. Ask the bot for a new one (Open on TrustLayer Web)."
    );
  }

  if (row.channel && row.channel !== "telegram") {
    throw new Error("This claim link is not a Telegram bot claim.");
  }

  const sourceUserId = row.user_id as string;
  if (!sourceUserId) throw new Error("Claim token has no bot identity.");

  if (
    row.expires_at &&
    !row.used_at &&
    new Date(row.expires_at).getTime() < Date.now()
  ) {
    throw new Error("This claim link has expired. Ask the bot for a new one.");
  }

  if (row.used_at && sourceUserId === targetUserId) {
    return {
      alreadyClaimed: true,
      userId: targetUserId,
      sourceUserId,
      seatsMoved: 0,
    };
  }

  const { data: sourceProfile } = await admin
    .from("profiles")
    .select("telegram_user_id, telegram_username")
    .eq("id", sourceUserId)
    .maybeSingle();

  const tgId = sourceProfile?.telegram_user_id ?? null;
  const tgUsername = sourceProfile?.telegram_username
    ? String(sourceProfile.telegram_username).replace(/^@/, "")
    : null;

  if (tgId != null) {
    await mustOk(
      "clear telegram holders",
      await admin
        .from("profiles")
        .update({ telegram_user_id: null, telegram_username: null })
        .eq("telegram_user_id", tgId)
        .neq("id", targetUserId)
    );
  } else if (sourceUserId !== targetUserId) {
    await mustOk(
      "clear source telegram",
      await admin
        .from("profiles")
        .update({ telegram_user_id: null, telegram_username: null })
        .eq("id", sourceUserId)
    );
  }

  if (tgId != null || tgUsername) {
    const patch: Record<string, unknown> = {};
    if (tgId != null) patch.telegram_user_id = tgId;
    if (tgUsername) patch.telegram_username = tgUsername;
    await mustOk(
      "set target telegram",
      await admin.from("profiles").update(patch).eq("id", targetUserId)
    );
  }

  const seatsMoved = await reassignSeatsFromSource(
    admin,
    sourceUserId,
    targetUserId
  );

  if (!row.used_at) {
    await mustOk(
      "mark token used",
      await admin
        .from("channel_link_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("id", row.id)
        .is("used_at", null)
    );
  }

  if (sourceUserId !== targetUserId) {
    await admin
      .from("channel_link_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", sourceUserId)
      .eq("channel", "telegram")
      .is("used_at", null);
  }

  if (sourceUserId !== targetUserId) {
    try {
      const { data: sourceAuth } = await (admin as any).auth.admin.getUserById(
        sourceUserId
      );
      const email = sourceAuth?.user?.email || "";
      if (SYNTHETIC_EMAIL_RE.test(email)) {
        await (admin as any).auth.admin.deleteUser(sourceUserId);
      }
    } catch {
      /* non-fatal */
    }
  }

  return {
    alreadyClaimed: sourceUserId === targetUserId && seatsMoved === 0,
    userId: targetUserId,
    sourceUserId,
    seatsMoved,
  };
}

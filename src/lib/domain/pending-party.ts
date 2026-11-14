import crypto from "crypto";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";

/**
 * Mirror of bot ensurePendingUsernameProfile for Web channel.
 * Creates a real auth user + profiles row so create_deal RPC can use a UUID.
 * Invitee claims later via invite link / signup / bot.
 *
 * Registered matches (username / telegram / email) only seat non-synthetic
 * auth users — never a pending_…@users.trustlayer.internal shell.
 */

export type PendingParty = {
  id: string;
  username: string | null;
  display_name: string | null;
  provisional: boolean;
};

const SYNTHETIC_EMAIL_RE =
  /@(bot\.trustlayer\.local|telegram\.trustlayer\.local|users\.trustlayer\.internal)$/i;

function normalizeUsername(raw: string): string {
  return String(raw || "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
}

async function isRealAuthUser(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string
): Promise<boolean> {
  try {
    const { data } = await (admin as any).auth.admin.getUserById(userId);
    const email = (data?.user?.email || "") as string;
    if (!email) return false;
    return !SYNTHETIC_EMAIL_RE.test(email);
  } catch {
    return false;
  }
}

export async function ensurePendingInviteParty(opts: {
  username?: string | null;
  email?: string | null;
}): Promise<PendingParty> {
  const admin = createSupabaseAdminClient();
  const username = opts.username ? normalizeUsername(opts.username) : null;
  const email = opts.email ? String(opts.email).trim().toLowerCase() : null;

  if (!username && !email) {
    throw new Error("Provide a username or email to invite.");
  }
  if (username && /^\d+$/.test(username)) {
    throw new Error("Use a @username, not only digits.");
  }

  // 1) Existing profile by TrustLayer username (real auth only)
  if (username) {
    const { data: byUsers } = await admin
      .from("profiles")
      .select("id, username, display_name")
      .ilike("username", username)
      .limit(10);

    for (const byUser of byUsers || []) {
      if (byUser?.id && (await isRealAuthUser(admin, byUser.id))) {
        return {
          id: byUser.id,
          username: byUser.username,
          display_name: byUser.display_name,
          provisional: false,
        };
      }
    }

    // 1b) Existing profile by telegram_username (real auth only)
    const { data: byTgs } = await admin
      .from("profiles")
      .select("id, username, display_name")
      .ilike("telegram_username", username)
      .limit(10);

    for (const byTg of byTgs || []) {
      if (byTg?.id && (await isRealAuthUser(admin, byTg.id))) {
        return {
          id: byTg.id,
          username: byTg.username,
          display_name: byTg.display_name,
          provisional: false,
        };
      }
    }
  }

  // 2) Existing auth user by email (real only)
  if (email) {
    if (SYNTHETIC_EMAIL_RE.test(email)) {
      throw new Error("Cannot invite a synthetic TrustLayer email.");
    }
    try {
      const { data: list } = await (admin as any).auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      const match = (list?.users || []).find(
        (u: { email?: string; id: string }) =>
          (u.email || "").toLowerCase() === email &&
          !SYNTHETIC_EMAIL_RE.test(u.email || "")
      );
      if (match?.id) {
        const { data: prof } = await admin
          .from("profiles")
          .select("id, username, display_name")
          .eq("id", match.id)
          .maybeSingle();
        return {
          id: match.id,
          username: prof?.username || username,
          display_name: prof?.display_name || username || email,
          provisional: false,
        };
      }
    } catch {
      /* ignore listUsers limits */
    }
  }

  // 3) Create provisional auth user
  const syntheticEmail =
    email ||
    `pending_${username || "user"}_${crypto.randomBytes(3).toString("hex")}@users.trustlayer.internal`;

  const { data: created, error: authErr } = await (
    admin as any
  ).auth.admin.createUser({
    email: syntheticEmail,
    email_confirm: true,
    user_metadata: {
      source: "web_pending_invite",
      invited_username: username,
      invited_email: email,
    },
  });
  if (authErr) {
    throw new Error(authErr.message || "Unable to reserve invite party.");
  }
  const userId = created.user.id as string;

  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .upsert(
      {
        id: userId,
        username: username || null,
        display_name: username ? `@${username}` : email || "Invited party",
        // Do not set telegram_username here — avoids colliding with a real Telegram user.
      },
      { onConflict: "id" }
    )
    .select("id, username, display_name")
    .single();

  if (pErr) {
    const { data: existing } = await admin
      .from("profiles")
      .select("id, username, display_name")
      .eq("id", userId)
      .maybeSingle();
    if (existing) {
      return {
        id: existing.id,
        username: existing.username,
        display_name: existing.display_name,
        provisional: true,
      };
    }
    throw new Error(pErr.message || "Unable to create invite profile.");
  }

  return {
    id: profile.id,
    username: profile.username,
    display_name: profile.display_name,
    provisional: true,
  };
}

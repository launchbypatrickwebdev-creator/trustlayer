import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";

const SYNTHETIC_EMAIL_RE =
  /@(bot\.trustlayer\.local|telegram\.trustlayer\.local|users\.trustlayer\.internal)$/i;

async function isRealAuthUser(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string
): Promise<{ real: boolean; email: string | null }> {
  try {
    const { data } = await (admin as any).auth.admin.getUserById(userId);
    const email = (data?.user?.email || "") as string;
    if (!email) return { real: false, email: null };
    if (SYNTHETIC_EMAIL_RE.test(email)) return { real: false, email };
    return { real: true, email };
  } catch {
    return { real: false, email: null };
  }
}

/**
 * Resolve counterparty for web deal create.
 * Order: UUID → real email → profiles.username (real) → telegram_username (real only)
 * → invite hints.
 * Never invents a UUID. Found always means a real profiles.id to seat on the deal.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const currentUserId = user.id;
    const q = (new URL(request.url).searchParams.get("q") || "").trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ error: "Query too short." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        q
      );
    const isEmail = q.includes("@") && q.includes(".") && !q.startsWith("@");
    const handle = q.replace(/^@/, "").toLowerCase();

    function okFound(row: {
      id: string;
      username?: string | null;
      email?: string | null;
    }) {
      if (!row?.id || row.id === currentUserId) {
        return NextResponse.json({ found: false });
      }
      return NextResponse.json({
        found: true,
        userId: row.id,
        username: row.username || null,
        email: row.email || null,
        registered: true,
      });
    }

    // 1) UUID — still require real (non-synthetic) auth when possible
    if (isUuid) {
      const { data } = await admin
        .from("profiles")
        .select("id, username")
        .eq("id", q)
        .maybeSingle();
      if (!data) return NextResponse.json({ found: false });
      const auth = await isRealAuthUser(admin, data.id);
      if (!auth.real) {
        return NextResponse.json({
          found: false,
          inviteUsername: data.username || null,
          registered: false,
        });
      }
      return okFound({
        id: data.id,
        username: data.username,
        email: auth.email,
      });
    }

    // 2) Real email (not synthetic)
    if (isEmail) {
      if (SYNTHETIC_EMAIL_RE.test(q)) {
        return NextResponse.json({
          found: false,
          inviteEmail: q.toLowerCase(),
        });
      }
      try {
        const { data: list } = await (admin as any).auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });
        const match = (list?.users || []).find(
          (u: { email?: string; id: string }) =>
            (u.email || "").toLowerCase() === q.toLowerCase() &&
            !SYNTHETIC_EMAIL_RE.test(u.email || "")
        );
        if (match && match.id !== user.id) {
          const { data: prof } = await admin
            .from("profiles")
            .select("id, username")
            .eq("id", match.id)
            .maybeSingle();
          return okFound({
            id: match.id,
            username: prof?.username || null,
            email: match.email || q.toLowerCase(),
          });
        }
      } catch {
        /* listUsers may be restricted */
      }
      return NextResponse.json({
        found: false,
        inviteEmail: q.toLowerCase(),
        registered: false,
      });
    }

    // 3) TrustLayer username — only real auth users
    {
      const { data: candidates } = await admin
        .from("profiles")
        .select("id, username")
        .ilike("username", handle)
        .limit(10);

      for (const row of candidates || []) {
        if (!row?.id || row.id === currentUserId) continue;
        const auth = await isRealAuthUser(admin, row.id);
        if (auth.real) {
          return okFound({
            id: row.id,
            username: row.username,
            email: auth.email,
          });
        }
      }
    }

    // 4) Telegram username (channel adapter) → seat only if auth email is real
    {
      const { data: candidates } = await admin
        .from("profiles")
        .select("id, username, telegram_username")
        .ilike("telegram_username", handle)
        .limit(10);

      const realMatches: Array<{
        id: string;
        username: string | null;
        email: string | null;
      }> = [];

      for (const row of candidates || []) {
        if (!row?.id || row.id === currentUserId) continue;
        const auth = await isRealAuthUser(admin, row.id);
        if (auth.real) {
          realMatches.push({
            id: row.id,
            username: row.username,
            email: auth.email,
          });
        }
      }

      if (realMatches.length === 1) {
        return okFound(realMatches[0]);
      }
      if (realMatches.length > 1) {
        // Prefer row whose TL username equals the handle
        const preferred =
          realMatches.find(
            (m) => (m.username || "").toLowerCase() === handle
          ) || realMatches[0];
        return okFound(preferred);
      }

      // Only synthetic / pending shells matched → invite path (do not seat shell)
    }

    // 5) Not found → invite hints
    return NextResponse.json({
      found: false,
      inviteUsername: handle,
      registered: false,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lookup failed." },
      { status: 500 }
    );
  }
}
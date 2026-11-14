import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";

interface Params {
  params: Promise<{ id: string }>;
}

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_BYTES = 5 * 1024 * 1024;

async function resolveAccess(disputeId: string, userId: string) {
  const admin = createSupabaseAdminClient();
  const { data: dispute } = await admin
    .from("deal_disputes")
    .select("id, deal_id, status")
    .eq("id", disputeId)
    .maybeSingle();

  if (!dispute) return null;

  const { data: deal } = await admin
    .from("deals")
    .select("id, buyer_id, seller_id")
    .eq("id", dispute.deal_id)
    .maybeSingle();

  if (!deal) return null;

  const { data: isAdmin } = await (admin.rpc as any)("is_trustlayer_admin", {
    p_user_id: userId,
  });

  let role: "buyer" | "seller" | "admin" | null = null;
  if (isAdmin === true) role = "admin";
  else if (deal.buyer_id === userId) role = "buyer";
  else if (deal.seller_id === userId) role = "seller";

  if (!role) return null;

  return { admin, dispute, deal, role };
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id: disputeId } = await params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const access = await resolveAccess(disputeId, user.id);
    if (!access) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { data: rows, error } = await access.admin
      .from("dispute_messages")
      .select(
        "id, sender_user_id, sender_role, body, attachment_path, mime_type, created_at"
      )
      .eq("dispute_id", disputeId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const messages = [];
    for (const row of rows ?? []) {
      let attachment_url: string | null = null;
      if (row.attachment_path) {
        const { data: signed } = await access.admin.storage
          .from("trustlayer-evidence")
          .createSignedUrl(row.attachment_path, 3600);
        attachment_url = signed?.signedUrl ?? null;
      }
      messages.push({
        id: row.id,
        sender_user_id: row.sender_user_id,
        sender_role: row.sender_role,
        body: row.body,
        attachment_url,
        created_at: row.created_at,
      });
    }

    return NextResponse.json({
      messages,
      disputeStatus: access.dispute.status,
      canPost: access.dispute.status === "open",
      viewerRole: access.role,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unable to load messages." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id: disputeId } = await params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const access = await resolveAccess(disputeId, user.id);
    if (!access) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    if (access.dispute.status !== "open") {
      return NextResponse.json(
        { error: "This dispute room is closed." },
        { status: 409 }
      );
    }

    const form = await request.formData();
    const bodyRaw = String(form.get("body") || "").trim();
    const file = form.get("file");

    if (!bodyRaw && !(file instanceof File)) {
      return NextResponse.json(
        { error: "Write a message or attach an image." },
        { status: 400 }
      );
    }
    if (bodyRaw.length > 2000) {
      return NextResponse.json(
        { error: "Message is too long (max 2000 characters)." },
        { status: 400 }
      );
    }

    let attachmentPath: string | null = null;
    let mimeType: string | null = null;

    if (file instanceof File && file.size > 0) {
      if (!ALLOWED.has(file.type)) {
        return NextResponse.json(
          { error: "Only JPEG, PNG, WebP, or GIF images are allowed." },
          { status: 400 }
        );
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { error: "Image must be 5MB or smaller." },
          { status: 400 }
        );
      }

      const ext =
        file.type === "image/png"
          ? "png"
          : file.type === "image/webp"
            ? "webp"
            : file.type === "image/gif"
              ? "gif"
              : "jpg";
      attachmentPath = `disputes/${disputeId}/${crypto.randomUUID()}.${ext}`;
      mimeType = file.type;
      const buffer = Buffer.from(await file.arrayBuffer());

      const { error: uploadError } = await access.admin.storage
        .from("trustlayer-evidence")
        .upload(attachmentPath, buffer, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        return NextResponse.json(
          { error: uploadError.message || "Upload failed." },
          { status: 500 }
        );
      }
    }

    const { data: row, error: insertError } = await access.admin
      .from("dispute_messages")
      .insert({
        dispute_id: disputeId,
        sender_user_id: user.id,
        sender_role: access.role,
        body: bodyRaw || null,
        attachment_path: attachmentPath,
        mime_type: mimeType,
      })
      .select(
        "id, sender_user_id, sender_role, body, attachment_path, mime_type, created_at"
      )
      .single();

    if (insertError || !row) {
      return NextResponse.json(
        { error: insertError?.message || "Could not post message." },
        { status: 500 }
      );
    }

    let attachment_url: string | null = null;
    if (row.attachment_path) {
      const { data: signed } = await access.admin.storage
        .from("trustlayer-evidence")
        .createSignedUrl(row.attachment_path, 3600);
      attachment_url = signed?.signedUrl ?? null;
    }

    return NextResponse.json(
      {
        message: {
          id: row.id,
          sender_user_id: row.sender_user_id,
          sender_role: row.sender_role,
          body: row.body,
          attachment_url,
          created_at: row.created_at,
        },
      },
      { status: 201 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unable to post message." },
      { status: 500 }
    );
  }
}

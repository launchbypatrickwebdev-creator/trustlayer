import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import {
  applyTrustLayerWatermark,
  assertImageUpload,
} from "@/lib/media/watermark";

const EVIDENCE_BUCKET = "trustlayer-evidence";

/** Statuses where either party may still add agreement evidence. */
const EVIDENCE_OPEN_STATUSES = new Set([
  "draft",
  "awaiting_counterparty",
  "pending_acceptance",
]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: dealId } = await context.params;
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

    const admin = createSupabaseAdminClient();
    const { data: deal } = await admin
      .from("deals")
      .select("id, created_by, buyer_id, seller_id, status")
      .eq("id", dealId)
      .maybeSingle();

    if (!deal) {
      return NextResponse.json({ error: "Deal not found." }, { status: 404 });
    }

    const allowed =
      deal.created_by === user.id ||
      deal.buyer_id === user.id ||
      deal.seller_id === user.id;
    if (!allowed) {
      return NextResponse.json(
        { error: "Not a participant." },
        { status: 403 }
      );
    }

    const { data: rows, error } = await admin
      .from("deal_attachments")
      .select("*")
      .eq("deal_id", dealId)
      .order("sort_order", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "Unable to load attachments." },
        { status: 500 }
      );
    }

    const attachments = await Promise.all(
      (rows ?? []).map(async (row) => {
        let url: string | null = null;
        if (row.storage_path) {
          const { data: signed } = await admin.storage
            .from(EVIDENCE_BUCKET)
            .createSignedUrl(row.storage_path, 60 * 60 * 24 * 7);
          url = signed?.signedUrl ?? null;
        }
        return { ...row, url };
      })
    );

    return NextResponse.json({ attachments });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load attachments.",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: dealId } = await context.params;
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

    const form = await request.formData();
    const file = form.get("file");
    const caption = String(form.get("caption") || "").slice(0, 200);
    const sortOrder = Number(form.get("sort_order") || 0);

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "file is required." },
        { status: 400 }
      );
    }

    assertImageUpload({ size: file.size, type: file.type });

    const admin = createSupabaseAdminClient();
    const { data: deal, error: dealError } = await admin
      .from("deals")
      .select("id, created_by, buyer_id, seller_id, status")
      .eq("id", dealId)
      .maybeSingle();

    if (dealError || !deal) {
      return NextResponse.json({ error: "Deal not found." }, { status: 404 });
    }

    const allowed =
      deal.created_by === user.id ||
      deal.buyer_id === user.id ||
      deal.seller_id === user.id;
    if (!allowed) {
      return NextResponse.json(
        { error: "Not a participant." },
        { status: 403 }
      );
    }

    if (!EVIDENCE_OPEN_STATUSES.has(String(deal.status || ""))) {
      return NextResponse.json(
        {
          error:
            "Agreement evidence is locked after the agreement is accepted.",
        },
        { status: 409 }
      );
    }

    const { count } = await admin
      .from("deal_attachments")
      .select("id", { count: "exact", head: true })
      .eq("deal_id", dealId);

    if ((count ?? 0) >= 3) {
      return NextResponse.json(
        { error: "Maximum of 3 evidence images per deal." },
        { status: 400 }
      );
    }

    const raw = Buffer.from(await file.arrayBuffer());
    const watermarked = await applyTrustLayerWatermark(raw);

    const contentHash = createHash("sha256")
      .update(watermarked)
      .digest("hex")
      .slice(0, 24);
    const fileName = `${user.id.slice(0, 8)}-${Date.now()}-${contentHash}.jpg`;
    const path = `deals/${dealId}/${fileName}`;

    const { error: uploadError } = await admin.storage
      .from(EVIDENCE_BUCKET)
      .upload(path, watermarked, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error(uploadError);
      return NextResponse.json(
        {
          error: `Upload failed: ${uploadError.message}. Bucket must be "${EVIDENCE_BUCKET}".`,
        },
        { status: 500 }
      );
    }

    const { data: row, error: insertError } = await admin
      .from("deal_attachments")
      .insert({
        deal_id: dealId,
        uploaded_by: user.id,
        kind: "item",
        storage_path: path,
        mime_type: "image/jpeg",
        file_name: file.name || fileName,
        caption: caption || null,
        sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
        watermarked: true,
      })
      .select("*")
      .single();

    if (insertError) {
      console.error(insertError);
      return NextResponse.json(
        { error: "Could not save attachment row." },
        { status: 500 }
      );
    }

    const { data: signed } = await admin.storage
      .from(EVIDENCE_BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 7);

    return NextResponse.json(
      {
        attachment: {
          ...row,
          url: signed?.signedUrl ?? null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to upload evidence.",
      },
      { status: 400 }
    );
  }
}
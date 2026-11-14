import { NextResponse } from "next/server";
import {
  respondToDealInvitation,
  type CounterpartyAction,
} from "@/lib/domain/deals";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;

  const origin = request.headers.get("origin");
  if (origin) {
    const expectedOrigin = new URL(request.url).origin;
    if (origin !== expectedOrigin) {
      return NextResponse.json(
        { error: "Invalid request origin." },
        { status: 403 }
      );
    }
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    let action: unknown;
    let counterpartyChecklist: Record<string, boolean> = {};
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { action?: string; counterpartyChecklist?: Record<string, boolean> };
      action = body.action;
      counterpartyChecklist = body.counterpartyChecklist || {};
    } else {
      const form = await request.formData();
      action = form.get("action");
    }

    if (action !== "accept" && action !== "decline") {
      return NextResponse.json(
        { error: "Invalid invitation action." },
        { status: 400 }
      );
    }

    await respondToDealInvitation(id, action as CounterpartyAction, counterpartyChecklist);

    if (contentType.includes("application/json")) return NextResponse.json({ ok: true });
    return NextResponse.redirect(new URL(`/deals/${id}`, request.url), 303);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to respond to invitation.";

    const status =
      message === "Authentication required."
        ? 401
        : 400;

    return NextResponse.json({ error: message }, { status });
  }
}

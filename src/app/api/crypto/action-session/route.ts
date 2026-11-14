
import { NextResponse } from "next/server";

import {
  createCryptoActionSession,
  type CryptoAction,
} from "@/lib/domain/crypto-action-sessions";

const ACTIONS = new Set<CryptoAction>([
  "release",
  "cancel",
  "cancel_unfunded",
  "reclaim",
  "open_dispute",
  "create_ax",
  "fund_ax",
  "release_ax",
  "cancel_ax",
  "open_dispute_ax",
  "admin_resolve",
]);

export async function POST(request: Request) {
  const origin = request.headers.get("origin");

  if (
    origin &&
    origin !== new URL(request.url).origin
  ) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json()) as {
      dealId?: string;
      action?: string;
      milestoneIndex?: number;
    };

    const milestoneIndex = Number(
      body.milestoneIndex
    );

    if (
      !body.dealId ||
      !body.action ||
      !ACTIONS.has(body.action as CryptoAction) ||
      !Number.isInteger(milestoneIndex) ||
      milestoneIndex < 0 ||
      milestoneIndex > 9
    ) {
      return NextResponse.json(
        {
          error:
            "Deal id, milestone index, and a valid party action are required.",
        },
        { status: 400 }
      );
    }

    const action = body.action as CryptoAction;

    const { capability, expiresAt } =
      await createCryptoActionSession(
        body.dealId,
        action,
        milestoneIndex
      );

    return NextResponse.json({
      action,
      session: capability,
      expiresAt,
      milestoneIndex,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to authorize crypto action.";

    return NextResponse.json(
      { error: message },
      {
        status:
          message === "Authentication required."
            ? 401
            : 400,
      }
    );
  }
}

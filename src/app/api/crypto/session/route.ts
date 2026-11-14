
import { NextResponse } from "next/server";

import {
  createCryptoPaymentSession,
} from "@/lib/domain/crypto-sessions";

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
      milestoneIndex?: number;
    };

    const milestoneIndex = Number(
      body.milestoneIndex ?? 0
    );

    if (
      !body.dealId ||
      !Number.isInteger(milestoneIndex) ||
      milestoneIndex < 0 ||
      milestoneIndex > 9
    ) {
      return NextResponse.json(
        {
          error:
            "Deal id and a valid milestone index are required.",
        },
        { status: 400 }
      );
    }

    /*
     * Payment capability only.
     *
     * This endpoint must never be used for release or cancel.
     */
    const { capability } =
      await createCryptoPaymentSession(
        body.dealId,
        milestoneIndex
      );

    return NextResponse.json({
      depositUrl:
        `/crypto/deposit?session=${encodeURIComponent(
          capability
        )}&milestoneIndex=${milestoneIndex}`,
      milestoneIndex,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to authorize crypto payment.";

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

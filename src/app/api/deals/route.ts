import { NextResponse } from "next/server";
import {
  createDeal,
  listMyDeals,
  type CreateDealInput,
} from "@/lib/domain/deals";

export async function GET() {
  try {
    const deals = await listMyDeals();

    return NextResponse.json({
      deals,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load deals.";

    const status = message === "Authentication required." ? 401 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateDealInput;
    // Agent bridge metadata is reserved for the authenticated server-side
    // bridge route; a human deal request cannot manufacture an agent link.
    if (body.creatorChecklist && typeof body.creatorChecklist === "object") {
      const safeChecklist = { ...(body.creatorChecklist as Record<string, unknown>) };
      for (const key of Object.keys(safeChecklist)) {
        if (key.startsWith("agent_") || key.startsWith("accepted_offer_") || key === "seller_authority_snapshot") {
          delete safeChecklist[key];
        }
      }
      body.creatorChecklist = safeChecklist as CreateDealInput["creatorChecklist"];
    }

    const deal = await createDeal(body);
    const invitationToken =
      (deal as { invitation_token?: string }).invitation_token || null;
    const inviteRequired = Boolean(
      (deal as { invite_required?: boolean }).invite_required
    );
    const counterpartyRegistered = Boolean(
      (deal as { counterparty_registered?: boolean }).counterparty_registered
    );

    return NextResponse.json(
      {
        deal,
        invitation_token: invitationToken,
        invite_required: inviteRequired,
        counterparty_registered: counterpartyRegistered,
      },
      { status: 201 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create deal.";

    const status = message === "Authentication required." ? 401 : 400;

    return NextResponse.json({ error: message }, { status });
  }
}

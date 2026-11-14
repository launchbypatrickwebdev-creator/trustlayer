import { NextResponse } from "next/server";
import { authenticatePartner } from "@/lib/api/auth-partner";
import { fromCaught, PartnerApiError } from "@/lib/api/errors";
import { newRequestId } from "@/lib/api/request-id";
import { logPartnerRequest } from "@/lib/api/request-log";
import {
  readIdempotentResponse,
  storeIdempotentResponse,
  hashRequestBody,
} from "@/lib/api/idempotency";
import {
  partnerCreateCryptoSession,
  type PartnerCryptoAction,
} from "@/lib/domain/partner-api/crypto-sessions";

/**
 * POST /api/v1/crypto/sessions
 *
 * Partner requests a time-limited capability URL for a party to complete
 * deposit / release / cancel on TrustLayer Web. No Solana signing by partner.
 */
export async function POST(request: Request) {
  const requestId = newRequestId();
  let logPartnerId: string | undefined;
  let logEnvironment: string | undefined;
  try {
    const ctx = await authenticatePartner(request, []);
    logPartnerId = ctx.partnerId; logEnvironment = ctx.environment;
    const idemKey = request.headers.get("idempotency-key");
    if (!idemKey) throw new PartnerApiError("INVALID_REQUEST", "Idempotency-Key header is required for this write operation.", 400);
    const parsedBody = await request.json().catch(() => { throw new PartnerApiError("INVALID_REQUEST", "Request body must be valid JSON.", 400); });
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) throw new PartnerApiError("INVALID_REQUEST", "Request body must be a JSON object.", 400);
    const body = parsedBody as {
      deal_id?: string;
      action?: string;
      milestone_index?: number;
      leg_index?: number;
      actor_external_id?: string;
    };
    const requiredScope =
      body.action === "deposit" || body.action === "fund"
        ? "funding:initiate"
        : body.action === "release"
          ? "settlement:execute"
          : body.action === "cancel" ||
              body.action === "cancel_unfunded" ||
              body.action === "open_dispute"
            ? "transactions:cancel"
            : null;
    if (!requiredScope)
      throw new PartnerApiError(
        "INVALID_REQUEST",
        "action must be deposit, release, cancel, cancel_unfunded, fund, or open_dispute.",
        400
      );
    if (!ctx.scopes.includes(requiredScope)) {
      throw new PartnerApiError("FORBIDDEN", `Missing scope: ${requiredScope}`, 403, { required: requiredScope });
    }
    const requestHash = hashRequestBody(body);
    const cached = await readIdempotentResponse(ctx.partnerId, idemKey, {
      method: "POST",
      path: "/v1/crypto/sessions",
      requestHash,
    });
    if (cached?.kind === "replay") {
      logPartnerRequest({ partnerId: ctx.partnerId, requestId, method: "POST", path: "/v1/crypto/sessions", status: cached.status, environment: ctx.environment });
      return NextResponse.json(
        { ...(cached.body as object), request_id: requestId, idempotent: true },
        { status: cached.status }
      );
    }

    const claimToken = cached?.kind === "reserved" ? cached.claimToken : null;

    if (!body.deal_id) {
      throw new PartnerApiError("INVALID_REQUEST", "deal_id is required.");
    }
    if (!body.action) {
      throw new PartnerApiError(
        "INVALID_REQUEST",
        "action is required (deposit | release | cancel | cancel_unfunded | fund | open_dispute)."
      );
    }

    const milestoneIndex = Number(body.milestone_index ?? 0);
    const session = await partnerCreateCryptoSession({
      partnerId: ctx.partnerId,
      dealRef: body.deal_id,
      action: body.action as PartnerCryptoAction,
      milestoneIndex,
      legIndex:
        body.leg_index === 0 || body.leg_index === 1 ? body.leg_index : null,
      actorExternalId: body.actor_external_id,
      environment: ctx.environment,
    });

    const responseBody = {
      data: session,
      request_id: requestId,
      environment: ctx.environment,
    };

    if (idemKey && claimToken) {
      await storeIdempotentResponse({
        partnerId: ctx.partnerId,
        key: idemKey,
        claimToken: claimToken!,
        method: "POST",
        path: "/v1/crypto/sessions",
        requestHash,
        status: 201,
        body: responseBody,
      });
    }

    logPartnerRequest({ partnerId: ctx.partnerId, requestId, method: "POST", path: "/v1/crypto/sessions", status: 201, environment: ctx.environment });
    return NextResponse.json(responseBody, { status: 201 });
  } catch (error) {
    logPartnerRequest({ partnerId: logPartnerId, requestId, method: "POST", path: "/v1/crypto/sessions", status: error instanceof PartnerApiError ? error.status : 500, environment: logEnvironment });
    return fromCaught(error, requestId);
  }
}

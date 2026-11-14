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
  partnerFinalizeDeal,
  partnerGetDealByRef,
} from "@/lib/domain/partner-api/deals";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = newRequestId();
  let logPartnerId: string | undefined;
  let logEnvironment: string | undefined;
  try {
    const ctx = await authenticatePartner(request, ["deals:finalize"]);
    logPartnerId = ctx.partnerId; logEnvironment = ctx.environment;
    const { id } = await context.params;
    const idemKey = request.headers.get("idempotency-key");
    if (!idemKey) throw new PartnerApiError("INVALID_REQUEST", "Idempotency-Key header is required for this write operation.", 400);

    const requestHash = hashRequestBody({ id });
    const cached = await readIdempotentResponse(ctx.partnerId, idemKey, {
      method: "POST",
      path: `/v1/deals/${id}/finalize`,
      requestHash,
    });
    if (cached?.kind === "replay") {
      logPartnerRequest({ partnerId: ctx.partnerId, requestId, method: "POST", path: "/v1/deals/:id/finalize", status: cached.status, environment: ctx.environment });
      return NextResponse.json(
        { ...(cached.body as object), request_id: requestId, idempotent: true },
        { status: cached.status }
      );
    }

    const claimToken = cached?.kind === "reserved" ? cached.claimToken : null;
    // Resolve UUID or external_id
    const current = await partnerGetDealByRef(ctx.partnerId, id, ctx.environment);
    const deal = await partnerFinalizeDeal(ctx.partnerId, current.id as string, ctx.environment);

    const responseBody = {
      data: deal,
      request_id: requestId,
      environment: ctx.environment,
    };

    if (idemKey && claimToken) {
      await storeIdempotentResponse({
        partnerId: ctx.partnerId,
        key: idemKey,
        claimToken: claimToken!,
        method: "POST",
        path: `/v1/deals/${id}/finalize`,
        requestHash: hashRequestBody({ id }),
        status: 200,
        body: responseBody,
      });
    }

    logPartnerRequest({ partnerId: ctx.partnerId, requestId, method: "POST", path: "/v1/deals/:id/finalize", status: 200, environment: ctx.environment });
    return NextResponse.json(responseBody);
  } catch (error) {
    logPartnerRequest({ partnerId: logPartnerId, requestId, method: "POST", path: "/v1/deals/:id/finalize", status: error instanceof PartnerApiError ? error.status : 500, environment: logEnvironment });
    return fromCaught(error, requestId);
  }
}

import { NextResponse } from "next/server";
import { fromCaught, PartnerApiError } from "@/lib/api/errors";
import { logPartnerRequest } from "@/lib/api/request-log";
import {
  guardPartner,
  withRateHeaders,
  finishLog,
} from "@/lib/api/partner-guard";
import {
  readIdempotentResponse,
  storeIdempotentResponse,
  hashRequestBody,
} from "@/lib/api/idempotency";
import {
  partnerCreateDeal,
  partnerListDeals,
  type PartnerCreateDealBody,
} from "@/lib/domain/partner-api/deals";

export async function GET(request: Request) {
  const g = await guardPartner(request, ["deals:read"], "/v1/deals");
  if (g instanceof NextResponse) return g;
  const { ctx, requestId, rateHeaders } = g;
  try {
    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get("limit") || 25);
    const page = await partnerListDeals(ctx.partnerId, {
      limit: Number.isFinite(limitRaw) ? limitRaw : 25,
      cursor: url.searchParams.get("cursor"),
      environment: ctx.environment,
      search: url.searchParams.get("search") || undefined,
      status: url.searchParams.get("status") || undefined,
    });
    finishLog({
      partnerId: ctx.partnerId,
      requestId,
      method: "GET",
      path: "/v1/deals",
      status: 200,
      environment: ctx.environment,
    });
    return withRateHeaders(
      NextResponse.json({
        ...page,
        request_id: requestId,
        environment: ctx.environment,
      }),
      rateHeaders
    );
  } catch (error) {
    logPartnerRequest({ partnerId: ctx.partnerId, requestId, method: "GET", path: "/v1/deals", status: error instanceof PartnerApiError ? error.status : 500, environment: ctx.environment });
    return fromCaught(error, requestId);
  }
}

export async function POST(request: Request) {
  const g = await guardPartner(request, ["deals:create"], "/v1/deals");
  if (g instanceof NextResponse) return g;
  const { ctx, requestId, rateHeaders } = g;
  try {
    const idemKey = request.headers.get("idempotency-key");
    if (!idemKey) throw new PartnerApiError("INVALID_REQUEST", "Idempotency-Key header is required for this write operation.", 400);
    const parsedBody = await request.json().catch(() => { throw new PartnerApiError("INVALID_REQUEST", "Request body must be valid JSON.", 400); });
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) throw new PartnerApiError("INVALID_REQUEST", "Request body must be a JSON object.", 400);
    const body = parsedBody as PartnerCreateDealBody;
    if (body.auto_finalize === true && !ctx.scopes.includes("deals:finalize")) {
      throw new PartnerApiError("FORBIDDEN", "auto_finalize requires the separate deals:finalize scope.", 403, { required: "deals:finalize" });
    }
    const requestHash = hashRequestBody(body);
    const cached = await readIdempotentResponse(ctx.partnerId, idemKey, {
      method: "POST",
      path: "/v1/deals",
      requestHash,
    });
    if (cached?.kind === "replay") {
      finishLog({ partnerId: ctx.partnerId, requestId, method: "POST", path: "/v1/deals", status: cached.status, environment: ctx.environment });
      return withRateHeaders(
        NextResponse.json(
          {
            ...(cached.body as object),
            request_id: requestId,
            idempotent: true,
          },
          { status: cached.status }
        ),
        rateHeaders
      );
    }
    const claimToken = cached?.kind === "reserved" ? cached.claimToken : null;
    const deal = await partnerCreateDeal(
      ctx.partnerId,
      ctx.environment,
      body
    );
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
        path: "/v1/deals",
        requestHash,
        status: 201,
        body: responseBody,
      });
    }
    finishLog({
      partnerId: ctx.partnerId,
      requestId,
      method: "POST",
      path: "/v1/deals",
      status: 201,
      environment: ctx.environment,
    });
    return withRateHeaders(
      NextResponse.json(responseBody, { status: 201 }),
      rateHeaders
    );
  } catch (error) {
    logPartnerRequest({ partnerId: ctx.partnerId, requestId, method: "POST", path: "/v1/deals", status: error instanceof PartnerApiError ? error.status : 500, environment: ctx.environment });
    return fromCaught(error, requestId);
  }
}

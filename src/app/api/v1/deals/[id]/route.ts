import { NextResponse } from "next/server";
import { authenticatePartner } from "@/lib/api/auth-partner";
import { fromCaught, PartnerApiError } from "@/lib/api/errors";
import { newRequestId } from "@/lib/api/request-id";
import { logPartnerRequest } from "@/lib/api/request-log";
import { partnerGetDealByRef } from "@/lib/domain/partner-api/deals";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = newRequestId();
  let logPartnerId: string | undefined;
  let logEnvironment: string | undefined;
  try {
    const ctx = await authenticatePartner(request, ["deals:read"]);
    logPartnerId = ctx.partnerId; logEnvironment = ctx.environment;
    const { id } = await context.params;
    const deal = await partnerGetDealByRef(ctx.partnerId, id, ctx.environment);
    logPartnerRequest({ partnerId: ctx.partnerId, requestId, method: "GET", path: "/v1/deals/:id", status: 200, environment: ctx.environment });
    return NextResponse.json({
      data: deal,
      request_id: requestId,
      environment: ctx.environment,
    });
  } catch (error) {
    logPartnerRequest({ partnerId: logPartnerId, requestId, method: "GET", path: "/v1/deals/:id", status: error instanceof PartnerApiError ? error.status : 500, environment: logEnvironment });
    return fromCaught(error, requestId);
  }
}

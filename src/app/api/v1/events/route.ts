import { NextResponse } from "next/server";
import { authenticatePartner } from "@/lib/api/auth-partner";
import { fromCaught, PartnerApiError } from "@/lib/api/errors";
import { newRequestId } from "@/lib/api/request-id";
import { logPartnerRequest } from "@/lib/api/request-log";
import { listPartnerEvents } from "@/lib/domain/partner-api/events";

/**
 * GET /api/v1/events?cursor=...&limit=50
 * Cursor-based recovery complementary to webhooks.
 */
export async function GET(request: Request) {
  const requestId = newRequestId();
  let logPartnerId: string | undefined;
  let logEnvironment: string | undefined;
  try {
    const ctx = await authenticatePartner(request, ["events:read"]);
    logPartnerId = ctx.partnerId; logEnvironment = ctx.environment;
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor");
    const limit = Number(url.searchParams.get("limit") || "50");
    const { events, next_cursor } = await listPartnerEvents({
      partnerId: ctx.partnerId,
      cursor,
      limit,
      environment: ctx.environment,
    });
    logPartnerRequest({ partnerId: ctx.partnerId, requestId, method: "GET", path: "/v1/events", status: 200, environment: ctx.environment });
    return NextResponse.json({
      data: events,
      next_cursor,
      request_id: requestId,
      environment: ctx.environment,
    });
  } catch (error) {
    logPartnerRequest({ partnerId: logPartnerId, requestId, method: "GET", path: "/v1/events", status: error instanceof PartnerApiError ? error.status : 500, environment: logEnvironment });
    return fromCaught(error, requestId);
  }
}

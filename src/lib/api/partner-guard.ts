import { NextResponse } from "next/server";
import {
  authenticatePartner,
  type PartnerScope,
  type PartnerContext,
} from "@/lib/api/auth-partner";
import { PartnerApiError, apiError } from "@/lib/api/errors";
import { newRequestId } from "@/lib/api/request-id";
import { partnerRateLimitAsync, rateLimitHeaders } from "@/lib/api/rate-limit";
import { logPartnerRequest } from "@/lib/api/request-log";

export type GuardOk = {
  ctx: PartnerContext;
  requestId: string;
  rateHeaders: Record<string, string>;
};

export async function guardPartner(
  request: Request,
  scopes: PartnerScope[],
  path: string
): Promise<GuardOk | NextResponse> {
  const requestId = newRequestId();
  try {
    const ctx = await authenticatePartner(request, scopes, { skipRateLimit: true });
    const rl = await partnerRateLimitAsync({
      partnerId: ctx.partnerId,
      environment: ctx.environment,
    });
    const rateHeaders = rateLimitHeaders(rl);
    if (!rl.allowed) {
      logPartnerRequest({
        partnerId: ctx.partnerId,
        requestId,
        method: request.method,
        path,
        status: 429,
        environment: ctx.environment,
      });
      const res = apiError(
        "RATE_LIMITED",
        "Rate limit exceeded. Retry after X-RateLimit-Reset.",
        429,
        requestId
      );
      for (const [k, v] of Object.entries(rateHeaders)) res.headers.set(k, v);
      return res;
    }
    return { ctx, requestId, rateHeaders };
  } catch (error) {
    if (error instanceof PartnerApiError) {
      logPartnerRequest({
        requestId,
        method: request.method,
        path,
        status: error.status,
      });
      return apiError(
        error.code,
        error.message,
        error.status,
        requestId,
        error.details
      );
    }
    logPartnerRequest({
      requestId,
      method: request.method,
      path,
      status: 500,
    });
    return apiError(
      "INTERNAL",
      "An unexpected server error occurred.",
      500,
      requestId
    );
  }
}

export function withRateHeaders(
  res: NextResponse,
  rateHeaders: Record<string, string>
) {
  for (const [k, v] of Object.entries(rateHeaders)) res.headers.set(k, v);
  return res;
}

export function finishLog(opts: {
  partnerId: string;
  requestId: string;
  method: string;
  path: string;
  status: number;
  environment: string;
}) {
  logPartnerRequest(opts);
}

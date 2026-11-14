import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_STATE"
  | "IDEMPOTENCY_CONFLICT"
  | "IDEMPOTENCY_MISMATCH"
  | "UNSUPPORTED_RAIL"
  | "CONFIGURATION_ERROR"
  | "RATE_LIMITED"
  | "LINK_USER_REQUIRED"
  | "PROVIDER_ERROR"
  | "BLOCKCHAIN_ERROR"
  | "INTERNAL";

export class PartnerApiError extends Error {
  code: ApiErrorCode;
  status: number;
  details?: Record<string, unknown>;

  constructor(
    code: ApiErrorCode,
    message: string,
    status = 400,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  requestId: string,
  details?: Record<string, unknown>
) {
  const response = NextResponse.json(
    { error: { code, message, request_id: requestId, details: details || {} } },
    { status }
  );
  if (code === "RATE_LIMITED" && details) {
    if (typeof details.limit === "number") response.headers.set("X-RateLimit-Limit", String(details.limit));
    if (typeof details.remaining === "number") response.headers.set("X-RateLimit-Remaining", String(details.remaining));
    if (typeof details.reset_at === "number") response.headers.set("X-RateLimit-Reset", String(details.reset_at));
    response.headers.set("Retry-After", String(Math.max(1, Number(details.reset_at || 0) - Math.floor(Date.now() / 1000))));
  }
  return response;
}

export function fromCaught(error: unknown, requestId: string) {
  if (error instanceof PartnerApiError) {
    return apiError(
      error.code,
      error.message,
      error.status,
      requestId,
      error.details
    );
  }
  // Never send database/provider exception text to partner clients.
  return apiError("INTERNAL", "An unexpected server error occurred.", 500, requestId);
}

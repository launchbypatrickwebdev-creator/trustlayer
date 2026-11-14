import { NextResponse } from "next/server";
import { authenticatePartner } from "@/lib/api/auth-partner";
import { fromCaught, PartnerApiError } from "@/lib/api/errors";
import { newRequestId } from "@/lib/api/request-id";
import { logPartnerRequest } from "@/lib/api/request-log";
import { linkExternalUser } from "@/lib/domain/partner-api/users";

/**
 * Link partner external_user_id → existing TrustLayer profile id.
 * In production you may gate this behind a signed user consent token.
 */
export async function POST(request: Request) {
  const requestId = newRequestId();
  let logPartnerId: string | undefined;
  let logEnvironment: string | undefined;
  try {
    const ctx = await authenticatePartner(request, ["users:link"]);
    logPartnerId = ctx.partnerId; logEnvironment = ctx.environment;
    const parsedBody = await request.json().catch(() => { throw new PartnerApiError("INVALID_REQUEST", "Request body must be valid JSON.", 400); });
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) throw new PartnerApiError("INVALID_REQUEST", "Request body must be a JSON object.", 400);
    const body = parsedBody as { external_user_id?: string; trustlayer_user_id?: string };
    if (typeof body.external_user_id !== "string" || !body.external_user_id.trim() || body.external_user_id.trim().length > 200 || typeof body.trustlayer_user_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.trustlayer_user_id)) {
      throw new PartnerApiError("INVALID_REQUEST", "external_user_id (1–200 characters) and a valid trustlayer_user_id UUID are required.", 400);
    }
    const link = await linkExternalUser({
      partnerId: ctx.partnerId,
      externalUserId: body.external_user_id.trim(),
      trustlayerUserId: body.trustlayer_user_id,
    });
    logPartnerRequest({ partnerId: ctx.partnerId, requestId, method: "POST", path: "/v1/users/link", status: 200, environment: ctx.environment });
    return NextResponse.json({
      data: link,
      request_id: requestId,
    });
  } catch (error) {
    logPartnerRequest({ partnerId: logPartnerId, requestId, method: "POST", path: "/v1/users/link", status: error instanceof PartnerApiError ? error.status : 500, environment: logEnvironment });
    return fromCaught(error, requestId);
  }
}

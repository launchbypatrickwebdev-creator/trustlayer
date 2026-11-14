import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";

export function logPartnerRequest(opts: {
  partnerId?: string | null;
  requestId: string;
  method: string;
  path: string;
  status?: number;
  environment?: string | null;
}) {
  const admin = createSupabaseAdminClient();
  void Promise.resolve(
    admin.from("api_request_log").insert({
      partner_id: opts.partnerId || null,
      request_id: opts.requestId,
      method: opts.method,
      path: opts.path,
      status: opts.status ?? null,
      environment: opts.environment ?? null,
    })
  ).catch(() => undefined);
}
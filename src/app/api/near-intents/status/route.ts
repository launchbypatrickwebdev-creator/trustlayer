import { NextResponse } from "next/server";
import { getNearIntentsConfig } from "@/lib/near-intents/config";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
export const dynamic = "force-dynamic";
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const config = getNearIntentsConfig();
  return NextResponse.json({
    provider: "near_intents_agent_api",
    mode: config.mode,
    configured: Boolean(config.apiKey),
    agentConfigured: Boolean(config.agentId),
    grantConfigured: Boolean(config.grantToken),
    liveReady: config.liveReady,
    walletConnected: false,
    walletSetup: "deferred",
    network: "agent-api-network-restrictions-must-be-verified",
    executionEnabled: false,
    transactionEngine: "database-backed",
    note: "TrustLayer's persistent agent transaction control plane is separate from NEAR execution. No NEAR wallet or funds are required for agent registration, policy checks, agreement acceptance or evidence workflows. Live NEAR execution remains disabled until owner signing, grant setup and verified provider callbacks are implemented."
  });
}

import { NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { DEVNET_RPC_URL } from "@/lib/crypto/solana";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ComponentState = "operational" | "degraded" | "outage";

type ComponentResult = {
  id: string;
  name: string;
  status: ComponentState;
  detail: string;
  latencyMs: number | null;
};

function overallOf(parts: ComponentResult[]): ComponentState {
  if (parts.some((p) => p.status === "outage")) return "outage";
  if (parts.some((p) => p.status === "degraded")) return "degraded";
  return "operational";
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function checkDatabase(): Promise<ComponentResult> {
  const started = Date.now();
  try {
    const admin = createSupabaseAdminClient();

    // Wrap so withTimeout always gets a real Promise (not PromiseLike)
    const { error } = await withTimeout(
      (async () => {
        const result = await admin
          .from("profiles")
          .select("id", { count: "exact", head: true });
        return { error: result.error };
      })(),
      4_000
    );

    const latencyMs = Date.now() - started;
    if (error) {
      return {
        id: "database",
        name: "Database & accounts",
        status: "outage",
        detail: "Unable to reach TrustLayer data store.",
        latencyMs,
      };
    }
    return {
      id: "database",
      name: "Database & accounts",
      status: latencyMs > 2_500 ? "degraded" : "operational",
      detail:
        latencyMs > 2_500
          ? "Responding slowly — login and deals may lag."
          : "Profiles, deals, and sessions are reachable.",
      latencyMs,
    };
  } catch {
    return {
      id: "database",
      name: "Database & accounts",
      status: "outage",
      detail: "Database check timed out or failed.",
      latencyMs: Date.now() - started,
    };
  }
}

async function checkSolana(): Promise<ComponentResult> {
  const started = Date.now();
  const cluster = (
    process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet"
  ).toLowerCase();
  const label =
    cluster === "mainnet-beta" || cluster === "mainnet"
      ? "Solana mainnet"
      : "Solana Devnet";

  // Same RPC source as deal prepare/fund (NEXT_PUBLIC_SOLANA_RPC_URL or public cluster URL).
  // Public api.devnet.solana.com is often rate-limited; set a dedicated Helius/QuickNode URL in env.
  const rpcCandidates = [
    DEVNET_RPC_URL,
    process.env.NEXT_PUBLIC_SOLANA_RPC_FALLBACK_URL,
    cluster === "mainnet-beta" || cluster === "mainnet"
      ? "https://api.mainnet-beta.solana.com"
      : "https://api.devnet.solana.com",
  ].filter((u, i, arr): u is string => Boolean(u) && arr.indexOf(u) === i);

  let lastErr: unknown = null;
  for (const rpc of rpcCandidates) {
    try {
      const connection = new Connection(rpc, { commitment: "confirmed" });
      const slot = await withTimeout(connection.getSlot("processed"), 5_000);
      const latencyMs = Date.now() - started;
      if (!Number.isFinite(slot) || slot <= 0) {
        lastErr = new Error("invalid slot");
        continue;
      }
      const usingPublic = !process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
      return {
        id: "solana",
        name: `${label} settlement`,
        status: latencyMs > 3_000 ? "degraded" : "operational",
        detail:
          latencyMs > 3_000
            ? `RPC slow (slot ${slot}). Fund / release may take longer.`
            : usingPublic
              ? `RPC healthy · slot ${slot} · public endpoint (set NEXT_PUBLIC_SOLANA_RPC_URL for reliability)`
              : `RPC healthy · slot ${slot}`,
        latencyMs,
      };
    } catch (e) {
      lastErr = e;
    }
  }

  return {
    id: "solana",
    name: `${label} settlement`,
    status: "outage",
    detail:
      "Cannot reach Solana RPC. On-chain create/fund/release may fail until RPC recovers. Existing escrow accounts remain non-custodial. Tip: set NEXT_PUBLIC_SOLANA_RPC_URL to a dedicated provider (Helius, QuickNode, etc.) — public cluster RPCs often rate-limit.",
    latencyMs: Date.now() - started,
  };
}

export async function GET() {
  const checkedAt = new Date().toISOString();
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet";

  const [database, solana] = await Promise.all([
    checkDatabase(),
    checkSolana(),
  ]);

  const web: ComponentResult = {
    id: "web",
    name: "TrustLayer web",
    status: "operational",
    detail: "Status endpoint is serving this response.",
    latencyMs: 0,
  };

  const components = [web, database, solana];
  const overall = overallOf(components);

  return NextResponse.json(
    {
      overall,
      checkedAt,
      cluster,
      components,
      note:
        overall === "operational"
          ? "You can create deals, fund, and settle as usual."
          : overall === "degraded"
            ? "Core app works; some steps may be slower. Retry if a wallet action fails."
            : "A core dependency is down. Existing on-chain escrows remain non-custodial — funds are not held by TrustLayer.",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
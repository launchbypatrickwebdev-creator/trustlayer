import { NextResponse } from "next/server";
import { dispatchPendingWebhooks } from "@/lib/api/webhooks-dispatch";

/**
 * Worker entry — protect with shared secret.
 * Manual / external: POST with header x-trustlayer-worker-key
 * Vercel Cron: Authorization: Bearer <CRON_SECRET>
 */
function isAuthorized(request: Request): boolean {
  const workerKey = process.env.TRUSTLAYER_WEBHOOK_WORKER_KEY?.trim();
  const cronSecret = process.env.CRON_SECRET?.trim();

  const workerHeader = request.headers.get("x-trustlayer-worker-key");
  if (workerKey && workerHeader === workerKey) return true;

  const auth = request.headers.get("authorization");
  if (workerKey && auth === `Bearer ${workerKey}`) return true;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;

  return false;
}

async function runDispatch() {
  try {
    const results = await dispatchPendingWebhooks(25);
    return NextResponse.json({
      ok: true,
      processed: results.length,
      results,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "dispatch failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runDispatch();
}

/** Vercel Cron may invoke GET */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runDispatch();
}
import { getNearIntentsConfig } from "./config";

type JsonRecord = Record<string, unknown>;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = getNearIntentsConfig();
  if (!config.apiKey) {
    throw new Error("NEAR Intents Agent API key is not configured.");
  }

  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("X-API-Key", config.apiKey);
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text.slice(0, 500) };
  }
  if (!response.ok) {
    const detail =
      body && typeof body === "object"
        ? String((body as JsonRecord).message || (body as JsonRecord).error || "")
        : "";
    throw new Error(`NEAR Intents API ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  return body as T;
}

/** Public health information; does not require a wallet or API key. */
export async function getNearIntentsNetwork(): Promise<JsonRecord> {
  const config = getNearIntentsConfig();
  const response = await fetch(`${config.baseUrl}/v1/network`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`NEAR Intents network check failed (${response.status}).`);
  }
  return (await response.json()) as JsonRecord;
}

/** Server-side credential check. Never return this response to an untrusted client. */
export async function getNearIntentsIdentity(): Promise<JsonRecord> {
  return request<JsonRecord>("/v1/whoami");
}

/** A dry quote is read-only: it does not execute a swap or move funds. */
export async function quoteAgentSwap(input: {
  agentId: string;
  originAsset: string;
  destinationAsset: string;
  amount: string;
}): Promise<JsonRecord> {
  const config = getNearIntentsConfig();
  if (config.mode !== "live" || !config.apiKey) {
    throw new Error("Live NEAR Intents quoting is disabled; configure live mode first.");
  }
  if (!input.agentId.trim() || !/^\d+$/.test(input.amount) || BigInt(input.amount) <= 0n) {
    throw new Error("A valid agent ID and positive base-unit amount are required.");
  }
  return request<JsonRecord>(`/v1/agents/${encodeURIComponent(input.agentId)}/swap`, {
    method: "POST",
    body: JSON.stringify({
      origin_asset: input.originAsset,
      destination_asset: input.destinationAsset,
      amount: input.amount,
      dry: true,
    }),
  });
}

/**
 * Executes only after an owner has created the agent and signed a grant.
 * Keep this function server-side; never expose grant tokens to browser code.
 */
export async function executeAgentSwap(input: {
  agentId: string;
  originAsset: string;
  destinationAsset: string;
  amount: string;
  idempotencyKey: string;
}): Promise<JsonRecord> {
  const config = getNearIntentsConfig();
  if (!config.liveReady) {
    throw new Error("Live execution is disabled until API key, agent ID, grant token and live mode are configured.");
  }
  if (!/^\d+$/.test(input.amount) || BigInt(input.amount) <= 0n) {
    throw new Error("A positive base-unit amount is required.");
  }
  if (!input.idempotencyKey || input.idempotencyKey.length < 8) {
    throw new Error("A stable idempotency key is required.");
  }
  return request<JsonRecord>(`/v1/agents/${encodeURIComponent(input.agentId)}/swap`, {
    method: "POST",
    headers: {
      "X-Grant-Token": config.grantToken,
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      origin_asset: input.originAsset,
      destination_asset: input.destinationAsset,
      amount: input.amount,
    }),
  });
}

export async function getAgentOperationStatus(
  correlationId: string
): Promise<JsonRecord> {
  if (!correlationId.trim()) throw new Error("A correlation ID is required.");
  return request<JsonRecord>(
    `/v1/status?correlation_id=${encodeURIComponent(correlationId)}`
  );
}

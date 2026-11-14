export function getNearIntentsConfig() {
  const mode = process.env.NEAR_INTENTS_MODE === "live" ? "live" : "demo";
  const apiKey = process.env.NEAR_INTENTS_AGENT_API_KEY?.trim() || "";
  const agentId = process.env.NEAR_INTENTS_AGENT_ID?.trim() || "";
  const grantToken = process.env.NEAR_INTENTS_GRANT_TOKEN?.trim() || "";
  const baseUrl =
    process.env.NEAR_INTENTS_AGENT_API_URL?.trim() ||
    "https://api.agentsonintents.com";

  return {
    mode,
    apiKey,
    agentId,
    grantToken,
    baseUrl: baseUrl.replace(/\/$/, ""),
    liveReady: mode === "live" && Boolean(apiKey && agentId && grantToken),
  };
}

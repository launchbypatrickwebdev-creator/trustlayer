import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import * as https from "node:https";

export function assertSafeWebhookUrl(raw: string): void {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Invalid webhook URL"); }
  if (u.protocol !== "https:") throw new Error("Webhook URL must use https://");
  if (u.username || u.password) throw new Error("Webhook URL must not include credentials");
  if (u.port && u.port !== "443") throw new Error("Webhook URL must use the standard HTTPS port");
  if (u.hash) throw new Error("Webhook URL must not include a fragment");
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".test") || host.endsWith(".invalid") || host.endsWith(".example") || host.endsWith(".onion") || host.endsWith(".arpa")) throw new Error("Webhook URL host is not allowed");
  if (isIP(host) && !isPublicIp(host)) throw new Error("Private, loopback, link-local, or reserved IP addresses are not allowed");
}

function isPublicIp(raw: string): boolean {
  const version = isIP(raw);
  if (version === 4) {
    const p = raw.split(".").map(Number); const [a,b,c] = p;
    if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2) || (b === 88 && c === 99))) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    if (a === 255 && b === 255 && c === 255) return false;
    return true;
  }
  if (version === 6) {
    const ip = raw.toLowerCase();
    if (ip === "::" || ip === "::1" || ip.startsWith("::ffff:") || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb") || ip.startsWith("ff") || ip.startsWith("2001:db8:") || ip.startsWith("2001:10:") || ip.startsWith("2001:2:") || ip.startsWith("2001:20:") || ip.startsWith("2001:0:") || ip.startsWith("2002:") || ip.startsWith("64:ff9b:")) return false;
    // Require global-unicast 2000::/3; reject IPv6 special-use outside this range.
    const first = parseInt(ip.split(":")[0] || "0", 16);
    return Number.isFinite(first) && first >= 0x2000 && first <= 0x3fff;
  }
  return false;
}

/**
 * Resolve and validate every DNS answer, then pin the request's lookup to the
 * validated address. This prevents redirects and closes the usual DNS-rebinding
 * gap between validation and connection. Production should still enforce egress
 * firewall rules as a second independent control.
 */
export async function postWebhookPinned(rawUrl: string, body: string, headers: Record<string, string>, timeoutMs = 10_000): Promise<{ status: number; ok: boolean }> {
  assertSafeWebhookUrl(rawUrl);
  const url = new URL(rawUrl);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const ipVersion = isIP(hostname);
  const addresses = ipVersion ? [{ address: hostname, family: ipVersion }] : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => !isPublicIp(item.address))) throw new Error("Webhook hostname resolves to a private or reserved address");
  const chosen = addresses[0];
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: "POST", headers: { ...headers, "Content-Length": Buffer.byteLength(body) },
      servername: ipVersion ? undefined : hostname,
      rejectUnauthorized: true,
      lookup: ((_host: string, _options: unknown, callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void) => callback(null, chosen.address, chosen.family)) as never,
      timeout: timeoutMs,
    }, response => {
      // Do not persist or return endpoint response bodies; drain a bounded amount only.
      let consumed = 0;
      response.on("data", chunk => { consumed += Buffer.byteLength(chunk); if (consumed > 64 * 1024) req.destroy(new Error("Webhook response exceeded 64 KiB")); });
      response.on("end", () => { const status = response.statusCode || 0; resolve({ status, ok: status >= 200 && status < 300 }); });
      response.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("Webhook request timed out")));
    req.on("error", reject);
    req.end(body);
  });
}

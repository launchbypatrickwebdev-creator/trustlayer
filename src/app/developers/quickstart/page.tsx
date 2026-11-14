import DocsShell, { Code } from "@/components/developers/DocsShell";

export default function QuickstartPage() {
  return (
    <DocsShell title="Quickstart">
      <p>Marketplace order with first-time TrustLayer users.</p>
      <h2 className="pt-4 text-lg font-bold text-white">1. Health</h2>
      <Code>{"GET /api/v1/health"}</Code>
      <h2 className="pt-4 text-lg font-bold text-white">2. Create deal</h2>
      <Code>{`POST /api/v1/deals
Authorization: Bearer tl_test_…
Idempotency-Key: unique-per-attempt
Content-Type: application/json

{
  "external_id": "order_847291",
  "title": "Website development",
  "amount": "100",
  "rail": "crypto",
  "asset_code": "SOL",
  "buyer":  { "external_id": "mkt_buyer_99" },
  "seller": { "external_id": "mkt_seller_12" },
  "auto_finalize": true
}`}</Code>
      <p>The API key must include <code>deals:create</code>. Because this example sets <code>auto_finalize: true</code>, it must also include the separate <code>deals:finalize</code> scope. Response includes claim_url for unlinked parties. Send those to your users.</p>
      <p className="mt-3">For crypto sessions, use <code>funding:initiate</code> for deposits, <code>settlement:execute</code> for release sessions, and <code>transactions:cancel</code> for cancellation sessions. These scopes do not grant on-chain signing authority.</p>
      <h2 className="pt-4 text-lg font-bold text-white">3. Claim → accept → fund</h2>
      <p>User opens claim_url → signup → deal page → accept → Open Crypto Deposit.</p>
      <h2 className="pt-4 text-lg font-bold text-white">4. Webhooks</h2>
      <p>Register an HTTPS endpoint and save the returned signing secret immediately. Verify HMAC-SHA256 over the exact raw body, deduplicate by event ID, and return a 2xx quickly.</p>
      <h2 className="pt-4 text-lg font-bold text-white">5. Test safely</h2>
      <p>Use test credentials first. The <a className="text-emerald-300" href="/developers/sandbox">integration sandbox</a> demonstrates simulated failures; it does not move funds or call the API.</p>
    </DocsShell>
  );
}

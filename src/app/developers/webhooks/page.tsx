import DocsShell, { Code } from "@/components/developers/DocsShell";

export default function WebhooksPage() {
  return (
    <DocsShell title="Webhooks">
      <Code>{`POST /api/v1/webhooks
{ "url": "https://your-app.com/hooks/trustlayer", "description": "Orders" }`}</Code>
      <p>Store signing_secret (whsec_…) — shown once.</p>
      <h2 className="pt-4 text-lg font-bold text-white">Headers</h2>
      <p>user-agent: TrustLayer-Webhooks/1.0</p>
      <p>x-trustlayer-signature: sha256=&lt;hex&gt;</p>
      <h2 className="pt-4 text-lg font-bold text-white">Verify</h2>
      <Code>{`HMAC-SHA256(rawBody, signing_secret) as hex
Compare to header value after "sha256="`}</Code>
      <p>Use raw body bytes. Events include type deal.created, deal.finalized, deal_id, external_id.</p>
    </DocsShell>
  );
}

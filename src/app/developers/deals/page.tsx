import DocsShell, { Code } from "@/components/developers/DocsShell";

export default function DealsPage() {
  return (
    <DocsShell title="Deals">
      <Code>{`POST /api/v1/deals
POST /api/v1/deals/{id}/finalize
GET  /api/v1/deals/{id_or_external_id}
GET  /api/v1/deals`}</Code>
      <p>auto_finalize: true locks agreement at create. Lifecycle matches web: draft → finalize → accept → fund → release.</p>
      <p>asset_code: SOL | USDC | USDT.</p>
    </DocsShell>
  );
}

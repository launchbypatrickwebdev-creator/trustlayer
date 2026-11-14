import DocsShell, { Code } from "@/components/developers/DocsShell";

export default function UsersPage() {
  return (
    <DocsShell title="Users & claim">
      <h2 className="text-lg font-bold text-white">claim (recommended)</h2>
      <p>Create deal without link. Unlinked parties get claim_url. User signs up and is seated as buyer/seller.</p>
      <h2 className="pt-4 text-lg font-bold text-white">Option A — link</h2>
      <Code>{`POST /api/v1/users/link

{
  "external_user_id": "mkt_buyer_99",
  "trustlayer_user_id": "8d956c75-…"
}`}</Code>
      <p>Use field name trustlayer_user_id (not user_id).</p>
    </DocsShell>
  );
}

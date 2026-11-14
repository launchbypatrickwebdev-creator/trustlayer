import DocsShell, { Code } from "@/components/developers/DocsShell";
import Link from "next/link";

export default function AxDocsPage() {
  return (
    <DocsShell
      title="One-leg & Ax"
      subtitle="solana_escrow and solana_ax on the same Partner API."
    >
      <h2 className="text-base font-bold text-white">One-leg escrow</h2>
      <p>
        Adapter <code className="text-emerald-200">solana_escrow</code>. Single{" "}
        <code>amount</code> + <code>asset_code</code>. Sessions: deposit, release,
        cancel, cancel_unfunded.
      </p>

      <h2 className="mt-8 text-base font-bold text-white">Atomic exchange</h2>
      <p>
        <code className="text-emerald-200">settlement_adapter: &quot;solana_ax&quot;</code>{" "}
        with exactly two <code>legs</code>. Never use <code>dvp</code>.
      </p>
      <Code>{`{
  "external_id": "ax_847",
  "title": "USDC for SOL",
  "settlement_adapter": "solana_ax",
  "buyer": { "external_id": "buyer_1" },
  "seller": { "external_id": "seller_1" },
  "legs": [
    { "leg_index": 0, "party_role": "buyer", "asset_code": "USDC", "amount": "100" },
    { "leg_index": 1, "party_role": "seller", "asset_code": "SOL", "amount": "0.75" }
  ]
}`}</Code>

      <h2 className="mt-8 text-base font-bold text-white">Fund a leg</h2>
      <Code>{`POST /api/v1/crypto/sessions
{ "deal_id": "<uuid>", "action": "fund", "leg_index": 0 }`}</Code>
      <p className="text-xs text-slate-500">
        Ax release / cancel_ax are authority/admin only — not party Partner sessions.
      </p>
      <p className="mt-6">
        <Link href="/developers/reference#create-ax" className="text-emerald-300">
          API reference → Create Ax
        </Link>
      </p>
    </DocsShell>
  );
}

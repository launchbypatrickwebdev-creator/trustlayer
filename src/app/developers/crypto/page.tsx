import DocsShell, { Code } from "@/components/developers/DocsShell";

export default function CryptoPage() {
  return (
    <DocsShell title="Crypto & funding">
      <p>Non-custodial Solana escrow. Partners create deals; users fund and release with their wallets on TrustLayer.</p>
      <Code>{"actions.open → /deals/{id}"}</Code>
      <p>Prerequisites: finalized, parties claimed, accept when required, correct cluster in wallet.</p>
    </DocsShell>
  );
}

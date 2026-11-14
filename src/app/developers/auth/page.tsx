import DocsShell, { Code } from "@/components/developers/DocsShell";

export default function AuthPage() {
  return (
    <DocsShell title="Auth & keys">
      <Code>{`Authorization: Bearer tl_test_<prefix>.<secret>
Authorization: Bearer tl_live_<prefix>.<secret>`}</Code>
      <p>Secret is shown once at creation and stored hashed.</p>
      <h2 className="pt-4 text-lg font-bold text-white">Test vs live</h2>
      <p><code className="text-emerald-300">tl_test_*</code> for integration; <code className="text-emerald-300">tl_live_*</code> for production. Environments are isolated.</p>
      <h2 className="pt-4 text-lg font-bold text-white">Idempotency</h2>
      <Code>{"Idempotency-Key: order_847291-create"}</Code>
      <p>Required for create and finalize to safely retry.</p>
    </DocsShell>
  );
}

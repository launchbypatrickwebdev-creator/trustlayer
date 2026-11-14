import Link from "next/link";

export default function PartnerNoAccessPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#04101f] px-4 text-center">
      <h1 className="text-2xl font-black text-white">No partner workspace</h1>
      <p className="mt-3 max-w-md text-sm text-slate-400">
        This account is not linked to a Partner API workspace. Ask a TrustLayer
        operator to add you in partner_members, or continue in the main app.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-[#042f2e] no-underline"
      >
        Back to app
      </Link>
    </main>
  );
}

import ApiReferenceExplorer from "./ApiReferenceExplorer";

export default function PartnerApiReferencePage() {
  return (
    <div className="mx-auto max-w-6xl">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-400/90">
        Reference · v1
      </p>
      <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
        API reference
      </h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
        Endpoints with copyable examples. OpenAPI:{" "}
        <code className="text-emerald-200">GET /api/v1/openapi</code>. Use the
        left sidebar (method badges) to jump.
      </p>
      <div className="mt-8">
        <ApiReferenceExplorer />
      </div>
    </div>
  );
}

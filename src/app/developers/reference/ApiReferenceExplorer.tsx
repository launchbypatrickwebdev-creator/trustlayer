"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Search } from "lucide-react";
import { methodBadgeClass, type HttpMethod } from "@/lib/developers/nav";

type Lang = "curl" | "javascript" | "python";

type Endpoint = {
  id: string;
  method: HttpMethod;
  path: string;
  title: string;
  description: string;
  scope: string;
  body?: string;
  response: string;
};

const endpoints: Endpoint[] = [
  {
    id: "health",
    method: "GET",
    path: "/health",
    title: "Health check",
    description: "Reachability probe. Does not prove DB or chain health.",
    scope: "Public",
    response: '{"ok":true}',
  },
  {
    id: "openapi",
    method: "GET",
    path: "/openapi",
    title: "OpenAPI document",
    description: "Machine-readable OpenAPI 3 schema for this API version.",
    scope: "Public",
    response: '{"openapi":"3.0.3"}',
  },
  {
    id: "list-deals",
    method: "GET",
    path: "/deals",
    title: "List deals",
    description:
      "Cursor pagination within the API key environment (limit, cursor, next_cursor).",
    scope: "deals:read",
    response:
      '{"data":[],"next_cursor":null,"has_more":false,"environment":"test"}',
  },
  {
    id: "create-deal",
    method: "POST",
    path: "/deals",
    title: "Create deal (one-leg)",
    description: "solana_escrow deal. Requires Idempotency-Key.",
    scope: "deals:create",
    body: '{"external_id":"order_123","title":"Design project","amount":"25.00","rail":"crypto","settlement_adapter":"solana_escrow","asset_code":"USDC","buyer":{"external_id":"buyer_1"},"seller":{"external_id":"seller_1"}}',
    response:
      '{"data":{"id":"<deal-uuid>","status":"draft"},"request_id":"<request-id>"}',
  },
  {
    id: "create-ax",
    method: "POST",
    path: "/deals",
    title: "Create Ax deal",
    description: "solana_ax with exactly two legs (0=buyer, 1=seller).",
    scope: "deals:create",
    body: '{"external_id":"ax_847","title":"USDC for SOL","settlement_adapter":"solana_ax","buyer":{"external_id":"buyer_1"},"seller":{"external_id":"seller_1"},"legs":[{"leg_index":0,"party_role":"buyer","asset_code":"USDC","amount":"100"},{"leg_index":1,"party_role":"seller","asset_code":"SOL","amount":"0.75"}]}',
    response:
      '{"data":{"id":"<deal-uuid>","settlement_adapter":"solana_ax","legs":[]},"request_id":"<request-id>"}',
  },
  {
    id: "get-deal",
    method: "GET",
    path: "/deals/{id}",
    title: "Get deal",
    description: "By TrustLayer UUID or partner external_id.",
    scope: "deals:read",
    response:
      '{"data":{"id":"<deal-uuid>","status":"draft","legs":[]},"request_id":"<request-id>"}',
  },
  {
    id: "finalize",
    method: "POST",
    path: "/deals/{id}/finalize",
    title: "Finalize deal",
    description: "Lock agreement terms. Requires deals:finalize when used.",
    scope: "deals:finalize",
    response: '{"data":{"id":"<deal-uuid>","status":"awaiting_payment"}}',
  },
  {
    id: "sessions",
    method: "POST",
    path: "/crypto/sessions",
    title: "Create crypto session",
    description:
      "One-leg: deposit | release | cancel | cancel_unfunded. Ax party: fund | cancel_unfunded | open_dispute.",
    scope: "action-specific",
    body: '{"deal_id":"<deal-uuid>","action":"deposit","milestone_index":0}',
    response: '{"data":{"url":"https://<host>/...","expires_at":"<iso>"}}',
  },
  {
    id: "fund-ax",
    method: "POST",
    path: "/crypto/sessions",
    title: "Fund Ax leg",
    description:
      "action=fund with leg_index 0 or 1. User signs on the returned URL.",
    scope: "funding:initiate",
    body: '{"deal_id":"<deal-uuid>","action":"fund","leg_index":0}',
    response:
      '{"data":{"action":"fund","leg_index":0,"url":"https://<host>/deals/<id>/ax?action=fund&leg=0"}}',
  },
  {
    id: "users-link",
    method: "POST",
    path: "/users/link",
    title: "Link external user",
    description: "Map partner external_user_id to TrustLayer user id.",
    scope: "users:link",
    body: '{"external_user_id":"buyer_1","trustlayer_user_id":"<user-uuid>"}',
    response: '{"data":{"linked":true}}',
  },
  {
    id: "events",
    method: "GET",
    path: "/events",
    title: "Poll events",
    description: "Cursor-based event feed for the key environment.",
    scope: "events:read",
    response: '{"data":[],"next_cursor":null,"environment":"test"}',
  },
  {
    id: "webhooks-list",
    method: "GET",
    path: "/webhooks",
    title: "List webhooks",
    description:
      "Endpoints for this environment. Secrets are never re-returned.",
    scope: "webhooks:manage",
    response: '{"data":[]}',
  },
  {
    id: "webhooks-register",
    method: "POST",
    path: "/webhooks",
    title: "Register webhook",
    description:
      "HTTPS endpoint. Store signing_secret immediately (shown once).",
    scope: "webhooks:manage",
    body: '{"url":"https://your.example/hooks/trustlayer","description":"Orders"}',
    response: '{"data":{"id":"<id>","signing_secret":"<once>"}}',
  },
];

const BASE = "https://YOUR_TRUSTLAYER_HOST/api/v1";

function needsIdempotency(path: string) {
  return (
    path === "/deals" ||
    path.endsWith("/finalize") ||
    path === "/crypto/sessions"
  );
}

function snippet(e: Endpoint, lang: Lang): string {
  const url = BASE + e.path.replace("{id}", "<deal-id>");
  const idem = needsIdempotency(e.path);

  if (lang === "curl") {
    const lines = [
      "curl -X " + e.method + " '" + url + "' \\",
      "  -H 'Authorization: Bearer $TRUSTLAYER_API_KEY' \\",
      "  -H 'Content-Type: application/json'",
    ];
    if (idem) {
      lines[lines.length - 1] += " \\";
      lines.push("  -H 'Idempotency-Key: attempt-1'");
    }
    if (e.body) {
      lines[lines.length - 1] += " \\";
      lines.push("  --data '" + e.body + "'");
    }
    return lines.join("\n");
  }

  if (lang === "javascript") {
    const headerLines = [
      '    Authorization: `Bearer ${process.env.TRUSTLAYER_API_KEY}`',
      '    "Content-Type": "application/json"',
    ];
    if (idem) {
      headerLines.push('    "Idempotency-Key": "attempt-1"');
    }
    const parts = [
      'const res = await fetch("' + url + '", {',
      '  method: "' + e.method + '",',
      "  headers: {",
      headerLines.join(",\n") + ",",
      "  },",
    ];
    if (e.body) {
      parts.push("  body: " + e.body + ",");
    }
    parts.push("});");
    parts.push("const json = await res.json();");
    return parts.join("\n");
  }

  // python — plain string concat only (no nested template literals)
  const pyHeaders =
    '{"Authorization": f"Bearer {os.environ[\'TRUSTLAYER_API_KEY\']}", "Content-Type": "application/json"' +
    (idem ? ', "Idempotency-Key": "attempt-1"' : "") +
    "}";
  let py =
    "import requests, os\n" +
    'r = requests.request("' +
    e.method +
    '", "' +
    url +
    '", headers=' +
    pyHeaders;
  if (e.body) {
    py += ", json=" + e.body;
  }
  py += ")\nprint(r.json())";
  return py;
}

export default function ApiReferenceExplorer() {
  const [q, setQ] = useState("");
  const [lang, setLang] = useState<Lang>("curl");
  const [copied, setCopied] = useState<string | null>(null);

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return endpoints;
    return endpoints.filter((e) =>
      [e.title, e.path, e.description, e.method, e.id]
        .join(" ")
        .toLowerCase()
        .includes(n)
    );
  }, [q]);

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-[12rem] flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter endpoints"
            className="w-full rounded-lg border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-slate-200 outline-none focus:border-emerald-500/40"
          />
        </label>
        <div className="flex gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
          {(["curl", "javascript", "python"] as Lang[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={
                "rounded-md px-3 py-1.5 text-xs font-semibold capitalize " +
                (lang === l
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "text-slate-400")
              }
            >
              {l === "javascript" ? "JS" : l}
            </button>
          ))}
        </div>
      </div>

      {list.map((e) => {
        const code = snippet(e, lang);
        return (
          <section
            key={e.id}
            id={e.id}
            className="scroll-mt-28 rounded-2xl border border-white/10 bg-white/[0.02] p-6 sm:p-7"
          >
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className={
                  "rounded-full px-2.5 py-1 text-[10px] font-bold " +
                  methodBadgeClass(e.method)
                }
              >
                {e.method}
              </span>
              <h2 className="text-lg font-bold text-white sm:text-xl">
                {e.title}
              </h2>
            </div>
            <p className="mt-2 font-mono text-xs text-slate-400">
              {e.method} {e.path}
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {e.description}
            </p>
            <p className="mt-2 text-xs text-slate-500">Scope: {e.scope}</p>

            <div className="mt-5 overflow-hidden rounded-xl border border-white/10 bg-black/50">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {lang} example
                </span>
                <button
                  type="button"
                  onClick={() => copy(e.id, code)}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
                >
                  {copied === e.id ? <Check size={14} /> : <Copy size={14} />}
                  {copied === e.id ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className="overflow-x-auto p-4 text-xs leading-6 text-emerald-100">
                <code>{code}</code>
              </pre>
            </div>

            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Example response
              </p>
              <pre className="mt-2 overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-4 text-xs leading-6 text-slate-300">
                <code>{e.response}</code>
              </pre>
            </div>
          </section>
        );
      })}
    </div>
  );
}

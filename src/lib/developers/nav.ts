/**
 * ReadMe-style developer portal IA.
 * Groups + optional HTTP method badges (API reference style).
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "DEL";
export type DocCapability = "live" | "beta" | "coming";

export type DevNavLink = {
  href: string;
  label: string;
  method?: HttpMethod;
  badge?: DocCapability;
  /** Hide from search-only filter when empty match */
  keywords?: string[];
};

export type DevNavGroup = {
  id: string;
  title: string;
  items: DevNavLink[];
};

export const DEVELOPER_NAV_GROUPS: DevNavGroup[] = [
  {
    id: "intro",
    title: "TrustLayer Partner API",
    items: [
      {
        href: "/developers",
        label: "Introduction",
        keywords: ["overview", "intro"],
      },
      {
        href: "/developers/errors",
        label: "Errors",
        keywords: ["error", "codes"],
      },
      {
        href: "/developers#pagination",
        label: "Pagination",
        keywords: ["cursor", "limit", "next_cursor"],
      },
    ],
  },
  {
    id: "start",
    title: "Getting started",
    items: [
      {
        href: "/developers/quickstart",
        label: "Quickstart",
        keywords: ["create", "health"],
      },
      {
        href: "/developers/auth",
        label: "Authentication",
        keywords: ["api key", "bearer", "scopes"],
      },
      {
        href: "/developers/users",
        label: "Users & claims",
        keywords: ["claim", "link"],
      },
      {
        href: "/developers/webhooks",
        label: "Webhooks",
        keywords: ["hmac", "events"],
      },
    ],
  },
  {
    id: "deals",
    title: "Deals & settlement",
    items: [
      {
        href: "/developers/deals",
        label: "Deals & agreements",
        keywords: ["create", "finalize"],
      },
      {
        href: "/developers/ax",
        label: "One-leg & Ax",
        badge: "live",
        keywords: ["solana_ax", "escrow", "legs"],
      },
      {
        href: "/developers/crypto",
        label: "Funding & sessions",
        keywords: ["deposit", "fund", "release"],
      },
    ],
  },
  {
    id: "reference",
    title: "API reference",
    items: [
      {
        href: "/developers/reference#health",
        label: "Health",
        method: "GET",
      },
      {
        href: "/developers/reference#openapi",
        label: "OpenAPI",
        method: "GET",
      },
      {
        href: "/developers/reference#list-deals",
        label: "List deals",
        method: "GET",
      },
      {
        href: "/developers/reference#create-deal",
        label: "Create deal",
        method: "POST",
      },
      {
        href: "/developers/reference#create-ax",
        label: "Create Ax deal",
        method: "POST",
      },
      {
        href: "/developers/reference#get-deal",
        label: "Get deal",
        method: "GET",
      },
      {
        href: "/developers/reference#finalize",
        label: "Finalize deal",
        method: "POST",
      },
      {
        href: "/developers/reference#sessions",
        label: "Crypto sessions",
        method: "POST",
      },
      {
        href: "/developers/reference#fund-ax",
        label: "Fund Ax leg",
        method: "POST",
      },
      {
        href: "/developers/reference#events",
        label: "Poll events",
        method: "GET",
      },
      {
        href: "/developers/reference#webhooks-list",
        label: "List webhooks",
        method: "GET",
      },
      {
        href: "/developers/reference#webhooks-register",
        label: "Register webhook",
        method: "POST",
      },
      {
        href: "/developers/reference#users-link",
        label: "Link user",
        method: "POST",
      },
    ],
  },
  {
    id: "tools",
    title: "Tools",
    items: [
      { href: "/developers/sandbox", label: "Sandbox" },
      { href: "/developers/reference", label: "Full reference explorer" },
    ],
  },
];

export type IntegrationType = {
  id: string;
  title: string;
  description: string;
  href: string;
  capabilities: { label: string; status: DocCapability }[];
};

export const INTEGRATION_TYPES: IntegrationType[] = [
  {
    id: "marketplace",
    title: "Marketplaces",
    description: "Protect buyer and seller transactions.",
    href: "/developers/quickstart",
    capabilities: [
      { label: "One-leg escrow", status: "live" },
      { label: "Claims & webhooks", status: "live" },
      { label: "Ax swaps", status: "live" },
    ],
  },
  {
    id: "dapp",
    title: "DApps & Web3",
    description: "Integrate wallet-based escrow and atomic swaps.",
    href: "/developers/ax",
    capabilities: [
      { label: "Solana escrow", status: "live" },
      { label: "solana_ax", status: "live" },
      { label: "Wallet sessions", status: "live" },
    ],
  },
  {
    id: "developers",
    title: "Developers",
    description: "Build custom applications using the API and SDK.",
    href: "/developers/reference",
    capabilities: [
      { label: "Partner API + SDK", status: "live" },
      { label: "Sandbox", status: "live" },
    ],
  },
  {
    id: "banks",
    title: "Banks & institutions",
    description: "Explore regulated settlement and institutional integration.",
    href: "/developers/errors",
    capabilities: [
      { label: "Crypto settlement", status: "live" },
      { label: "Fiat rails", status: "coming" },
    ],
  },
];

export function methodBadgeClass(m: HttpMethod): string {
  if (m === "GET") return "bg-emerald-600 text-white";
  if (m === "POST") return "bg-blue-600 text-white";
  if (m === "PUT") return "bg-violet-600 text-white";
  return "bg-rose-600 text-white";
}

export function capabilityBadgeClass(status: DocCapability): string {
  if (status === "live")
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "beta")
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-slate-500/30 bg-slate-500/10 text-slate-400";
}

export function isNavActive(pathname: string, href: string): boolean {
  const path = href.split("#")[0];
  if (path === "/developers") return pathname === "/developers";
  return pathname === path || pathname.startsWith(path + "/");
}

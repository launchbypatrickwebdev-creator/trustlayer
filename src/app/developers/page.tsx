
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Blocks,
  Building2,
  Code2,
  CodeXml,
  Globe2,
  Layers3,
  LockKeyhole,
  Network,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Webhook,
  Zap,
} from "lucide-react";

export const metadata: Metadata = {
  title: "TrustLayer for Developers | Transaction Trust Infrastructure",
  description:
    "Integrate conditional escrow and atomic asset exchange into your application with TrustLayer's transaction trust infrastructure.",
};

const audiences = [
  {
    icon: ShoppingBag,
    title: "Marketplaces",
    text: "Coordinate protected transactions between buyers and sellers without building escrow infrastructure from scratch.",
  },
  {
    icon: Globe2,
    title: "Wallets & exchanges",
    text: "Bring agreement-based transactions and atomic asset exchange into the products your customers already use.",
  },
  {
    icon: Blocks,
    title: "DApps & Web3",
    text: "Connect on-chain applications to structured agreements, funding flows and settlement outcomes.",
  },
  {
    icon: Building2,
    title: "Banks & institutions",
    text: "Explore programmable transaction coordination and atomic exchange for eligible digital assets.",
  },
  {
    icon: Code2,
    title: "Developers & platforms",
    text: "Use APIs, SDKs and webhooks to build custom transaction experiences around your own product.",
  },
  {
    icon:Globe2,
    title: "Fintechs & businesses",
    text: "Add conditional settlement to commercial workflows, services and business-to-business transactions.",
  },
];

const steps: [string, string, string][] = [
  [
    "01",
    "Create your integration",
    "Connect with TrustLayer and configure your application and environment.",
  ],
  [
    "02",
    "Build with the API",
    "Use the Partner API and SDK to create agreements and coordinate transaction flows.",
  ],
  [
    "03",
    "Test the full journey",
    "Exercise requests, events and supported Solana flows with test credentials and the appropriate test deployment.",
  ],
  [
    "04",
    "Prepare for production",
    "Complete integration review and request live access when your application is ready.",
  ],
];

function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300">
      {children}
    </p>
  );
}

/**
 * Hero artwork.
 *
 * The image wrapper has an explicit responsive height. This is important
 * because Next Image with `fill` needs a parent with a measurable height.
 */

function HeroArtwork() {
  return (
    <div
      className="relative mx-auto w-full"
      style={{
        height: "clamp(390px, 45vw, 520px)",
        maxWidth: "620px",
        marginLeft: "auto",
        marginRight: 0,
      }}
    >
      {/* Emerald ambient glow */}
      <div className="absolute -inset-8 rounded-[44px] bg-emerald-300/[0.12] blur-3xl" />

      {/* Main artwork container */}
      <div
        className="relative isolate overflow-hidden rounded-[30px] border border-emerald-300/30 bg-[#102b36]"
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
        }}
      >
        {/* Background image */}
        <Image
          src="/marketing/trustlayer-glass-hero.jpg"
          alt="Abstract emerald glass sculpture representing connected transaction infrastructure"
          width={3167}
          height={2000}
          priority
          sizes="(max-width: 1024px) 100vw, 620px"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
            display: "block",
            opacity: 1,
          }}
        />

        {/* Subtle image treatment */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#071326]/10 via-transparent to-[#071326]/35" />

        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(16,185,129,.18),transparent_65%)]" />

        {/* Architectural grid */}
        <div
          className="absolute inset-0 opacity-[.10]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.15) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.15) 1px,transparent 1px)",
            backgroundSize: "42px 42px",
          }}
        />

        {/* Ambient lighting */}
        <div className="absolute left-[18%] top-[15%] h-48 w-48 rounded-full bg-emerald-300/15 blur-[75px]" />
        <div className="absolute bottom-[20%] right-[12%] h-48 w-48 rounded-full bg-cyan-300/10 blur-[75px]" />

        {/* Glass architecture */}
        <div className="absolute left-[17%] top-[24%] h-40 w-40 rotate-[-18deg] rounded-[28px] border border-emerald-100/30 bg-gradient-to-br from-emerald-200/20 via-emerald-400/10 to-transparent shadow-[inset_0_1px_20px_rgba(255,255,255,.18),0_20px_70px_rgba(16,185,129,.12)] backdrop-blur-md" />

        <div className="absolute right-[16%] top-[17%] h-32 w-32 rotate-[18deg] rounded-[24px] border border-cyan-100/30 bg-gradient-to-br from-cyan-100/20 via-cyan-400/10 to-transparent shadow-[inset_0_1px_20px_rgba(255,255,255,.16),0_20px_70px_rgba(34,211,238,.12)] backdrop-blur-md" />

        <div className="absolute bottom-[28%] left-[39%] h-36 w-36 rotate-[12deg] rounded-[26px] border border-white/20 bg-gradient-to-br from-white/15 via-emerald-200/10 to-emerald-500/10 shadow-[inset_0_1px_24px_rgba(255,255,255,.2),0_25px_65px_rgba(0,0,0,.3)] backdrop-blur-xl" />

        {/* Connected infrastructure paths */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 600 550"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M130 180 L300 275 L470 150"
            stroke="#6ee7b7"
            strokeOpacity=".55"
            strokeWidth="1.2"
          />
          <path
            d="M300 275 L330 420"
            stroke="#67e8f9"
            strokeOpacity=".45"
            strokeWidth="1.2"
          />
          <path
            d="M130 180 L130 100"
            stroke="#6ee7b7"
            strokeOpacity=".25"
            strokeDasharray="4 7"
          />
          <path
            d="M470 150 L510 220"
            stroke="#67e8f9"
            strokeOpacity=".25"
            strokeDasharray="4 7"
          />
          <circle cx="130" cy="180" r="4" fill="#a7f3d0" />
          <circle cx="300" cy="275" r="5" fill="#6ee7b7" />
          <circle cx="470" cy="150" r="4" fill="#67e8f9" />
          <circle cx="330" cy="420" r="4" fill="#67e8f9" />
        </svg>

        {/* Hero labels */}
        <div className="absolute inset-x-5 top-5 z-10 flex items-center justify-between gap-2 sm:inset-x-7 sm:top-7">
          <span className="rounded-full border border-white/15 bg-[#071326]/65 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-white/85 backdrop-blur-md">
            TrustLayer · Transaction layer
          </span>

          <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1.5 text-[10px] font-bold text-emerald-100 backdrop-blur-md">
            SOLANA · LIVE
          </span>
        </div>

        {/* Product interface */}
        <div className="absolute inset-x-4 bottom-4 z-10 rounded-2xl border border-white/15 bg-[#071326]/85 p-4 shadow-2xl backdrop-blur-xl sm:inset-x-7 sm:bottom-7 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-200">
                One integration layer
              </p>

              <p className="mt-1 text-sm font-bold text-white sm:text-base">
                Agreement to settlement
              </p>
            </div>

            <Network size={20} className="shrink-0 text-emerald-200" />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/[.08] px-3 py-3">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-emerald-200" />

                <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-100">
                  One-leg
                </span>
              </div>

              <p className="mt-1.5 text-xs font-semibold text-white">
                Conditional settlement
              </p>
            </div>

            <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/[.08] px-3 py-3">
              <div className="flex items-center gap-2">
                <RefreshCw size={14} className="text-cyan-200" />

                <span className="text-[10px] font-bold uppercase tracking-wide text-cyan-100">
                  Two-leg Ax
                </span>
              </div>

              <p className="mt-1.5 text-xs font-semibold text-white">
                Atomic asset exchange
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
            <span className="text-[10px] font-medium text-slate-400">
              Built for your product
            </span>

            <span className="text-[10px] font-semibold text-slate-300">
              APIs · SDKs · Webhooks
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}


/**
 * One-leg escrow illustration.
 *
 * A single asset moves from the funder through a protected agreement
 * and its conditions to the recipient.
 */
function OneLegDiagram() {
  return (
    <div className="mt-8 overflow-hidden rounded-2xl border border-emerald-300/15 bg-[#071326]/65 p-3 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <span className="text-[9px] font-bold uppercase tracking-[.18em] text-emerald-200/80">
          One committed asset
        </span>
        <span className="rounded-full border border-emerald-300/15 bg-emerald-300/[.06] px-2.5 py-1 text-[9px] font-semibold text-emerald-100">
          Conditional settlement
        </span>
      </div>

      <svg
        viewBox="0 0 760 190"
        role="img"
        aria-label="Funder commits an asset to a protected agreement, which settles to the recipient when its conditions are met."
        className="h-auto w-full"
        fill="none"
      >
        <defs>
          <linearGradient id="oneLegLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#6ee7b7" stopOpacity=".35" />
            <stop offset="50%" stopColor="#6ee7b7" />
            <stop offset="100%" stopColor="#67e8f9" stopOpacity=".8" />
          </linearGradient>
          <linearGradient id="oneLegCore" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity=".24" />
            <stop offset="100%" stopColor="#0e7490" stopOpacity=".12" />
          </linearGradient>
          <marker
            id="oneLegArrow"
            markerWidth="7"
            markerHeight="7"
            refX="5"
            refY="3.5"
            orient="auto"
          >
            <path d="M0 0 L7 3.5 L0 7" fill="#6ee7b7" />
          </marker>
        </defs>

        {/* Connecting transaction path */}
        <path
          d="M170 82 H292"
          stroke="url(#oneLegLine)"
          strokeWidth="2"
          markerEnd="url(#oneLegArrow)"
        />
        <path
          d="M468 82 H590"
          stroke="url(#oneLegLine)"
          strokeWidth="2"
          markerEnd="url(#oneLegArrow)"
        />

        <circle cx="230" cy="82" r="3" fill="#6ee7b7" />
        <circle cx="530" cy="82" r="3" fill="#67e8f9" />

        {/* Funder */}
        <rect
          x="20"
          y="37"
          width="150"
          height="90"
          rx="16"
          fill="#10243a"
          stroke="#ffffff"
          strokeOpacity=".14"
        />
        <rect
          x="34"
          y="51"
          width="32"
          height="32"
          rx="10"
          fill="#ffffff"
          fillOpacity=".07"
          stroke="#ffffff"
          strokeOpacity=".14"
        />
        <path
          d="M42 67 L50 60 L58 67 V76 H42 V67Z"
          stroke="#d1fae5"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M46 76 V69 H54 V76"
          stroke="#d1fae5"
          strokeWidth="1.5"
        />
        <text x="34" y="105" fill="#ffffff" fontSize="13" fontWeight="700">
          Funder
        </text>
        <text x="34" y="117" fill="#94a3b8" fontSize="9">
          Commits the asset
        </text>

        {/* Protected agreement */}
        <rect
          x="292"
          y="20"
          width="176"
          height="124"
          rx="18"
          fill="url(#oneLegCore)"
          stroke="#6ee7b7"
          strokeOpacity=".55"
        />
        <rect
          x="359"
          y="34"
          width="42"
          height="42"
          rx="12"
          fill="#6ee7b7"
          fillOpacity=".12"
          stroke="#6ee7b7"
          strokeOpacity=".4"
        />
        <rect
          x="370"
          y="52"
          width="20"
          height="15"
          rx="3"
          stroke="#a7f3d0"
          strokeWidth="1.6"
        />
        <path
          d="M374 52 V47 A6 6 0 0 1 386 47 V52"
          stroke="#a7f3d0"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="380" cy="59" r="1.5" fill="#a7f3d0" />
        <text
          x="380"
          y="96"
          fill="#d1fae5"
          fontSize="13"
          fontWeight="700"
          textAnchor="middle"
        >
          Protected agreement
        </text>
        <text
          x="380"
          y="113"
          fill="#94a3b8"
          fontSize="10"
          textAnchor="middle"
        >
          Conditions · Resolution
        </text>
        <text
          x="380"
          y="127"
          fill="#6ee7b7"
          fontSize="9"
          fontWeight="600"
          textAnchor="middle"
        >
          Settlement logic
        </text>

        {/* Recipient */}
        <rect
          x="590"
          y="37"
          width="150"
          height="90"
          rx="16"
          fill="#10243a"
          stroke="#67e8f9"
          strokeOpacity=".25"
        />
        <rect
          x="604"
          y="51"
          width="32"
          height="32"
          rx="10"
          fill="#67e8f9"
          fillOpacity=".08"
          stroke="#67e8f9"
          strokeOpacity=".25"
        />
        <path
          d="M612 67 L620 60 L628 67 V76 H612 V67Z"
          stroke="#a5f3fc"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M616 76 V69 H624 V76"
          stroke="#a5f3fc"
          strokeWidth="1.5"
        />
        <text x="604" y="105" fill="#ffffff" fontSize="13" fontWeight="700">
          Recipient
        </text>
        <text x="604" y="117" fill="#94a3b8" fontSize="9">
          Receives on settlement
        </text>
      </svg>

      <p className="mt-2 border-t border-white/[0.08] px-1 pt-3 text-center text-[10px] leading-5 text-slate-400">
        The committed asset follows the agreement&apos;s defined settlement or
        resolution path.
      </p>
    </div>
  );
}

/**
 * Two-leg Ax illustration.
 *
 * Both parties commit an asset. Ax coordinates the two legs so that
 * the exchange is handled as one atomic settlement operation.
 */
function AxDiagram() {
  return (
    <div className="mt-8 overflow-hidden rounded-2xl border border-cyan-300/15 bg-[#071326]/65 p-3 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <span className="text-[9px] font-bold uppercase tracking-[.18em] text-cyan-200/80">
          Two committed assets
        </span>
        <span className="rounded-full border border-cyan-300/15 bg-cyan-300/[.06] px-2.5 py-1 text-[9px] font-semibold text-cyan-100">
          Atomic exchange
        </span>
      </div>

      <svg
        viewBox="0 0 760 230"
        role="img"
        aria-label="Party A and Party B each commit an asset to Ax, which coordinates both legs as one atomic exchange."
        className="h-auto w-full"
        fill="none"
      >
        <defs>
          <linearGradient id="axLineA" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#67e8f9" />
            <stop offset="100%" stopColor="#67e8f9" stopOpacity=".35" />
          </linearGradient>
          <linearGradient id="axLineB" x1="1" y1="0" x2="0" y2="0">
            <stop offset="0%" stopColor="#6ee7b7" />
            <stop offset="100%" stopColor="#6ee7b7" stopOpacity=".35" />
          </linearGradient>
          <linearGradient id="axCore" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0891b2" stopOpacity=".22" />
            <stop offset="100%" stopColor="#10b981" stopOpacity=".18" />
          </linearGradient>
          <marker
            id="axArrowA"
            markerWidth="7"
            markerHeight="7"
            refX="5"
            refY="3.5"
            orient="auto"
          >
            <path d="M0 0 L7 3.5 L0 7" fill="#67e8f9" />
          </marker>
          <marker
            id="axArrowB"
            markerWidth="7"
            markerHeight="7"
            refX="5"
            refY="3.5"
            orient="auto"
          >
            <path d="M0 0 L7 3.5 L0 7" fill="#6ee7b7" />
          </marker>
        </defs>

        {/* Both parties commit toward Ax */}
        <path
          d="M188 78 C245 78 270 94 322 103"
          stroke="url(#axLineA)"
          strokeWidth="2"
          markerEnd="url(#axArrowA)"
        />
        <path
          d="M572 78 C515 78 490 94 438 103"
          stroke="url(#axLineB)"
          strokeWidth="2"
          markerEnd="url(#axArrowB)"
        />

        {/* Coordinated exchange paths */}
        <path
          d="M322 133 C270 151 245 166 188 166"
          stroke="#67e8f9"
          strokeOpacity=".55"
          strokeWidth="1.5"
          strokeDasharray="4 5"
        />
        <path
          d="M438 133 C490 151 515 166 572 166"
          stroke="#6ee7b7"
          strokeOpacity=".55"
          strokeWidth="1.5"
          strokeDasharray="4 5"
        />

        {/* Party A */}
        <rect
          x="18"
          y="42"
          width="170"
          height="72"
          rx="15"
          fill="#10243a"
          stroke="#67e8f9"
          strokeOpacity=".38"
        />
        <circle cx="43" cy="66" r="10" fill="#67e8f9" fillOpacity=".14" />
        <path
          d="M39 66 H47 M43 62 V70"
          stroke="#a5f3fc"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <text x="61" y="67" fill="#ffffff" fontSize="13" fontWeight="700">
          Party A
        </text>
        <text x="34" y="94" fill="#a5f3fc" fontSize="10" fontWeight="600">
          Commits Asset A
        </text>

        {/* Party B */}
        <rect
          x="572"
          y="42"
          width="170"
          height="72"
          rx="15"
          fill="#10243a"
          stroke="#6ee7b7"
          strokeOpacity=".38"
        />
        <circle cx="597" cy="66" r="10" fill="#6ee7b7" fillOpacity=".14" />
        <path
          d="M593 66 H601 M597 62 V70"
          stroke="#a7f3d0"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <text x="615" y="67" fill="#ffffff" fontSize="13" fontWeight="700">
          Party B
        </text>
        <text x="588" y="94" fill="#a7f3d0" fontSize="10" fontWeight="600">
          Commits Asset B
        </text>

        {/* Ax coordination hub */}
        <rect
          x="322"
          y="65"
          width="116"
          height="88"
          rx="18"
          fill="url(#axCore)"
          stroke="#67e8f9"
          strokeOpacity=".55"
        />
        <circle
          cx="380"
          cy="91"
          r="14"
          fill="#67e8f9"
          fillOpacity=".12"
          stroke="#67e8f9"
          strokeOpacity=".45"
        />
        <path
          d="M374 91 A6 6 0 0 1 384 87 M386 91 A6 6 0 0 1 376 95"
          stroke="#a5f3fc"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M383 84 L385 87 L381 88 M377 98 L375 95 L379 94"
          stroke="#a5f3fc"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <text
          x="380"
          y="122"
          fill="#ffffff"
          fontSize="15"
          fontWeight="800"
          textAnchor="middle"
        >
          Ax
        </text>
        <text
          x="380"
          y="137"
          fill="#a5f3fc"
          fontSize="9"
          fontWeight="600"
          textAnchor="middle"
        >
          Coordinates both legs
        </text>

        {/* Shared settlement outcome */}
        <rect
          x="220"
          y="178"
          width="320"
          height="34"
          rx="10"
          fill="#6ee7b7"
          fillOpacity=".07"
          stroke="#6ee7b7"
          strokeOpacity=".24"
        />
        <circle cx="240" cy="195" r="4" fill="#6ee7b7" />
        <text
          x="380"
          y="199"
          fill="#d1fae5"
          fontSize="11"
          fontWeight="700"
          textAnchor="middle"
        >
          One coordinated settlement outcome
        </text>
      </svg>

      <p className="mt-2 border-t border-white/[0.08] px-1 pt-3 text-center text-[10px] leading-5 text-slate-400">
        Both exchange legs are coordinated as one atomic settlement operation,
        rather than treated as unrelated transfers.
      </p>
    </div>
  );
}

export default function DevelopersPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#071326] text-[#f4f7fb]">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[var(--tl-line)] bg-[var(--tl-bg)]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3 no-underline">
            <span className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--tl-emerald)]/40 bg-[var(--tl-navy-mid)] text-xs font-black text-white shadow-[0_0_24px_rgba(16,185,129,.08)]">
              TL
            </span>
            <span className="text-lg font-bold tracking-tight text-[var(--tl-ink)]">
              TrustLayer
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/developers"
              className="hidden rounded-xl bg-[var(--tl-card)] px-3 py-2.5 text-sm font-semibold text-[var(--tl-ink)] no-underline sm:inline"
            >
              Developers
            </Link>
            <Link
              href="/login"
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[var(--tl-muted)] no-underline hover:bg-[var(--tl-card)] hover:text-[var(--tl-ink)]"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="tl-button tl-button-success no-underline"
            >
              Create a deal <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative isolate border-b border-white/[0.07]">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_78%_28%,rgba(16,185,129,.17),transparent_34%),radial-gradient(ellipse_at_10%_90%,rgba(56,189,248,.07),transparent_30%)]" />

        <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[1.02fr_.98fr] lg:gap-10 lg:py-28">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/[0.07] px-3 py-1.5 text-[11px] font-semibold text-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,.9)]" />
              Transaction trust infrastructure
            </div>

            <h1 className="mt-7 max-w-3xl text-[clamp(2.8rem,6vw,5.3rem)] font-black leading-[.99] tracking-[-0.065em] text-white">
              The infrastructure for{" "}
              <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent">
                trusted transactions.
              </span>
            </h1>

            <p className="mt-7 max-w-xl text-[17px] leading-8 text-slate-300 sm:text-lg">
              Build escrow and atomic asset exchange into your application.
              TrustLayer gives platforms and institutions the infrastructure to
              coordinate agreements, protect settlement and bring both sides of
              a transaction to a defined outcome.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/developers/quickstart"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3.5 text-sm font-extrabold text-[#05251f] no-underline shadow-[0_12px_35px_rgba(16,185,129,.16)] transition hover:-translate-y-0.5 hover:bg-emerald-300"
              >
                Explore the quickstart <ArrowRight size={16} />
              </Link>
              <Link
                href="/developers/reference"
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-5 py-3.5 text-sm font-bold text-white no-underline transition hover:border-emerald-300/40 hover:bg-white/[0.06]"
              >
                View API reference <CodeXml size={16} />
              </Link>
            </div>

            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-xs font-semibold text-slate-400">
              <span className="inline-flex items-center gap-2">
                <LockKeyhole size={14} className="text-emerald-300" />
                Non-custodial crypto flows
              </span>
              <span className="inline-flex items-center gap-2">
                <ShieldCheck size={14} className="text-emerald-300" />
                Agreement-led settlement
              </span>
              <span className="inline-flex items-center gap-2">
                <Zap size={14} className="text-emerald-300" />
                Solana live today
              </span>
            </div>
          </div>

          <HeroArtwork />
        </div>
      </section>

      {/* Infrastructure */}
      <section
        id="infrastructure"
        className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24"
      >
        <div className="max-w-2xl">
          <SectionEyebrow>The infrastructure</SectionEyebrow>
          <h2 className="mt-4 text-3xl font-black tracking-[-0.045em] text-white sm:text-4xl">
            A payment moves value. TrustLayer coordinates the agreement.
          </h2>
          <p className="mt-5 text-base leading-7 text-slate-400">
            A successful transfer does not, by itself, mean an agreement was
            fulfilled. TrustLayer adds a transaction layer for defining terms,
            coordinating asset commitments and following agreed settlement
            paths.
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <article className="group rounded-[24px] border border-emerald-300/20 bg-gradient-to-br from-emerald-300/[0.08] to-[#0b1b31] p-5 sm:p-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-200">
              <ShieldCheck size={21} />
            </div>

            <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200">
              01 · Conditional settlement
            </p>

            <h3 className="mt-2 text-2xl font-extrabold text-white">
              One-leg escrow
            </h3>

            <p className="mt-3 max-w-lg text-sm leading-7 text-slate-400">
              One party commits assets to an agreement. Settlement follows the
              conditions and resolution paths defined for that transaction.
            </p>

            <OneLegDiagram />

            <div className="mt-7 flex flex-wrap gap-2">
              {["Buyer–seller", "Services", "B2B agreements"].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-slate-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          </article>

          <article className="group rounded-[24px] border border-cyan-300/20 bg-gradient-to-br from-cyan-300/[0.07] to-[#0b1b31] p-5 sm:p-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
              <RefreshCw size={21} />
            </div>

            <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200">
              02 · Atomic exchange
            </p>

            <h3 className="mt-2 text-2xl font-extrabold text-white">
              Two-leg Ax
            </h3>

            <p className="mt-3 max-w-lg text-sm leading-7 text-slate-400">
              Two parties commit different assets to an exchange. The Ax model
              coordinates both legs for atomic settlement rather than treating
              them as unrelated transfers.
            </p>

            <AxDiagram />

            <div className="mt-7 flex flex-wrap gap-2">
              {["Asset exchange", "Stablecoins", "Digital assets"].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-slate-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          </article>
        </div>
      </section>

      {/* Audience */}
      <section
        id="solutions"
        className="border-y border-white/[0.07] bg-[#0a1a30]"
      >
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="grid items-center gap-8 lg:grid-cols-[.92fr_1.08fr] lg:gap-12">
            {/* Business photography with caption below */}
            <div>
              <div
                className="relative w-full overflow-hidden rounded-[24px] border border-white/10 bg-[#0b1b31]"
                style={{ aspectRatio: "4 / 3", minHeight: "280px" }}
              >
                <Image
                  src="/marketing/trustlayer-business-team.jpg"
                  alt="Business professionals collaborating on a shared project"
                  width={1200}
                  height={900}
                  sizes="(max-width: 1024px) 100vw, 42vw"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </div>
              <p className="mt-3 px-1 text-xs font-medium tracking-wide text-slate-400">
                Built for businesses, platforms and institutions.
              </p>
            </div>

            <div className="max-w-2xl">
              <SectionEyebrow>Who builds with TrustLayer</SectionEyebrow>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.045em] text-white sm:text-4xl">
                Integrate once. Build for the way your customers transact.
              </h2>
              <p className="mt-5 text-base leading-7 text-slate-400">
                Whether you serve consumers, businesses or institutions,
                TrustLayer provides shared transaction infrastructure you can
                integrate into your own experience.
              </p>
            </div>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {audiences.map((item) => {
              const Icon = item.icon;

              return (
                <article
                  key={item.title}
                  className="rounded-2xl border border-white/[0.08] bg-[#0c2039] p-5 transition hover:-translate-y-1 hover:border-emerald-300/25"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-300/15 bg-emerald-300/[0.07] text-emerald-200">
                    <Icon size={19} />
                  </div>
                  <h3 className="mt-5 text-base font-bold text-white">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {item.text}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Integration */}
      <section
        id="integration"
        className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24"
      >
        <div className="grid gap-12 lg:grid-cols-[.85fr_1.15fr] lg:items-start">
          <div>
            <SectionEyebrow>Build with TrustLayer</SectionEyebrow>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.045em] text-white sm:text-4xl">
              From first request to production integration.
            </h2>
            <p className="mt-5 text-base leading-7 text-slate-400">
              Use the developer resources to understand the API, connect your
              application, test your transaction flows and prepare for
              production access.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/developers/quickstart"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-extrabold text-[#05251f] no-underline hover:bg-emerald-300"
              >
                Read the quickstart <ArrowRight size={15} />
              </Link>
              <Link
                href="/developers/sandbox"
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-bold text-white no-underline hover:border-emerald-300/40"
              >
                Explore sandbox
              </Link>
            </div>

            {/* Small API/product illustration */}
            <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-[#09192c] shadow-xl">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-300" />
                  <span className="text-[10px] font-bold uppercase tracking-[.15em] text-slate-300">
                    Integration preview
                  </span>
                </div>
                <CodeXml size={15} className="text-emerald-200" />
              </div>

              <div className="space-y-2 p-4 font-mono text-[10px] leading-5 sm:text-xs">
                <p className="text-slate-500">
                  {"// Create a structured agreement"}
                </p>
                <p>
                  <span className="text-cyan-300">POST</span>{" "}
                  <span className="text-slate-200">/v1/deals</span>
                </p>

                <div className="rounded-lg border border-white/[0.07] bg-black/20 p-3 text-slate-300">
                  <p>{"{"}</p>
                  <p className="pl-4">
                    <span className="text-emerald-200">"settlement"</span>:{" "}
                    <span className="text-amber-200">"solana_escrow"</span>,
                  </p>
                  <p className="pl-4">
                    <span className="text-emerald-200">"asset"</span>:{" "}
                    <span className="text-amber-200">"USDC"</span>,
                  </p>
                  <p className="pl-4">
                    <span className="text-emerald-200">"status"</span>:{" "}
                    <span className="text-amber-200">"draft"</span>
                  </p>
                  <p>{"}"}</p>
                </div>

                <p className="flex items-center gap-2 pt-1 text-emerald-200">
                  <ShieldCheck size={13} />
                  Agreement-led transaction flow
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {steps.map(([number, title, text]) => (
              <div
                key={number}
                className="flex gap-4 rounded-2xl border border-white/[0.08] bg-[#0b1b31] p-5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] font-mono text-xs font-bold text-emerald-200">
                  {number}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white">{title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-slate-400">
                    {text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Resources */}
      <section className="border-y border-white/[0.07] bg-[#0a1a30]">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <SectionEyebrow>Developer resources</SectionEyebrow>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] text-white">
                Everything you need to integrate.
              </h2>
            </div>
            <Link
              href="/developers/quickstart"
              className="inline-flex items-center gap-2 text-sm font-bold text-emerald-200 no-underline hover:text-emerald-100"
            >
              Browse documentation <ArrowRight size={15} />
            </Link>
          </div>

          <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link
              href="/developers/quickstart"
              className="rounded-2xl border border-white/[0.08] bg-[#0c2039] p-5 no-underline transition hover:border-emerald-300/30"
            >
              <Code2 className="text-emerald-200" size={20} />
              <h3 className="mt-4 text-sm font-bold text-white">
                Quickstart guides
              </h3>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Get familiar with the integration flow.
              </p>
            </Link>

            <Link
              href="/developers/reference"
              className="rounded-2xl border border-white/[0.08] bg-[#0c2039] p-5 no-underline transition hover:border-emerald-300/30"
            >
              <Layers3 className="text-emerald-200" size={20} />
              <h3 className="mt-4 text-sm font-bold text-white">API reference</h3>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Explore endpoints, parameters and responses.
              </p>
            </Link>

            <Link
              href="/developers/webhooks"
              className="rounded-2xl border border-white/[0.08] bg-[#0c2039] p-5 no-underline transition hover:border-emerald-300/30"
            >
              <Webhook className="text-emerald-200" size={20} />
              <h3 className="mt-4 text-sm font-bold text-white">
                Webhooks & events
              </h3>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                React to transaction and integration events.
              </p>
            </Link>

            <Link
              href="/developers/sandbox"
              className="rounded-2xl border border-white/[0.08] bg-[#0c2039] p-5 no-underline transition hover:border-emerald-300/30"
            >
              <CodeXml className="text-emerald-200" size={20} />
              <h3 className="mt-4 text-sm font-bold text-white">Sandbox</h3>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Explore simulated scenarios and test flows.
              </p>
            </Link>
          </div>
        </div>
      </section>

      {/* Availability */}
      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="rounded-[26px] border border-white/[0.09] bg-gradient-to-br from-[#102943] via-[#0b1d33] to-[#0a192c] p-6 sm:p-9">
          <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <SectionEyebrow>Availability</SectionEyebrow>
              <h2 className="mt-4 text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl">
                Live on Solana. Building toward fiat.
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-400">
                Crypto escrow and Ax are currently available on Solana for
                supported assets and transaction flows. Fiat settlement is in
                development, with the non-custodial model being shaped
                alongside a BaaS partner.
              </p>
            </div>

            <div className="grid min-w-[220px] gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="flex items-center gap-3 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] px-4 py-3">
                <span className="h-2 w-2 rounded-full bg-emerald-300" />
                <div>
                  <p className="text-xs font-bold text-emerald-100">
                    Crypto · Solana
                  </p>
                  <p className="text-[10px] text-emerald-200/70">Live</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-amber-200/15 bg-amber-200/[0.05] px-4 py-3">
                <span className="h-2 w-2 rounded-full bg-amber-200" />
                <div>
                  <p className="text-xs font-bold text-amber-100">
                    Fiat settlement
                  </p>
                  <p className="text-[10px] text-amber-100/60">
                    In development
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-5 pb-20 sm:px-8 sm:pb-24">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200">
            <Network size={22} />
          </div>

          <h2 className="mt-6 text-3xl font-black tracking-[-0.05em] text-white sm:text-5xl">
            Build trusted transactions into what&apos;s next.
          </h2>

          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-slate-400">
            Explore the integration resources, learn how the transaction
            models work and connect with the TrustLayer team about developer
            access.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/developers/quickstart"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3.5 text-sm font-extrabold text-[#05251f] no-underline hover:bg-emerald-300"
            >
              Start with the docs <ArrowRight size={16} />
            </Link>
            <Link
              href="/support"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-3.5 text-sm font-bold text-white no-underline hover:border-emerald-300/40"
            >
              Talk to TrustLayer
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

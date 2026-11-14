import Link from "next/link";

export default function TrustLayerFooter() {
  return (
    <footer className="mt-auto border-t border-[var(--tl-line)] bg-[var(--tl-bg)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">

        {/* Left Side: Brand Block */}
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--tl-line)] bg-[var(--tl-card)] text-[10px] font-black text-[var(--tl-ink)]">
            TL
          </span>
          <div>
            <p className="text-sm font-bold text-[var(--tl-ink)]">TrustLayer</p>
            <p className="text-[11px] text-[var(--tl-muted)]">
              Agreement-first · Non-custodial crypto
            </p>
          </div>
        </div>

        {/* Center Section: Social SVG Icons */}
        <div className="flex items-center gap-4 sm:mx-auto">
          {/* X (Twitter) Icon */}
          <a
            href="https://x.com/TLayerHQ"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--tl-muted)] transition-colors duration-200 hover:text-[var(--tl-emerald)]"
            aria-label="X (formerly Twitter)"
          >
            <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>

          {/* Telegram Icon */}
          <a
            href="https://t.me/+emII4zsfW9c2ZTlk"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--tl-muted)] transition-colors duration-200 hover:text-[var(--tl-emerald)]"
            aria-label="Telegram"
          >
            <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-1-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.02-1.96 1.24-5.54 3.65-.52.36-1 .53-1.42.52-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.42-.88.03-.24.35-.49.96-.75 3.78-1.64 6.29-2.72 7.54-3.25 3.59-1.48 4.33-1.74 4.82-1.75.11 0 .35.03.5.16.13.11.17.26.18.37 0 .09-.01.25-.02.32z" />
            </svg>
          </a>
        </div>

        {/* Right Side: Page Navigation Links */}
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/faq" className="text-[var(--tl-muted)] no-underline hover:text-[var(--tl-emerald)]">
            FAQ
          </Link>
          <Link href="/support" className="text-[var(--tl-muted)] no-underline hover:text-[var(--tl-emerald)]">
            Support
          </Link>
          <Link href="/legal/terms" className="text-[var(--tl-muted)] no-underline hover:text-[var(--tl-emerald)]">
            Terms
          </Link>
          <Link href="/legal/privacy" className="text-[var(--tl-muted)] no-underline hover:text-[var(--tl-emerald)]">
            Privacy
          </Link>
        </nav>
      </div>

      <div className="border-t border-[var(--tl-line)] px-4 py-3 text-center text-[11px] text-[var(--tl-muted)]">
        © {new Date().getFullYear()} TrustLayer
      </div>
    </footer>
  );
}

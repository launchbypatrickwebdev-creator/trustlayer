"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { ChevronDown, HelpCircle, Search } from "lucide-react";
import { FAQS, getCommonFaqs } from "@/lib/help/faqs";

type Ctx = {
  query: string;
  setQuery: (v: string) => void;
};

const SupportSearchCtx = createContext<Ctx | null>(null);

export function SupportSearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  return (
    <SupportSearchCtx.Provider value={{ query, setQuery }}>
      {children}
    </SupportSearchCtx.Provider>
  );
}

function useSupportSearch() {
  const ctx = useContext(SupportSearchCtx);
  if (!ctx) {
    throw new Error("SupportSearchProvider required");
  }
  return ctx;
}

export function SupportSearchInput() {
  const { query, setQuery } = useSupportSearch();
  return (
    <div className="relative mt-4">
      <Search
        size={16}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--tl-muted)]"
      />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search help articles, FAQs, or topics…"
        className="w-full rounded-xl border border-[var(--tl-line)] bg-[var(--tl-bg-elevated)] py-3 pl-10 pr-4 text-sm text-[var(--tl-ink)] outline-none placeholder:text-[var(--tl-muted)] focus:border-[var(--tl-emerald)]/40"
        autoComplete="off"
      />
    </div>
  );
}

export function SupportCommonList() {
  const { query } = useSupportSearch();
  const [open, setOpen] = useState<string | null>(null);

  const searching = query.trim().length > 0;

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return getCommonFaqs();

    const terms = q.split(/\s+/).filter(Boolean);
    return FAQS.filter((item) => {
      const hay = `${item.q} ${item.a}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [query]);

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-[var(--tl-ink)]">
          {searching ? "Search results" : "Common questions"}
        </h2>
        <Link
          href="/faq"
          className="text-xs font-bold text-[var(--tl-emerald)] no-underline hover:underline"
        >
          View all →
        </Link>
      </div>

      {searching && (
        <p className="mt-1 text-xs text-[var(--tl-muted)]">
          {items.length} match{items.length === 1 ? "" : "es"} for “
          {query.trim()}”
        </p>
      )}

      <ul className="mt-3 overflow-hidden rounded-[18px] border border-[var(--tl-line)] bg-[var(--tl-card)]">
        {items.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-[var(--tl-muted)]">
            No matches. Try another term or{" "}
            <Link
              href="/faq"
              className="font-semibold text-[var(--tl-emerald)] no-underline hover:underline"
            >
              view all FAQs
            </Link>
            .
          </li>
        ) : (
          items.map((item) => {
            const isOpen = open === item.id;
            return (
              <li
                key={item.id}
                className="border-b border-[var(--tl-line)]/80 last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : item.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-medium text-[var(--tl-ink)] transition hover:bg-white/[.02]"
                  aria-expanded={isOpen}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <HelpCircle
                      size={16}
                      className="shrink-0 text-[var(--tl-muted)]"
                    />
                    <span>{item.q}</span>
                  </span>
                  <ChevronDown
                    size={16}
                    className={`shrink-0 text-[var(--tl-muted)] transition ${
                      isOpen ? "rotate-180 text-[var(--tl-emerald)]" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="border-t border-[var(--tl-line)]/60 px-4 pb-4">
                    <p className="pl-[26px] pt-3 text-sm leading-6 text-[var(--tl-muted)]">
                      {item.a}
                    </p>
                  </div>
                )}
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
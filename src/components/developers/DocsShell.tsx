import type { ReactNode } from "react";

/** Content frame only — outer DevelopersShell owns sidebar. */
export default function DocsShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl pb-16">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-400/90">
        Partner API
      </p>
      <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-4 text-sm leading-7 text-slate-400">{subtitle}</p>
      ) : null}
      <div className="mt-8 space-y-5 text-sm leading-7 text-slate-300">
        {children}
      </div>
    </article>
  );
}

export function Code({ children }: { children: string }) {
  return (
    <pre className="my-4 overflow-x-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-emerald-100">
      <code>{children}</code>
    </pre>
  );
}

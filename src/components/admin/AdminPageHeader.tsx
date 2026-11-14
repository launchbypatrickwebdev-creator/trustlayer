import type { ReactNode } from "react";
import PageBackLink from "@/components/layout/PageBackLink";

/** Sub-page title block inside AdminShell column 2 */
export default function AdminPageHeader({
  title,
  description,
  backHref = "/admin",
  backLabel = "Back to admin",
  actions,
  eyebrow,
  showBack = true,
}: {
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
  eyebrow?: string;
  showBack?: boolean;
}) {
  return (
    <header className="mb-8">
      {showBack ? <PageBackLink href={backHref} label={backLabel} /> : null}
      {eyebrow ? (
        <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--tl-emerald,#10b981)]">
          {eyebrow}
        </p>
      ) : null}
      <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-black tracking-tight text-[var(--tl-ink)]">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--tl-muted)]">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}

export function AdminPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-[var(--tl-line)] bg-[var(--tl-card,#071a2d)] ${className}`}
    >
      {children}
    </div>
  );
}

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
export default function PageBackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--tl-muted)] no-underline hover:text-[var(--tl-ink)]">
      <ArrowLeft size={16} />
      {label}
    </Link>
  );
}

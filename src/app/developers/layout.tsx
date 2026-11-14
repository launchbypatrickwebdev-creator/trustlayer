import type { ReactNode } from "react";
import DevelopersShell from "@/components/developers/DevelopersShell";

export default function DevelopersLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <DevelopersShell>{children}</DevelopersShell>;
}

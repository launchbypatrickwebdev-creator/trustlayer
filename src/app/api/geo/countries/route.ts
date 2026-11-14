import { NextResponse } from "next/server";
import { FALLBACK_COUNTRIES } from "@/lib/geo/fallback-countries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(
      "https://restcountries.com/v3.1/all?fields=name,cca2",
      { signal: controller.signal, next: { revalidate: 86400 } }
    );
    clearTimeout(t);
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    const rows = (await r.json()) as Array<{
      cca2: string;
      name: { common: string };
    }>;
    const list = rows
      .map((x) => ({ code: x.cca2, name: x.name.common }))
      .filter((x) => x.code && x.name)
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ countries: list, source: "restcountries" });
  } catch {
    return NextResponse.json({
      countries: FALLBACK_COUNTRIES,
      source: "fallback",
    });
  }
}

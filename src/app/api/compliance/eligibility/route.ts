import { NextResponse } from "next/server";
import { getFinancialEligibility } from "@/lib/domain/financial-eligibility";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rail = url.searchParams.get("rail") === "crypto" ? "crypto" : "fiat";
    const currency = (url.searchParams.get("currency") || (rail === "fiat" ? "NGN" : "SOL")).toUpperCase();
    const eligibility = await getFinancialEligibility(currency, rail);
    return NextResponse.json({ eligibility });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load eligibility.";
    return NextResponse.json({ error: message }, { status: message === "Authentication required." ? 401 : 500 });
  }
}

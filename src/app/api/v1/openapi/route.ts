import { NextResponse } from "next/server";
import { openApiDocument } from "@/lib/api/openapi-spec";

export async function GET() {
  return NextResponse.json(openApiDocument);
}

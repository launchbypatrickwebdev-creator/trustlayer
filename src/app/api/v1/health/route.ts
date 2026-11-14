import { NextResponse } from "next/server";
import { newRequestId } from "@/lib/api/request-id";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "trustlayer-partner-api",
    version: "v1",
    request_id: newRequestId(),
  });
}

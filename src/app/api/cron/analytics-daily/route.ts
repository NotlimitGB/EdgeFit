import { NextResponse } from "next/server";
import { handleAnalyticsCronRequest } from "@/lib/analytics/delivery-server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const { httpStatus, result } = await handleAnalyticsCronRequest("daily", request);
  return NextResponse.json(result, {
    status: httpStatus,
    headers: { "Cache-Control": "no-store" },
  });
}

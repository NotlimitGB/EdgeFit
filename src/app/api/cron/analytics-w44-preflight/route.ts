import { NextResponse } from "next/server";
import { preflightW44 } from "@/lib/analytics/w44-preflight";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const result = await preflightW44(request.headers.get("authorization"));
  return NextResponse.json(result.body, { status: result.httpStatus, headers: { "Cache-Control": "no-store" } });
}

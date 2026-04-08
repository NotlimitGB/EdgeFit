import { NextResponse } from "next/server";
import {
  getInternalAccessCookieOptions,
  INTERNAL_ACCESS_COOKIE,
} from "@/lib/internal/access";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({
    message: "Вы вышли из внутренней части проекта.",
  });

  response.cookies.set(INTERNAL_ACCESS_COOKIE, "", {
    ...getInternalAccessCookieOptions(),
    maxAge: 0,
  });

  return response;
}

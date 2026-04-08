import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  INTERNAL_ACCESS_COOKIE,
  INTERNAL_LOGIN_PATH,
  isInternalAccessConfigured,
  isValidInternalAccessToken,
  normalizeInternalNextPath,
} from "@/lib/internal/access";

function isProtectedInternalPage(pathname: string) {
  return pathname.startsWith("/internal") && pathname !== INTERNAL_LOGIN_PATH;
}

function isProtectedInternalApi(pathname: string) {
  return pathname.startsWith("/api/internal") || pathname === "/api/catalog-import";
}

function createLoginRedirect(request: NextRequest, reason?: "config") {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = INTERNAL_LOGIN_PATH;

  const nextPath = normalizeInternalNextPath(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );

  loginUrl.searchParams.set("next", nextPath);

  if (reason) {
    loginUrl.searchParams.set("reason", reason);
  }

  return NextResponse.redirect(loginUrl);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtectedInternalPage(pathname) && !isProtectedInternalApi(pathname)) {
    return NextResponse.next();
  }

  if (!isInternalAccessConfigured()) {
    if (isProtectedInternalApi(pathname)) {
      return NextResponse.json(
        {
          message:
            "Внутренний доступ не настроен. Добавьте INTERNAL_ACCESS_PASSWORD в .env.local.",
        },
        { status: 500 },
      );
    }

    return createLoginRedirect(request, "config");
  }

  const token = request.cookies.get(INTERNAL_ACCESS_COOKIE)?.value;
  const hasAccess = await isValidInternalAccessToken(token);

  if (hasAccess) {
    return NextResponse.next();
  }

  if (isProtectedInternalApi(pathname)) {
    return NextResponse.json(
      {
        message: "Сначала войдите во внутреннюю часть проекта.",
      },
      { status: 401 },
    );
  }

  return createLoginRedirect(request);
}

export const config = {
  matcher: ["/internal/:path*", "/api/internal/:path*", "/api/catalog-import"],
};

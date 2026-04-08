import { NextResponse } from "next/server";
import {
  createInternalAccessToken,
  getInternalAccessCookieOptions,
  INTERNAL_ACCESS_COOKIE,
  isInternalAccessConfigured,
  normalizeInternalNextPath,
} from "@/lib/internal/access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!isInternalAccessConfigured()) {
      return NextResponse.json(
        {
          message:
            "Внутренний доступ не настроен. Добавьте INTERNAL_ACCESS_PASSWORD в .env.local.",
        },
        { status: 500 },
      );
    }

    const payload = (await request.json()) as {
      password?: string;
      nextPath?: string;
    };

    const password = String(payload.password ?? "").trim();
    const nextPath = normalizeInternalNextPath(payload.nextPath);

    if (!password) {
      return NextResponse.json(
        {
          message: "Введите пароль для входа.",
        },
        { status: 400 },
      );
    }

    if (password !== process.env.INTERNAL_ACCESS_PASSWORD?.trim()) {
      return NextResponse.json(
        {
          message: "Неверный пароль.",
        },
        { status: 401 },
      );
    }

    const response = NextResponse.json({
      message: "Вход выполнен.",
      redirectTo: nextPath,
    });

    response.cookies.set(
      INTERNAL_ACCESS_COOKIE,
      await createInternalAccessToken(),
      getInternalAccessCookieOptions(),
    );

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Не удалось выполнить вход.",
      },
      { status: 400 },
    );
  }
}

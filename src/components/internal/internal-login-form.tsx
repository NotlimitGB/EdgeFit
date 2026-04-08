"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import { useMemo, useState, useTransition } from "react";

interface LoginResponse {
  message: string;
  redirectTo?: string;
}

export function InternalLoginForm({ isConfigured }: { isConfigured: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const nextPath = useMemo(() => {
    const rawNext = searchParams.get("next");
    return rawNext && rawNext.startsWith("/internal") ? rawNext : "/internal/catalog";
  }, [searchParams]);

  const reason = searchParams.get("reason");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isConfigured) {
      setErrorMessage(
        "Сначала задайте INTERNAL_ACCESS_PASSWORD в .env.local и перезапустите проект.",
      );
      return;
    }

    startTransition(async () => {
      try {
        setErrorMessage("");

        const response = await fetch("/api/internal-auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            password,
            nextPath,
          }),
        });
        const payload = (await response.json()) as LoginResponse;

        if (!response.ok) {
          throw new Error(payload.message || "Не удалось выполнить вход.");
        }

        router.replace(payload.redirectTo || nextPath);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Не удалось выполнить вход.",
        );
      }
    });
  }

  return (
    <div className="container-shell py-12 sm:py-16">
      <section className="panel mx-auto max-w-2xl p-8 sm:p-10">
        <span className="eyebrow">Внутренний доступ</span>
        <h1 className="heading-display mt-4 text-4xl font-bold sm:text-5xl">
          Вход во внутреннюю часть проекта
        </h1>
        <p className="mt-4 text-base leading-8 text-[var(--color-muted)] sm:text-lg">
          Внутренние страницы EdgeFit закрыты паролем. После входа откроются
          редактор каталога и загрузка через таблицы.
        </p>

        {reason === "config" ? (
          <div className="mt-6 rounded-[1.4rem] border border-[rgba(173,62,55,0.18)] bg-[rgba(173,62,55,0.08)] px-5 py-4 text-sm leading-7 text-[var(--color-danger)]">
            Внутренний пароль ещё не настроен. Добавьте `INTERNAL_ACCESS_PASSWORD`
            в `.env.local`, затем перезапустите проект.
          </div>
        ) : null}

        {!isConfigured ? (
          <div className="mt-6 rounded-[1.4rem] border border-[var(--color-border)] bg-[var(--color-paper-soft)] px-5 py-4 text-sm leading-7 text-[var(--color-muted)]">
            Для включения доступа задайте в `.env.local` минимум одну переменную:
            `INTERNAL_ACCESS_PASSWORD`.
          </div>
        ) : null}

        <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">Пароль</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Введите пароль"
              className="w-full rounded-[1.2rem] border border-[var(--color-border)] bg-white px-4 py-4 outline-none focus:border-[var(--color-sky)]"
            />
          </label>

          {errorMessage ? (
            <div className="rounded-[1.4rem] border border-[rgba(173,62,55,0.18)] bg-[rgba(173,62,55,0.08)] px-5 py-4 text-sm leading-7 text-[var(--color-danger)]">
              {errorMessage}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="submit"
              disabled={isPending || !isConfigured}
              className="inline-flex items-center justify-center rounded-full bg-[var(--color-pine)] px-6 py-4 text-sm font-bold text-white hover:-translate-y-0.5 hover:bg-[var(--color-sky-deep)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Проверяем..." : "Войти"}
            </button>

            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-white px-5 py-4 text-sm font-bold text-[var(--color-pine)] hover:border-[var(--color-sky)]"
            >
              На главную
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}

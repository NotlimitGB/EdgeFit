"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const links = [
  { href: "/internal/catalog", label: "Редактор каталога" },
  { href: "/internal/import", label: "Импорт таблиц" },
];

export function InternalAuthBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      try {
        setErrorMessage("");

        const response = await fetch("/api/internal-auth/logout", {
          method: "POST",
        });

        if (!response.ok) {
          throw new Error("Не удалось завершить сеанс.");
        }

        router.replace("/internal/login");
        router.refresh();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Не удалось завершить сеанс.",
        );
      }
    });
  }

  return (
    <div className="mb-6 rounded-[1.4rem] border border-[var(--color-border)] bg-white/82 px-4 py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {links.map((link) => {
            const active = pathname === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`inline-flex items-center justify-center rounded-full px-4 py-3 text-sm font-bold ${
                  active
                    ? "bg-[var(--color-pine)] text-white"
                    : "border border-[var(--color-border)] bg-white text-[var(--color-pine)] hover:border-[var(--color-sky)]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleLogout}
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-full border border-[rgba(173,62,55,0.16)] bg-[rgba(173,62,55,0.06)] px-4 py-3 text-sm font-bold text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Выходим..." : "Выйти"}
        </button>
      </div>

      {errorMessage ? (
        <p className="mt-3 text-sm leading-7 text-[var(--color-danger)]">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

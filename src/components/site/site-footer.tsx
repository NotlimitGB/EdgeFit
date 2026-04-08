import Link from "next/link";
import { getSeoLandingPath, seoLandingPages } from "@/lib/seo-pages";

const serviceLinks = [
  { href: "/privacy", label: "Политика конфиденциальности" },
  { href: "/terms", label: "Условия использования" },
  { href: "/contact", label: "Контакты" },
  { href: "/about", label: "О проекте" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--color-border)] bg-[rgba(255,255,255,0.78)] backdrop-blur-xl">
      <div className="container-shell grid gap-8 py-10 lg:grid-cols-[1.1fr_0.9fr_0.9fr]">
        <div className="max-w-2xl space-y-2 text-sm text-[var(--color-muted)]">
          <p className="heading-display text-lg font-bold text-[var(--color-ink)]">
            EdgeFit
          </p>
          <p className="text-pretty">
            MVP-версия сервиса помогает быстро понять рабочую длину, ширину и
            риск зацепа ботинком перед покупкой сноуборда.
          </p>
        </div>

        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--color-sky-deep)]">
            Полезные страницы
          </p>
          <div className="mt-4 grid gap-3 text-sm text-[var(--color-muted)]">
            {seoLandingPages.map((page) => (
              <Link
                key={page.slug}
                href={getSeoLandingPath(page.slug)}
                className="hover:text-[var(--color-sky-deep)]"
              >
                {page.shortTitle}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--color-sky-deep)]">
            Служебные страницы
          </p>
          <div className="mt-4 grid gap-3 text-sm text-[var(--color-muted)]">
            {serviceLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="hover:text-[var(--color-sky-deep)]"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

import Link from "next/link";

const links = [
  { href: "/", label: "Главная" },
  { href: "/quiz", label: "Квиз" },
  { href: "/catalog", label: "Каталог" },
  { href: "/about", label: "О проекте" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[rgba(247,251,253,0.82)] backdrop-blur-xl">
      <div className="container-shell flex items-center justify-between gap-2 py-3 sm:gap-4 sm:py-4">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-sky-deep)] focus-visible:ring-offset-2"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--color-sky-deep),var(--color-sky))] text-sm font-extrabold uppercase tracking-[0.22em] text-white shadow-[0_10px_25px_rgba(32,89,119,0.22)] sm:h-11 sm:w-11 sm:rounded-2xl">
            EF
          </div>
          <div className="min-w-0">
            <p className="heading-display text-lg font-bold">EdgeFit</p>
            <p className="hidden text-sm text-[var(--color-muted)] sm:block">
              Подбор сноуборда без догадок
            </p>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 lg:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-semibold text-[var(--color-muted)] hover:text-[var(--color-sky-deep)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <Link
          href="/quiz"
          className="inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-xl bg-[var(--color-pine)] px-3 py-2 text-xs font-bold text-white hover:-translate-y-0.5 hover:bg-[var(--color-sky-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-sky-deep)] focus-visible:ring-offset-2 motion-reduce:transform-none sm:rounded-full sm:px-5 sm:py-3 sm:text-sm"
        >
          <span className="sm:hidden">Подобрать</span>
          <span className="hidden sm:inline">Подобрать доску</span>
        </Link>
      </div>
    </header>
  );
}

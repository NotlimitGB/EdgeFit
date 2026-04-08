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
      <div className="container-shell flex items-center justify-between gap-4 py-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--color-sky-deep),var(--color-sky))] text-sm font-extrabold uppercase tracking-[0.22em] text-white shadow-[0_10px_25px_rgba(32,89,119,0.22)]">
            EF
          </div>
          <div>
            <p className="heading-display text-lg font-bold">EdgeFit</p>
            <p className="text-sm text-[var(--color-muted)]">
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
          className="inline-flex items-center justify-center rounded-full bg-[var(--color-pine)] px-5 py-3 text-sm font-bold text-white hover:-translate-y-0.5 hover:bg-[var(--color-sky-deep)]"
        >
          Подобрать доску
        </Link>
      </div>
    </header>
  );
}

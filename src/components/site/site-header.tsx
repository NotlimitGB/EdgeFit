import Link from "next/link";
import { CatalogEntryLink } from "@/components/catalog/catalog-entry-link";
import styles from "./site-shell.module.css";

const links = [
  { href: "/", label: "Главная" },
  { href: "/catalog", label: "Каталог" },
  { href: "/about", label: "О SnowDex" },
];

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <a className={styles.skipLink} href="#main-content">К содержанию</a>
      <div className={`container-shell ${styles.headerInner}`}>
        <Link href="/" className={styles.brand} aria-label="SnowDex — главная">
          <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
            <path d="M3 25 12 7l5 10 4-7 8 15H3Z" fill="currentColor" />
            <path d="m9 20 3-6 3 6h-6Zm10 0 2-4 2 4h-4Z" fill="white" />
          </svg>
          <span>SnowDex<span className={styles.brandDot}>.</span></span>
        </Link>
        <nav className={styles.desktopNav} aria-label="Основная навигация">
          {links.map((link) => (
            link.href === "/catalog" ? <CatalogEntryLink key={link.href}>{link.label}</CatalogEntryLink>
              : <Link key={link.href} href={link.href}>{link.label}</Link>
          ))}
        </nav>
        <Link href="/quiz" className={styles.headerAction}>Подобрать доску <span aria-hidden="true">→</span></Link>
        <details className={styles.mobileMenu}>
          <summary aria-label="Открыть навигацию">Меню <span aria-hidden="true">☰</span></summary>
          <nav aria-label="Мобильная навигация">
            {links.map((link) => link.href === "/catalog"
              ? <CatalogEntryLink key={link.href}>{link.label}</CatalogEntryLink>
              : <Link key={link.href} href={link.href}>{link.label}</Link>)}
            <Link href="/quiz">Подбор сноуборда</Link>
          </nav>
        </details>
      </div>
    </header>
  );
}

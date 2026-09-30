import Link from "next/link";
import { getSeoLandingPath, seoLandingPages } from "@/lib/seo-pages";
import styles from "./site-shell.module.css";

const serviceLinks = [
  { href: "/privacy", label: "Политика конфиденциальности" },
  { href: "/terms", label: "Условия использования" },
  { href: "/contact", label: "Контакты" },
  { href: "/about", label: "О проекте" },
];

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`container-shell ${styles.footerInner}`}>
        <div>
          <p className={styles.footerTitle}>
            SnowDex.
          </p>
          <p className={styles.footerCopy}>
            Разобраться в снаряжении. Выбрать осознанно. Сегодня — подбор и сравнение сноубордов.
          </p>
        </div>

        <div>
          <p className={styles.footerHeading}>
            Полезные страницы
          </p>
          <div className={styles.footerLinks}>
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
          <p className={styles.footerHeading}>
            Служебные страницы
          </p>
          <div className={styles.footerLinks}>
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
        <p className={styles.footerNote}>Рекомендация помогает сузить выбор. Геометрию, цену и наличие выбранной ростовки проверь у продавца.</p>
      </div>
    </footer>
  );
}

import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { CatalogView } from "@/components/catalog/catalog-view";
import publicStyles from "@/components/public/public-ui.module.css";
import { getPublicCanonicalCatalogItems } from "@/lib/public-catalog-cache";
import styles from "@/components/catalog/catalog.module.css";

export const metadata: Metadata = {
  title: "Каталог сноубордов",
  alternates: { canonical: "/catalog" },
  description:
    "Живой каталог сноубордов SnowDex с фильтрами по бренду, стилю, форме и ширине, плюс простой сортировкой по цене.",
};

export default async function CatalogPage() {
  // Render only after a request; data caching remains in the public loader.
  await connection();
  const boards = await getPublicCanonicalCatalogItems();

  return (
    <div className={`${publicStyles.theme} ${styles.catalogPage}`}>
      <div className={styles.atmosphere} aria-hidden="true" />

      <div className={`container-shell ${styles.catalogShell}`}>
        <section className={styles.hero} aria-labelledby="catalog-title">
          <div className={styles.heroCopy}>
            <p className={publicStyles.kicker}>SnowDex / сноуборды</p>
            <h1 id="catalog-title" className={styles.heroTitle}>
              Сноуборды и их характеристики
            </h1>
            <p className={styles.heroLead}>
              Найди модели по бренду, стилю катания и ширине. На странице
              каждой доски можно изучить размеры, геометрию и цены из каталога.
              Для выбора под твои параметры пройди подбор.
            </p>
            <Link
              href="/quiz"
              className={`${publicStyles.secondaryAction} ${styles.heroAction}`}
            >
              Подобрать сноуборд
            </Link>
          </div>

          <aside className={styles.heroGuide} aria-label="Как читать каталог">
            <p className={publicStyles.microLabel}>
              На что смотреть при выборе
            </p>
            <dl className={styles.heroGuideList}>
              <div>
                <dt>Геометрия</dt>
                <dd>Форма, прогиб и варианты ширины</dd>
              </div>
              <div>
                <dt>Наличие</dt>
                <dd>Размеры, отмеченные доступными в данных каталога</dd>
              </div>
              <div>
                <dt>Подбор под тебя</dt>
                <dd>Подходящая ростовка и ширина — после квиза</dd>
              </div>
            </dl>
          </aside>
        </section>

        <CatalogView boards={boards} />
      </div>
    </div>
  );
}

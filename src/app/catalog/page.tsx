import type { Metadata } from "next";
import Link from "next/link";
import { CatalogView } from "@/components/catalog/catalog-view";
import publicStyles from "@/components/public/public-ui.module.css";
import { getPublicCanonicalCatalogItems } from "@/lib/public-catalog-cache";
import styles from "@/components/catalog/catalog.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Каталог сноубордов",
  description:
    "Живой каталог сноубордов EdgeFit с фильтрами по бренду, стилю, форме и ширине, плюс простой сортировкой по цене.",
};

export default async function CatalogPage() {
  const boards = await getPublicCanonicalCatalogItems();

  return (
    <div className={`${publicStyles.theme} ${styles.catalogPage}`}>
      <div className={styles.atmosphere} aria-hidden="true" />

      <div className={`container-shell ${styles.catalogShell}`}>
        <section className={styles.hero} aria-labelledby="catalog-title">
          <div className={styles.heroCopy}>
            <p className={publicStyles.kicker}>EdgeFit / каталог</p>
            <h1 id="catalog-title" className={styles.heroTitle}>
              Сравни модели по характеристикам и стилю катания
            </h1>
            <p className={styles.heroLead}>
              Фильтруй модели по стилю, форме и ширине, сравнивай
              характеристики, данные о доступности и ориентир цены. Каталог
              показывает данные досок, а персональную рекомендацию можно
              получить в квизе.
            </p>
            <Link
              href="/quiz"
              className={`${publicStyles.secondaryAction} ${styles.heroAction}`}
            >
              Подобрать под себя
            </Link>
          </div>

          <aside className={styles.heroGuide} aria-label="Как читать каталог">
            <p className={publicStyles.microLabel}>
              Каталог показывает модели, квиз подбирает под тебя
            </p>
            <dl className={styles.heroGuideList}>
              <div>
                <dt>Геометрия</dt>
                <dd>Форма, прогиб и варианты ширины</dd>
              </div>
              <div>
                <dt>Наличие</dt>
                <dd>Размеры, отмеченные доступными в данных EdgeFit</dd>
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

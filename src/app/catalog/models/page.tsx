import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound, permanentRedirect } from "next/navigation";
import publicStyles from "@/components/public/public-ui.module.css";
import { базаНастроена } from "@/lib/database/config";
import {
  getCanonicalModelDirectoryPage,
  parseCanonicalModelDirectoryPageParam,
  sortCanonicalModelDirectoryEntries,
} from "@/lib/canonical-model-directory";
import { getPublicCanonicalCatalogItems } from "@/lib/public-catalog-cache";
import styles from "./models-directory.module.css";

interface ModelsDirectoryPageProps {
  searchParams: Promise<{ page?: string | string[] }>;
}

function getCanonicalPath(page: number) {
  return page === 1 ? "/catalog/models" : `/catalog/models?page=${page}`;
}

export async function generateMetadata({
  searchParams,
}: ModelsDirectoryPageProps): Promise<Metadata> {
  const { page: rawPage } = await searchParams;
  const parsed = parseCanonicalModelDirectoryPageParam(rawPage);

  return {
    title: "Все модели сноубордов",
    description: "Алфавитный список моделей сноубордов SnowDex с переходами на страницы характеристик.",
    ...(parsed.kind === "invalid"
      ? {}
      : { alternates: { canonical: getCanonicalPath(parsed.kind === "page" ? parsed.page : 1) } }),
  };
}

export default async function ModelsDirectoryPage({
  searchParams,
}: ModelsDirectoryPageProps) {
  await connection();

  const { page: rawPage } = await searchParams;
  const parsed = parseCanonicalModelDirectoryPageParam(rawPage);

  if (parsed.kind === "redirect-first") {
    permanentRedirect("/catalog/models");
  }

  if (parsed.kind === "invalid") {
    notFound();
  }

  if (!базаНастроена()) {
    throw new Error("Public model directory is unavailable");
  }

  const publicItems = await getPublicCanonicalCatalogItems();
  const sortedItems = sortCanonicalModelDirectoryEntries(publicItems);
  const directoryPage = getCanonicalModelDirectoryPage(sortedItems, parsed.page);

  if (parsed.page > directoryPage.pageCount) {
    notFound();
  }

  const firstModelNumber = directoryPage.totalCount === 0 ? 0 : directoryPage.startIndex + 1;
  const lastModelNumber = directoryPage.startIndex + directoryPage.entries.length;

  return (
    <div className={`${publicStyles.theme} ${styles.directoryPage}`}>
      <div className={`container-shell ${styles.directoryShell}`}>
        <nav className={styles.breadcrumb} aria-label="Навигация по каталогу">
          <Link href="/catalog" prefetch={false}>← К фильтрам каталога</Link>
        </nav>

        <header className={styles.header}>
          <p className={publicStyles.kicker}>SnowDex / каталог</p>
          <h1 className={styles.title}>Модели сноубордов</h1>
          <p className={styles.intro}>
            Список отсортирован по бренду, модели и сезону. Открой страницу доски,
            чтобы посмотреть её характеристики.
          </p>
          <p className={styles.count}>
            {directoryPage.totalCount === 0
              ? "В каталоге пока нет моделей"
              : `Модели ${firstModelNumber}–${lastModelNumber} из ${directoryPage.totalCount}`}
          </p>
        </header>

        {directoryPage.entries.length > 0 ? (
          <ol className={styles.modelList}>
            {directoryPage.entries.map((entry) => (
              <li key={entry.slug}>
                <Link href={`/boards/${encodeURIComponent(entry.slug)}`} prefetch={false}>
                  <span className={styles.modelIdentity}>
                    <span className={styles.brand}>{entry.brand}</span>
                    <span className={styles.modelName}>{entry.modelName}</span>
                  </span>
                  {entry.seasonLabel ? (
                    <span className={styles.season}>{entry.seasonLabel}</span>
                  ) : null}
                  <span className={styles.arrow} aria-hidden="true">↗</span>
                </Link>
              </li>
            ))}
          </ol>
        ) : null}

        <nav className={styles.pagination} aria-label="Страницы каталога моделей">
          {parsed.page > 1 ? (
            <Link
              className={styles.directionLink}
              href={getCanonicalPath(parsed.page - 1)}
              prefetch={false}
              rel="prev"
            >
              ← Назад
            </Link>
          ) : <span aria-hidden="true" />}

          <ol className={styles.pageNumbers}>
            {Array.from({ length: directoryPage.pageCount }, (_, index) => {
              const page = index + 1;
              return (
                <li key={page}>
                  <Link
                    href={getCanonicalPath(page)}
                    prefetch={false}
                    aria-current={page === parsed.page ? "page" : undefined}
                    aria-label={`Страница ${page}`}
                  >
                    {page}
                  </Link>
                </li>
              );
            })}
          </ol>

          {parsed.page < directoryPage.pageCount ? (
            <Link
              className={styles.directionLink}
              href={getCanonicalPath(parsed.page + 1)}
              prefetch={false}
              rel="next"
            >
              Далее →
            </Link>
          ) : <span aria-hidden="true" />}
        </nav>

        <p className={styles.catalogReturn}>
          Нужны фильтры по бренду, стилю или ширине?{" "}
          <Link href="/catalog" prefetch={false}>Вернуться в каталог</Link>
        </p>
      </div>
    </div>
  );
}

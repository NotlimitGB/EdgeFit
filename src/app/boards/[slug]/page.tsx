import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrackedStoreLink } from "@/components/analytics/tracked-store-link";
import { BoardCard } from "@/components/boards/board-card";
import { BoardGallery } from "@/components/boards/board-gallery";
import publicStyles from "@/components/public/public-ui.module.css";
import { getBoardSizeLabel } from "@/lib/board-size";
import { hasTrustedFlex } from "@/lib/catalog-readiness";
import { getProductTrustDetails } from "@/lib/catalog-trust";
import {
  boardShapeLabels,
  camberProfileLabels,
  formatMoney,
  ridingStyleLabels,
  skillLevelLabels,
  widthTypeLabels,
} from "@/lib/content";
import {
  getAvailabilityDescription,
  getAvailabilityHeadline,
  getAvailableSizes,
} from "@/lib/product-availability";
import {
  getAllProducts,
  getProductBySlug,
  getRelatedProducts,
} from "@/lib/products";
import { buildStoreRedirectHref } from "@/lib/store-redirect";
import { formatRecommendedWeightRange } from "@/lib/weight-range";
import styles from "./board-detail.module.css";

interface BoardPageProps {
  params: Promise<{ slug: string }>;
}

type BoardPageProduct = NonNullable<
  Awaited<ReturnType<typeof getProductBySlug>>
>;

export const revalidate = 3600;

export async function generateStaticParams() {
  // При живой базе не строим сотни карточек на билде.
  // Страницы моделей будут собираться по запросу и кешироваться.
  if (process.env.DATABASE_URL?.trim()) {
    return [];
  }

  const models = await getAllProducts();

  return models.map((model) => ({
    slug: model.slug,
  }));
}

export async function generateMetadata({
  params,
}: BoardPageProps): Promise<Metadata> {
  const { slug } = await params;
  const board = await getProductBySlug(slug);

  if (!board) {
    return {
      title: "Модель не найдена",
    };
  }

  return {
    title: `${board.brand} ${board.modelName}`,
    description: board.descriptionShort,
  };
}

export default async function BoardPage({ params }: BoardPageProps) {
  const { slug } = await params;
  const board = await getProductBySlug(slug);

  if (!board) {
    notFound();
  }

  const relatedBoards = await getRelatedProducts(slug);
  const trustDetails = getProductTrustDetails(board);
  const availabilityHeadline = getAvailabilityHeadline(board);
  const availabilityDescription = getAvailabilityDescription(board);
  const availableSizes = getAvailableSizes(board);
  const hasAvailableSizes = availableSizes.length > 0;
  const introDescription =
    board.descriptionShort.trim() || board.descriptionFull.trim();
  const fullDescription = board.descriptionFull.trim();
  const showModelCharacter =
    fullDescription.length > 0 && fullDescription !== introDescription;
  const showScenarios =
    board.scenarios.length > 0 || board.notIdealFor.length > 0;
  const coreFacts = [
    {
      label: "Стиль",
      value: ridingStyleLabels[board.ridingStyle],
    },
    {
      label: "Уровень",
      value: skillLevelLabels[board.skillLevel],
    },
    {
      label: "Линейка",
      value: getBoardLineLabel(board.boardLine),
    },
    {
      label: "Форма",
      value: board.shapeType ? boardShapeLabels[board.shapeType] : "Уточняется",
    },
    {
      label: "Прогиб",
      value: board.camberProfile
        ? camberProfileLabels[board.camberProfile]
        : "Уточняется",
    },
    {
      label: "Жёсткость",
      value: getBoardStiffnessValue(board),
      caption: getBoardStiffnessCaption(board),
    },
  ];

  return (
    <div className={`${publicStyles.theme} ${styles.boardDetailPage}`}>
      <div className={styles.atmosphere} aria-hidden="true" />

      <div className={`container-shell ${styles.boardDetailShell}`}>
        <nav className={styles.breadcrumb} aria-label="Навигация по каталогу">
          <Link href="/catalog">← Вернуться в каталог</Link>
          <span aria-hidden="true">/</span>
          <span>{board.brand} {board.modelName}</span>
        </nav>

        <section className={styles.hero} aria-labelledby="board-title">
          <BoardGallery
            primaryImage={board.imageUrl}
            galleryImages={board.galleryImages}
            brand={board.brand}
            modelName={board.modelName}
          />

          <section
            className={`${publicStyles.raisedTechnicalSurface} ${styles.decisionPanel}`}
          >
            <div className={styles.identityMeta}>
              <p className={publicStyles.kicker}>{board.brand}</p>
              <div className={styles.identityBadges}>
                {board.seasonLabel ? <span>{board.seasonLabel}</span> : null}
                <span
                  className={
                    trustDetails.isReady
                      ? styles.trustBadgeReady
                      : styles.trustBadgeReview
                  }
                >
                  {trustDetails.badgeLabel}
                </span>
              </div>
            </div>

            <h1 id="board-title" className={styles.boardTitle}>
              {board.modelName}
            </h1>
            {introDescription ? (
              <p className={styles.heroDescription}>{introDescription}</p>
            ) : null}

            <dl className={styles.coreFacts}>
              {coreFacts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                  {fact.caption ? <p>{fact.caption}</p> : null}
                </div>
              ))}
            </dl>

            <div className={styles.commercialSummary}>
              <div className={styles.priceBlock}>
                <p className={publicStyles.microLabel}>Цена от</p>
                <strong>{formatMoney(board.priceFrom)}</strong>
              </div>
              <div className={styles.availabilityBlock}>
                <div className={styles.availabilityHeading}>
                  <p className={publicStyles.microLabel}>Наличие</p>
                  <span
                    className={
                      hasAvailableSizes
                        ? styles.availabilityReady
                        : styles.availabilityReview
                    }
                  >
                    {hasAvailableSizes ? "Доступно сейчас" : "Нужно уточнение"}
                  </span>
                </div>
                <strong>{availabilityHeadline}</strong>
              </div>
            </div>

            <p className={styles.availabilityDescription}>
              {availabilityDescription}
            </p>

            <div className={styles.heroActions}>
              <TrackedStoreLink
                href={buildStoreRedirectHref(board.slug, {
                  from: "board-page",
                })}
                analyticsPayload={{
                  board_slug: board.slug,
                  placement: "board-page",
                }}
                className={`${publicStyles.primaryAction} ${styles.heroAction}`}
              >
                Перейти в магазин
              </TrackedStoreLink>
              <Link
                href="/quiz"
                className={`${publicStyles.secondaryAction} ${styles.heroAction}`}
              >
                Проверить по своим параметрам
              </Link>
            </div>
            <p className={styles.fitBoundary}>
              Характеристики модели не определяют персональный fit. Квиз
              учитывает вес, ботинок, стойку и сценарий катания.
            </p>
          </section>
        </section>

        {showModelCharacter ? (
          <section className={`${styles.contentSection} ${styles.characterSection}`}>
            <div className={styles.sectionHeading}>
              <p className={publicStyles.kicker}>Характер модели</p>
              <h2>Что важно знать об этой доске</h2>
            </div>
            <p className={styles.characterCopy}>{fullDescription}</p>
          </section>
        ) : null}

        <section className={`${styles.contentSection} ${styles.sizesSection}`}>
          <div className={styles.sectionHeadingRow}>
            <div className={styles.sectionHeading}>
              <p className={publicStyles.kicker}>Геометрия модели</p>
              <h2>Размеры и ширина</h2>
            </div>
            <p>
              Таблица показывает всю размерную сетку и отдельно отмечает
              текущую доступность. Это данные модели, а не персональный подбор.
            </p>
          </div>

          {board.sizes.length > 0 ? (
            <>
              <p className={styles.mobileTableHint}>
                Прокрути таблицу по горизонтали
              </p>
              <div
                className={styles.tableScroller}
                role="region"
                aria-label={`Размеры и ширина ${board.brand} ${board.modelName}`}
                tabIndex={0}
              >
                <table className={styles.sizeTable}>
                  <caption>
                    Полная размерная сетка {board.brand} {board.modelName}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Размер</th>
                      <th scope="col">Ширина талии</th>
                      <th scope="col">Ширина</th>
                      <th scope="col">Вес райдера</th>
                      <th scope="col">Наличие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.sizes.map((size) => (
                      <tr
                        key={`${board.id}-${getBoardSizeLabel(size)}`}
                        className={
                          size.isAvailable
                            ? styles.availableRow
                            : styles.unavailableRow
                        }
                      >
                        <td>{getBoardSizeLabel(size)}</td>
                        <td>{size.waistWidthMm} мм</td>
                        <td>{widthTypeLabels[size.widthType]}</td>
                        <td>{formatRecommendedWeightRange(size)}</td>
                        <td>
                          <span
                            className={
                              size.isAvailable
                                ? styles.sizeAvailable
                                : styles.sizeUnavailable
                            }
                          >
                            {size.isAvailable ? "в наличии" : "нет сейчас"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className={styles.emptySizes}>
              <h3>Размерная сетка пока не опубликована</h3>
              <p>
                Проверь характеристики в источнике или магазине перед покупкой.
              </p>
            </div>
          )}

          <aside className={styles.sizeFitNote}>
            <div>
              <p className={publicStyles.microLabel}>Не уверен в ростовке?</p>
              <h3>Проверь длину и ширину по своим параметрам</h3>
              <p>
                EdgeFit учитывает вес, ботинок, стойку и сценарий катания.
              </p>
            </div>
            <Link
              href="/quiz"
              className={`${publicStyles.secondaryAction} ${styles.fitNoteAction}`}
            >
              Проверить мой размер
            </Link>
          </aside>
        </section>

        {showScenarios ? (
          <section className={`${styles.contentSection} ${styles.scenariosSection}`}>
            <div className={styles.sectionHeading}>
              <p className={publicStyles.kicker}>Сценарий катания</p>
              <h2>Где модель раскрывается лучше</h2>
            </div>
            <div className={styles.scenarioGrid}>
              {board.scenarios.length > 0 ? (
                <article className={styles.positiveScenario}>
                  <p className={publicStyles.microLabel}>Хорошо для</p>
                  <ul>
                    {board.scenarios.map((scenario) => (
                      <li key={scenario}>{scenario}</li>
                    ))}
                  </ul>
                </article>
              ) : null}
              {board.notIdealFor.length > 0 ? (
                <article className={styles.carefulScenario}>
                  <p className={publicStyles.microLabel}>Не лучший сценарий</p>
                  <ul>
                    {board.notIdealFor.map((scenario) => (
                      <li key={scenario}>{scenario}</li>
                    ))}
                  </ul>
                </article>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className={`${styles.contentSection} ${styles.trustSection}`}>
          <div className={styles.trustSummary}>
            <p className={publicStyles.kicker}>Проверка характеристик</p>
            <h2>Доверие к данным</h2>
            <span
              className={
                trustDetails.isReady
                  ? styles.trustStateReady
                  : styles.trustStateReview
              }
            >
              {trustDetails.badgeLabel}
            </span>
            <p>
              {trustDetails.isReady
                ? trustDetails.badgeDescription
                : trustDetails.issueLabel ?? trustDetails.badgeDescription}
            </p>
          </div>

          <div className={styles.sourceSummary}>
            {trustDetails.sourceLabel && trustDetails.sourceUrl ? (
              <>
                <p className={publicStyles.microLabel}>Источник</p>
                <h3>{trustDetails.sourceLabel}</h3>
                {trustDetails.checkedAtLabel ? (
                  <p>Последняя проверка: {trustDetails.checkedAtLabel}</p>
                ) : (
                  <p>Дата последней проверки не указана.</p>
                )}
                <a
                  href={trustDetails.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`${publicStyles.secondaryAction} ${styles.sourceAction}`}
                >
                  Открыть источник
                </a>
              </>
            ) : (
              <>
                <p className={publicStyles.microLabel}>Источник</p>
                <h3>Источник не указан</h3>
                <p>{trustDetails.badgeDescription}</p>
              </>
            )}
          </div>
        </section>

        {relatedBoards.length > 0 ? (
          <section className={`${styles.contentSection} ${styles.relatedSection}`}>
            <div className={styles.sectionHeadingRow}>
              <div className={styles.sectionHeading}>
                <p className={publicStyles.kicker}>Похожие модели</p>
                <h2>Что ещё стоит сравнить</h2>
              </div>
              <p>
                Это модели с близким каталоговым сценарием, а не персональные
                альтернативы.
              </p>
            </div>
            <div className={styles.relatedGrid}>
              {relatedBoards.map((relatedBoard) => (
                <BoardCard
                  key={relatedBoard.id}
                  product={relatedBoard}
                  variant="catalog"
                  shopHref={buildStoreRedirectHref(relatedBoard.slug, {
                    from: "board-related",
                  })}
                  shopAnalyticsPayload={{
                    board_slug: relatedBoard.slug,
                    placement: "board-related",
                  }}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function getBoardLineLabel(boardLine: BoardPageProduct["boardLine"]) {
  switch (boardLine) {
    case "men":
      return "Мужская";
    case "women":
      return "Женская";
    default:
      return "Унисекс";
  }
}

function getBoardStiffnessValue(board: BoardPageProduct) {
  if (hasTrustedFlex(board)) {
    return `${board.flex} из 10`;
  }

  return "Требует перепроверки";
}

function getBoardStiffnessCaption(board: BoardPageProduct) {
  if (hasTrustedFlex(board)) {
    return null;
  }

  return "По этой модели магазин не даёт надёжной точной оценки, поэтому не показываем жёсткость как конкретный балл.";
}

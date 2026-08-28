import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { TrackedStoreLink } from "@/components/analytics/tracked-store-link";
import { BoardGallery } from "@/components/boards/board-gallery";
import { CanonicalBoardCard } from "@/components/catalog/canonical-board-card";
import publicStyles from "@/components/public/public-ui.module.css";
import {
  getCanonicalBoardAvailabilityDescription,
  getCanonicalBoardAvailabilityHeadline,
  getCanonicalBoardLineLabel,
  getCanonicalBoardPricePresentation,
  getCanonicalBoardTrustDetails,
  getCanonicalCurrentAvailableSizes,
  getCanonicalFlexPresentation,
  getCanonicalNarrativeOfferSlug,
  getCanonicalSizeStoreAction,
  getCanonicalSizeAvailabilityLabel,
  getRelatedCanonicalBoards,
  isCanonicalSizeCurrentlyAvailable,
} from "@/lib/canonical-board-detail";
import {
  getAllCanonicalBoardSlugs,
  getAllCanonicalCatalogItems,
  resolveCanonicalBoardRouteBySlug,
} from "@/lib/canonical-catalog";
import {
  boardShapeLabels,
  camberProfileLabels,
  ridingStyleLabels,
  skillLevelLabels,
  widthTypeLabels,
} from "@/lib/content";
import { getProductBySlug } from "@/lib/products";
import { buildStoreRedirectHref } from "@/lib/store-redirect";
import { formatRecommendedWeightRange } from "@/lib/weight-range";
import styles from "./board-detail.module.css";

interface BoardPageProps {
  params: Promise<{ slug: string }>;
}

export const revalidate = 3600;

export async function generateStaticParams() {
  // При живой базе не строим сотни карточек на билде.
  // Страницы моделей будут собираться по запросу и кешироваться.
  if (process.env.DATABASE_URL?.trim()) {
    return [];
  }

  const slugs = await getAllCanonicalBoardSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: BoardPageProps): Promise<Metadata> {
  const { slug } = await params;
  const resolution = await resolveCanonicalBoardRouteBySlug(slug);

  if (!resolution) {
    return {
      title: "Модель не найдена",
    };
  }

  const board = resolution.item;
  const description =
    board.canonicalSpecs.descriptionShort?.trim() ||
    board.canonicalSpecs.descriptionFull?.trim() ||
    `Характеристики, размеры и доступность ${board.brand} ${board.modelName} в каталоге EdgeFit.`;

  return {
    title: `${board.brand} ${board.modelName}`,
    description,
    alternates: {
      canonical: `/boards/${board.slug}`,
    },
  };
}

export default async function BoardPage({ params }: BoardPageProps) {
  const { slug } = await params;
  const resolution = await resolveCanonicalBoardRouteBySlug(slug);

  if (!resolution) {
    notFound();
  }
  if (resolution.kind === "redirect") {
    permanentRedirect(`/boards/${resolution.canonicalSlug}`);
  }

  const board = resolution.item;
  const narrativeOfferSlug = getCanonicalNarrativeOfferSlug(board);
  const allBoards = await getAllCanonicalCatalogItems();
  const narrativeProduct = narrativeOfferSlug
    ? await getProductBySlug(narrativeOfferSlug)
    : undefined;
  const relatedBoards = getRelatedCanonicalBoards(board, allBoards);
  const specs = board.canonicalSpecs;
  const trustDetails = getCanonicalBoardTrustDetails(specs);
  const flexPresentation = getCanonicalFlexPresentation(specs);
  const pricePresentation = getCanonicalBoardPricePresentation(board.priceFrom);
  const currentAvailableSizes = getCanonicalCurrentAvailableSizes(board);
  const hasAvailableSizes = currentAvailableSizes.length > 0;
  const availabilityHeadline = getCanonicalBoardAvailabilityHeadline(board);
  const availabilityDescription =
    getCanonicalBoardAvailabilityDescription(board);
  const introDescription =
    specs.descriptionShort?.trim() || specs.descriptionFull?.trim() || "";
  const fullDescription = specs.descriptionFull?.trim() || "";
  const showModelCharacter =
    fullDescription.length > 0 && fullDescription !== introDescription;
  const scenarios = narrativeProduct?.scenarios ?? [];
  const notIdealFor = narrativeProduct?.notIdealFor ?? [];
  const showScenarios = scenarios.length > 0 || notIdealFor.length > 0;
  const coreFacts = [
    {
      label: "Стиль",
      value: specs.ridingStyle
        ? ridingStyleLabels[specs.ridingStyle]
        : "Уточняется",
    },
    {
      label: "Уровень",
      value: specs.skillLevel
        ? skillLevelLabels[specs.skillLevel]
        : "Уточняется",
    },
    {
      label: "Линейка",
      value: getCanonicalBoardLineLabel(specs.boardLine),
    },
    {
      label: "Форма",
      value: specs.shapeType
        ? boardShapeLabels[specs.shapeType]
        : "Уточняется",
    },
    {
      label: "Прогиб",
      value: specs.camberProfile
        ? camberProfileLabels[specs.camberProfile]
        : "Уточняется",
    },
    {
      label: "Жёсткость",
      value: flexPresentation.value,
      caption: flexPresentation.caption,
    },
  ];
  const genericStoreHref = board.defaultOfferSlug
    ? buildStoreRedirectHref(board.defaultOfferSlug, {
        from: "board-page",
        placement: "board-page",
      })
    : null;

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
            primaryImage={board.media[0] ?? ""}
            galleryImages={board.media.slice(1)}
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
                <p className={publicStyles.microLabel}>{pricePresentation.label}</p>
                <strong>{pricePresentation.value}</strong>
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
                    {hasAvailableSizes
                      ? "Есть отметки в каталоге"
                      : "Нужно уточнить"}
                  </span>
                </div>
                <strong>{availabilityHeadline}</strong>
              </div>
            </div>

            <p className={styles.availabilityDescription}>
              {availabilityDescription}
            </p>

            <div
              className={`${styles.heroActions} ${
                genericStoreHref ? "" : styles.heroActionsSingle
              }`}
            >
              {genericStoreHref ? (
                <TrackedStoreLink
                  href={genericStoreHref}
                  analyticsPayload={{
                    board_slug: board.slug,
                    placement: "board-page",
                  }}
                  className={`${publicStyles.primaryAction} ${styles.heroAction}`}
                >
                  Перейти в магазин
                </TrackedStoreLink>
              ) : null}
              <Link
                href="/quiz"
                className={`${publicStyles.secondaryAction} ${styles.heroAction}`}
              >
                Проверить по своим параметрам
              </Link>
            </div>
            <p className={styles.fitBoundary}>
              Характеристики модели сами по себе не показывают, подходит ли она
              именно тебе. Квиз учитывает вес, ботинок, стойку и стиль катания.
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
              сохранённые отметки доступности. Это данные модели, а не
              персональный подбор.
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
                      <th scope="col">Магазин</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.sizes.map((size) => {
                      const currentlyAvailable =
                        isCanonicalSizeCurrentlyAvailable(size);
                      const storeAction = getCanonicalSizeStoreAction(
                        board.slug,
                        size,
                      );

                      return (
                        <tr
                          key={size.sourceSizeId}
                          className={
                            currentlyAvailable
                              ? styles.availableRow
                              : styles.unavailableRow
                          }
                        >
                          <td>{size.displaySizeLabel}</td>
                          <td>{size.waistWidthMm} мм</td>
                          <td>{widthTypeLabels[size.widthType]}</td>
                          <td>{formatRecommendedWeightRange(size)}</td>
                          <td>
                            <span
                              className={
                                currentlyAvailable
                                  ? styles.sizeAvailable
                                  : styles.sizeUnavailable
                              }
                            >
                              {getCanonicalSizeAvailabilityLabel(size)}
                            </span>
                          </td>
                          <td>
                            {storeAction ? (
                              <TrackedStoreLink
                                href={storeAction.href}
                                analyticsPayload={storeAction.analyticsPayload}
                                className={`${publicStyles.secondaryAction} ${styles.sizeStoreAction}`}
                              >
                                В магазин
                              </TrackedStoreLink>
                            ) : (
                              <span className={styles.noSizeAction}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
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
                EdgeFit учитывает вес, ботинок, стойку и стиль катания.
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
              <p className={publicStyles.kicker}>Стиль катания</p>
              <h2>Где модель раскрывается лучше</h2>
            </div>
            <div className={styles.scenarioGrid}>
              {scenarios.length > 0 ? (
                <article className={styles.positiveScenario}>
                  <p className={publicStyles.microLabel}>Хорошо для</p>
                  <ul>
                    {scenarios.map((scenario) => (
                      <li key={scenario}>{scenario}</li>
                    ))}
                  </ul>
                </article>
              ) : null}
              {notIdealFor.length > 0 ? (
                <article className={styles.carefulScenario}>
                  <p className={publicStyles.microLabel}>Не лучший выбор для</p>
                  <ul>
                    {notIdealFor.map((scenario) => (
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
                Это модели с похожими характеристиками и стилем катания, а не
                персональные альтернативы.
              </p>
            </div>
            <div className={styles.relatedGrid}>
              {relatedBoards.map((relatedBoard) => (
                <CanonicalBoardCard
                  key={relatedBoard.slug}
                  board={relatedBoard}
                  storeFrom="board-related"
                  storePlacement="board-related"
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

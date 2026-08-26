import Link from "next/link";
import { TrackedStoreLink } from "@/components/analytics/tracked-store-link";
import publicStyles from "@/components/public/public-ui.module.css";
import { getBoardSizeLabel } from "@/lib/board-size";
import {
  boardShapeLabels,
  camberProfileLabels,
  formatMoney,
  ridingStyleLabels,
  widthTypeLabels,
} from "@/lib/content";
import type { StoreDestinationPresentation } from "@/lib/store-redirect";
import { formatRecommendedWeightRange } from "@/lib/weight-range";
import type { RecommendationMatch } from "@/types/domain";
import { getRecommendationDecisionCue } from "./recommendation-decision-cue";
import styles from "./result-view.module.css";

export interface RecommendationComparisonItem {
  match: RecommendationMatch;
  rank: number;
  shopHref: string;
  shopAnalyticsPayload?: Record<string, unknown>;
  commercialPresentation: StoreDestinationPresentation;
}

export interface RecommendationComparisonProps {
  items: RecommendationComparisonItem[];
}

const missingCatalogValue = "нет данных в каталоге";

export function RecommendationComparison({
  items,
}: RecommendationComparisonProps) {
  if (items.length < 2) {
    return null;
  }

  return (
    <section
      className={styles.decisionSection}
      aria-labelledby="recommendation-comparison-title"
    >
      <header className={styles.comparisonHeader}>
        <p className={publicStyles.kicker}>Финальный выбор</p>
        <h2 id="recommendation-comparison-title">Сравнить варианты</h2>
        <p>
          Смотри на сценарий выбора, ростовку и характеристики. №1 остаётся
          основным вариантом — сравнение не меняет порядок рекомендаций.
        </p>
      </header>

      <div className={styles.comparisonGrid} data-count={items.length}>
        {items.map(
          ({
            match,
            rank,
            shopHref,
            shopAnalyticsPayload,
            commercialPresentation,
          }) => {
            const decisionCue = getRecommendationDecisionCue(
              rank,
              match.role,
            );
            const facts = [
              { label: "Когда выбирать", value: decisionCue.summary },
              { label: "Ростовка", value: getBoardSizeLabel(match.size) },
              {
                label: "Ширина",
                value: `${widthTypeLabels[match.size.widthType]} · талия ${match.size.waistWidthMm} мм`,
              },
              {
                label: "Рабочий вес",
                value: formatRecommendedWeightRange(match.size),
              },
              {
                label: "Стиль модели",
                value: ridingStyleLabels[match.product.ridingStyle],
              },
              {
                label: "Форма",
                value: match.product.shapeType
                  ? boardShapeLabels[match.product.shapeType]
                  : missingCatalogValue,
              },
              {
                label: "Прогиб",
                value: match.product.camberProfile
                  ? camberProfileLabels[match.product.camberProfile]
                  : missingCatalogValue,
              },
              {
                label: "Ориентир цены",
                value: formatMoney(match.product.priceFrom),
              },
            ];

            return (
              <article
                key={`${match.product.id}-${getBoardSizeLabel(match.size)}-comparison`}
                className={styles.comparisonCandidate}
              >
                <header className={styles.comparisonCandidateHeader}>
                  <p className={styles.comparisonRank}>№{rank}</p>
                  <p className={styles.comparisonBrand}>{match.product.brand}</p>
                  <h3>{match.product.modelName}</h3>
                  <p className={styles.comparisonCue}>{decisionCue.label}</p>
                </header>

                <dl className={styles.comparisonFacts}>
                  {facts.map((fact) => (
                    <div key={fact.label}>
                      <dt>{fact.label}</dt>
                      <dd>{fact.value}</dd>
                    </div>
                  ))}
                </dl>

                <div className={styles.comparisonActions}>
                  <Link
                    href={`/boards/${match.product.slug}`}
                    className={styles.textAction}
                  >
                    О модели
                  </Link>
                  <TrackedStoreLink
                    href={shopHref}
                    analyticsPayload={shopAnalyticsPayload}
                    className={styles.textActionStrong}
                  >
                    {commercialPresentation.actionLabel}{" "}
                    <span aria-hidden="true">↗</span>
                  </TrackedStoreLink>
                </div>
              </article>
            );
          },
        )}
      </div>

      <p className={styles.comparisonPriceNote}>
        Цена — ориентир из каталога, а не подтверждённая текущая цена конкретной
        ростовки. Актуальную цену проверяй в магазине.
      </p>
    </section>
  );
}

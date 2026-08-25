import Link from "next/link";
import { TrackedStoreLink } from "@/components/analytics/tracked-store-link";
import publicStyles from "@/components/public/public-ui.module.css";
import { getBoardSizeLabel } from "@/lib/board-size";
import {
  boardShapeLabels,
  camberProfileLabels,
  formatMoney,
  widthTypeLabels,
} from "@/lib/content";
import { formatRecommendedWeightRange } from "@/lib/weight-range";
import type { ExactSizeOfferIntelligence } from "@/lib/exact-size-offer";
import type { StoreDestinationPresentation } from "@/lib/store-redirect";
import type { BudgetRelation } from "@/lib/purchase-preferences";
import type {
  RecommendationMatch,
  RecommendationRole,
} from "@/types/domain";
import styles from "./result-view.module.css";

export type ProductRecommendationCardVariant =
  | "featured"
  | "recommended"
  | "extra"
  | "careful";

export interface ProductRecommendationCardProps {
  match: RecommendationMatch;
  position: number;
  variant: ProductRecommendationCardVariant;
  shopHref: string;
  shopAnalyticsPayload?: Record<string, unknown>;
  commercialPresentation: StoreDestinationPresentation;
  offerIntelligence: ExactSizeOfferIntelligence;
  budgetRelation?: BudgetRelation;
  resultMode?: "session" | "saved";
  showReasons?: boolean;
}

export const recommendationRoleLabels: Record<RecommendationRole, string> = {
  "best-overall": "Лучший общий вариант",
  playful: "Более игривый",
  stable: "Больше стабильности",
  "width-safe": "Запас по ширине",
};

const variantClasses: Record<ProductRecommendationCardVariant, string> = {
  featured: styles.recommendationCardFeatured,
  recommended: styles.recommendationCardRecommended,
  extra: styles.recommendationCardExtra,
  careful: styles.recommendationCardCareful,
};

export function ProductRecommendationCard({
  match,
  position,
  variant,
  shopHref,
  shopAnalyticsPayload,
  commercialPresentation,
  offerIntelligence,
  budgetRelation = "budget_not_set",
  resultMode = "session",
  showReasons = true,
}: ProductRecommendationCardProps) {
  const reasons = match.reasons.length > 0
    ? match.reasons.slice(0, 3)
    : [match.fitLabel];
  const sizeLabel = getBoardSizeLabel(match.size);
  const productFacts = [
    match.product.shapeType
      ? {
          label: "Форма",
          value: boardShapeLabels[match.product.shapeType],
        }
      : null,
    match.product.camberProfile
      ? {
          label: "Прогиб",
          value: camberProfileLabels[match.product.camberProfile],
        }
      : null,
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact));
  const readinessLabel = match.isCatalogReady
    ? "Данные сверены"
    : "Характеристики перепроверить";
  const merchantLocationLabel =
    offerIntelligence.storeCode === "traektoria"
      ? "Траектории"
      : offerIntelligence.merchantLabel;
  const availabilityLabel =
    commercialPresentation.mode === "saved"
      ? `Наличие размера ${sizeLabel} нужно проверить в магазине`
      : offerIntelligence.status === "confirmed_available"
        ? `По данным каталога размер ${sizeLabel} отмечен доступным — актуальное наличие проверь в ${merchantLocationLabel}`
        : offerIntelligence.status === "search_only"
          ? `Точного предложения по размеру ${sizeLabel} пока нет`
          : `Наличие размера ${sizeLabel} не подтверждено`;
  const budgetLabel =
    budgetRelation === "within_catalog_estimate"
      ? resultMode === "saved"
        ? "По ориентиру каталога на момент подбора цена была не выше указанного бюджета."
        : "По ориентиру каталога цена не выше указанного бюджета."
      : budgetRelation === "over_catalog_estimate"
        ? resultMode === "saved"
          ? "По ориентиру каталога на момент подбора цена была выше указанного бюджета."
          : "По ориентиру каталога цена выше указанного бюджета."
        : budgetRelation === "price_unknown"
          ? "Нет надёжного ценового ориентира для сравнения с бюджетом."
          : null;

  return (
    <article
      className={`${styles.recommendationCard} ${variantClasses[variant]}`}
      data-variant={variant}
    >
      <header className={styles.recommendationCardHeader}>
        <div className={styles.recommendationCoordinate}>
          <span>EF / REC {String(position).padStart(2, "0")}</span>
          <span
            className={`${styles.readiness} ${
              match.isCatalogReady
                ? styles.readinessReady
                : styles.readinessReview
            }`}
          >
            {readinessLabel}
          </span>
        </div>

        <p className={styles.recommendationRole}>
          {variant === "careful" ? "Слабее по текущему fit · " : ""}
          {recommendationRoleLabels[match.role]}
        </p>
        <p className={styles.recommendationBrand}>{match.product.brand}</p>
        <h3>{match.product.modelName}</h3>

        <div className={styles.matchSummary}>
          <strong>{match.fitLabel}</strong>
          <span>{match.confidenceLabel}</span>
        </div>
      </header>

      {showReasons ? (
        <div className={styles.recommendationReasons}>
          <p className={publicStyles.microLabel}>Почему подходит</p>
          <ol>
            {reasons.map((reason, index) => (
              <li key={`${reason}-${index}`}>
                <span aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p>{reason}</p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className={styles.recommendedSize}>
        <div>
          <p className={publicStyles.microLabel}>Рекомендованный размер</p>
          <strong>{sizeLabel}</strong>
        </div>
        <dl>
          <div>
            <dt>Ширина</dt>
            <dd>{widthTypeLabels[match.size.widthType]}</dd>
          </div>
          <div>
            <dt>Талия</dt>
            <dd>{match.size.waistWidthMm} мм</dd>
          </div>
          <div>
            <dt>Вес</dt>
            <dd>{formatRecommendedWeightRange(match.size)}</dd>
          </div>
        </dl>
      </div>

      {productFacts.length > 0 ? (
        <dl className={styles.productFacts}>
          {productFacts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className={styles.commercialMeta}>
        <p>
          <span>{commercialPresentation.priceLabel}</span>
          <strong>{formatMoney(match.product.priceFrom)}</strong>
        </p>
        <p>{availabilityLabel}</p>
        {budgetLabel ? <p>{budgetLabel}</p> : null}
      </div>

      {commercialPresentation.note ? (
        <p className={styles.commercialNote}>{commercialPresentation.note}</p>
      ) : null}

      <div className={styles.recommendationActions}>
        <Link
          href={`/boards/${match.product.slug}`}
          className={publicStyles.secondaryAction}
        >
          О модели
        </Link>
        <TrackedStoreLink
          href={shopHref}
          analyticsPayload={shopAnalyticsPayload}
          className={publicStyles.primaryAction}
        >
          {commercialPresentation.actionLabel} <span aria-hidden="true">↗</span>
        </TrackedStoreLink>
      </div>
    </article>
  );
}

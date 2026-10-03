"use client";

import Link from "next/link";
import { memo, useState } from "react";
import { TrackedStoreLink } from "@/components/analytics/tracked-store-link";
import boardCardStyles from "@/components/boards/board-card.module.css";
import publicStyles from "@/components/public/public-ui.module.css";
import {
  boardShapeLabels,
  camberProfileLabels,
  ridingStyleLabels,
} from "@/lib/content";
import { buildStoreRedirectHref } from "@/lib/store-redirect";
import type { PublicCatalogItem as CanonicalCatalogItem } from "@/lib/public-catalog-dto";
import { useCatalogIntentPrefetch } from "./catalog-prefetch";
import {
  getCanonicalAvailabilityHeadline,
  getCanonicalAvailabilityPreview,
  getCanonicalPricePresentation,
  getCanonicalWidthSummary,
} from "./canonical-catalog-ui";
import catalogStyles from "./catalog.module.css";

interface CanonicalBoardCardProps {
  board: CanonicalCatalogItem;
  storeFrom?: string;
  storePlacement?: string;
}

const boardLineLabels: Record<
  NonNullable<CanonicalCatalogItem["canonicalSpecs"]["boardLine"]>,
  string
> = {
  men: "Мужская",
  women: "Женская",
  unisex: "Универсальная",
};

export const CanonicalBoardCard = memo(function CanonicalBoardCard({
  board,
  storeFrom = "catalog-card",
  storePlacement = "catalog",
}: CanonicalBoardCardProps) {
  const [failedImageUrls, setFailedImageUrls] = useState<string[]>([]);
  const imageCandidates = board.media;
  const activeImageUrl = imageCandidates.find(
    (imageUrl) => !failedImageUrls.includes(imageUrl),
  );
  const modelHref = `/boards/${board.slug}`;
  const intentPrefetch = useCatalogIntentPrefetch(modelHref);
  const availabilityHeadline = getCanonicalAvailabilityHeadline(board);
  const availabilityPreview = getCanonicalAvailabilityPreview(board);
  const price = getCanonicalPricePresentation(board.priceFrom);
  const technicalFacts = [
    {
      label: "Стиль",
      value: board.canonicalSpecs.ridingStyle
        ? ridingStyleLabels[board.canonicalSpecs.ridingStyle]
        : "уточняется",
    },
    {
      label: "Форма",
      value: board.canonicalSpecs.shapeType
        ? boardShapeLabels[board.canonicalSpecs.shapeType]
        : "уточняется",
    },
    {
      label: "Прогиб",
      value: board.canonicalSpecs.camberProfile
        ? camberProfileLabels[board.canonicalSpecs.camberProfile]
        : "уточняется",
    },
  ];
  const shopHref = board.defaultOfferSlug
    ? buildStoreRedirectHref(board.defaultOfferSlug, {
        from: storeFrom,
        placement: storePlacement,
      })
    : null;

  return (
    <article className={boardCardStyles.catalogCard}>
      <Link
        href={modelHref}
        prefetch={false}
        {...intentPrefetch}
        className={boardCardStyles.imageLink}
        aria-label={`Открыть модель ${board.brand} ${board.modelName}`}
      >
        <div className={boardCardStyles.imageStage}>
          <div className={boardCardStyles.imageGrid} aria-hidden="true" />
          {activeImageUrl ? (
            // External catalog sources are not part of the Next image allowlist.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={activeImageUrl}
              src={activeImageUrl}
              alt={`${board.brand} ${board.modelName}`}
              loading="lazy"
              decoding="async"
              onError={() => {
                setFailedImageUrls((current) =>
                  current.includes(activeImageUrl)
                    ? current
                    : [...current, activeImageUrl],
                );
              }}
              className={boardCardStyles.productImage}
            />
          ) : (
            <div className={boardCardStyles.imageFallback}>
              <span className={boardCardStyles.fallbackBoard} aria-hidden="true" />
              <span>
                <small>{board.brand}</small>
                Фото пока не подготовлено
              </span>
            </div>
          )}
        </div>
      </Link>

      <div className={boardCardStyles.cardBody}>
        <div className={boardCardStyles.identityRow}>
          <div className={boardCardStyles.identity}>
            <p>{board.brand}</p>
            <h3>
              <Link href={modelHref} prefetch={false} {...intentPrefetch}>
                {board.modelName}
              </Link>
            </h3>
            {board.seasonLabel ? <span>{board.seasonLabel}</span> : null}
          </div>
          <div className={boardCardStyles.tags} aria-label="Категории модели">
            <span>{getCanonicalWidthSummary(board)}</span>
            {board.canonicalSpecs.boardLine ? (
              <span>{boardLineLabels[board.canonicalSpecs.boardLine]}</span>
            ) : null}
          </div>
        </div>

        <p className={boardCardStyles.description}>{board.canonicalSpecs.descriptionShort}</p>

        <dl className={boardCardStyles.technicalFacts}>
          {technicalFacts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>

        <div className={boardCardStyles.commercialInfo}>
          <div className={boardCardStyles.availability}>
            <p className={publicStyles.microLabel}>Данные о доступности</p>
            <strong>{availabilityHeadline}</strong>
            <span>{availabilityPreview}</span>
          </div>
          <div className={boardCardStyles.price}>
            <p className={publicStyles.microLabel}>{price.label}</p>
            <strong>{price.value}</strong>
          </div>
        </div>

        <div className={boardCardStyles.actions}>
          <Link
            href={modelHref}
            prefetch={false}
            {...intentPrefetch}
            className={`${publicStyles.secondaryAction} ${boardCardStyles.cardAction} ${
              shopHref ? "" : catalogStyles.singleCardAction
            }`}
          >
            О модели
          </Link>
          {shopHref ? (
            <TrackedStoreLink
              href={shopHref}
              analyticsPayload={{
                board_slug: board.slug,
                placement: storePlacement,
              }}
              className={`${publicStyles.primaryAction} ${boardCardStyles.cardAction}`}
            >
              В магазин
            </TrackedStoreLink>
          ) : null}
        </div>
      </div>
    </article>
  );
});

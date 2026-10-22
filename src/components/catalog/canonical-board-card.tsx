"use client";

import Link from "next/link";
import { memo, useState } from "react";
import { TrackedStoreLink } from "@/components/analytics/tracked-store-link";
import boardCardStyles from "./catalog-card.module.css";
import {
  boardShapeLabels,
  camberProfileLabels,
  ridingStyleLabels,
} from "@/lib/content";
import { buildStoreRedirectHref } from "@/lib/store-redirect";
import type { PublicCatalogItem as CanonicalCatalogItem } from "@/lib/public-catalog-dto";
import { useCatalogIntentPrefetch } from "./catalog-prefetch";
import {
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
  function markImageFailed(imageUrl: string) {
    setFailedImageUrls((current) => current.includes(imageUrl) ? current : [...current, imageUrl]);
  }
  const modelHref = `/boards/${board.slug}`;
  const intentPrefetch = useCatalogIntentPrefetch(modelHref);
  const price = getCanonicalPricePresentation(board.priceFrom);
  const sizeLabels = [...new Set((board.recordedVariants ?? []).map((v) => v.displaySizeLabel))];
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
    { label: "Жёсткость", value: board.flexPresentation ?? "уточняется" },
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
              ref={(image) => {
                // An SSR image may fail before hydration attaches onError.
                if (image?.complete && image.naturalWidth === 0) markImageFailed(activeImageUrl);
              }}
              src={activeImageUrl}
              alt={`${board.brand} ${board.modelName}${board.seasonLabel ? ` · ${board.seasonLabel}` : ""}`}
              loading="lazy"
              decoding="async"
              onError={() => markImageFailed(activeImageUrl)}
              className={boardCardStyles.productImage}
            />
          ) : (
            <div className={boardCardStyles.imageFallback}>
              <span className={boardCardStyles.fallbackBoard} aria-hidden="true" />
              <span>
                Фото модели пока нет
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

        <dl className={boardCardStyles.technicalFacts}>
          {technicalFacts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>

        <div className={boardCardStyles.commercialInfo}>
          <div className={boardCardStyles.availability}><p>Ростовки по данным каталога</p>
            <span>{sizeLabels.length ? `${sizeLabels.slice(0, 4).join(" · ")}${sizeLabels.length > 4 ? ` +${sizeLabels.length - 4}` : ""}` : "Не указаны"}</span>
          </div>
          <div className={boardCardStyles.price}>
            <p>{price.label}</p>
            <strong>{board.priceFrom != null && Number.isFinite(board.priceFrom) && board.priceFrom > 0 ? price.value : "Цена не указана"}</strong>
          </div>
          <p className={boardCardStyles.stockNote}>Текущее наличие не подтверждено</p>
        </div>

        <div className={boardCardStyles.actions}>
          <Link
            href={modelHref}
            prefetch={false}
            {...intentPrefetch}
            className={`${boardCardStyles.modelAction} ${boardCardStyles.cardAction} ${
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
              className={`${boardCardStyles.storeAction} ${boardCardStyles.cardAction}`}
            >
              Проверить в магазине
            </TrackedStoreLink>
          ) : null}
        </div>
      </div>
    </article>
  );
});

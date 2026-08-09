"use client";

import Link from "next/link";
import { useState } from "react";
import { TrackedStoreLink } from "@/components/analytics/tracked-store-link";
import boardCardStyles from "@/components/boards/board-card.module.css";
import publicStyles from "@/components/public/public-ui.module.css";
import {
  boardShapeLabels,
  camberProfileLabels,
  ridingStyleLabels,
} from "@/lib/content";
import { buildStoreRedirectHref } from "@/lib/store-redirect";
import type { CanonicalCatalogItem } from "@/types/canonical-catalog";
import {
  getCanonicalAvailabilityHeadline,
  getCanonicalAvailabilityPreview,
  getCanonicalPricePresentation,
  getCanonicalWidthSummary,
} from "./canonical-catalog-ui";
import catalogStyles from "./catalog.module.css";

interface CanonicalBoardCardProps {
  board: CanonicalCatalogItem;
}

const boardLineLabels: Record<
  NonNullable<CanonicalCatalogItem["canonicalSpecs"]["boardLine"]>,
  string
> = {
  men: "Мужская",
  women: "Женская",
  unisex: "Универсальная",
};

function getSkillHint(
  skillLevel: CanonicalCatalogItem["canonicalSpecs"]["skillLevel"],
) {
  switch (skillLevel) {
    case "beginner":
      return "Характеристики ориентированы на первые сезоны и спокойный прогресс.";
    case "intermediate":
      return "Характеристики лучше раскрываются на среднем уровне и при уверенном базовом катании.";
    case "advanced":
      return "Характеристики рассчитаны на уверенное катание и заметную нагрузку на доску.";
    default:
      return "";
  }
}

function buildDescription(board: CanonicalCatalogItem) {
  const description = board.canonicalSpecs.descriptionShort?.trim();
  if (description) {
    return description;
  }

  const { boardLine, ridingStyle, shapeType, skillLevel } =
    board.canonicalSpecs;
  const identityParts = [
    boardLine ? boardLineLabels[boardLine] : null,
    ridingStyle ? ridingStyleLabels[ridingStyle] : null,
  ].filter((value): value is string => value != null);
  const shapeLabel = shapeType ? boardShapeLabels[shapeType] : null;
  const firstSentence =
    identityParts.length > 0
      ? `${identityParts.join(" ")} доска${
          shapeLabel ? ` с формой ${shapeLabel}` : ""
        }.`
      : shapeLabel
        ? `Модель с формой ${shapeLabel}.`
        : "";
  const skillHint = getSkillHint(skillLevel);

  return (
    [firstSentence, skillHint].filter(Boolean).join(" ") ||
    "Сравни геометрию, доступные размеры и характеристики модели."
  );
}

function getImageCandidates(board: CanonicalCatalogItem) {
  return Array.from(
    new Set(board.media.map((imageUrl) => imageUrl.trim()).filter(Boolean)),
  );
}

export function CanonicalBoardCard({ board }: CanonicalBoardCardProps) {
  const [failedImageUrls, setFailedImageUrls] = useState<string[]>([]);
  const imageCandidates = getImageCandidates(board);
  const activeImageUrl = imageCandidates.find(
    (imageUrl) => !failedImageUrls.includes(imageUrl),
  );
  const modelHref = `/boards/${board.slug}`;
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
        from: "catalog-card",
        placement: "catalog",
      })
    : null;

  return (
    <article className={boardCardStyles.catalogCard}>
      <Link
        href={modelHref}
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
              <Link href={modelHref}>{board.modelName}</Link>
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

        <p className={boardCardStyles.description}>{buildDescription(board)}</p>

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
            <p className={publicStyles.microLabel}>Наличие</p>
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
                placement: "catalog",
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
}

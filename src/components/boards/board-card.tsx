"use client";

import Link from "next/link";
import { useState } from "react";
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
import {
  getAvailabilityHeadline,
  getAvailabilitySizePreview,
} from "@/lib/product-availability";
import { buildStoreRedirectHrefForSize } from "@/lib/store-redirect";
import { formatRecommendedWeightRange } from "@/lib/weight-range";
import type { Product, ProductSize, WidthType } from "@/types/domain";
import styles from "./board-card.module.css";

export type BoardCardVariant = "default" | "catalog";

interface BoardCardProps {
  product: Product;
  size?: ProductSize;
  eyebrow?: string;
  note?: string;
  compact?: boolean;
  variant?: BoardCardVariant;
  shopHref?: string;
  shopAnalyticsPayload?: Record<string, unknown>;
}

function getPrimaryWidthType(product: Product): WidthType {
  const widthTypes = product.sizes.map((currentSize) => currentSize.widthType);

  if (widthTypes.includes("wide")) {
    return "wide";
  }

  if (widthTypes.includes("mid-wide")) {
    return "mid-wide";
  }

  return "regular";
}

function getBoardLineCardLabel(boardLine: Product["boardLine"]) {
  switch (boardLine) {
    case "women":
      return "Женская";
    case "men":
      return "Мужская";
    default:
      return "Универсальная";
  }
}

function getSkillHint(skillLevel: Product["skillLevel"]) {
  switch (skillLevel) {
    case "beginner":
      return "Подойдёт для первых сезонов и спокойного прогресса.";
    case "intermediate":
      return "Лучше раскрывается на среднем уровне и при уверенном базовом катании.";
    case "advanced":
      return "Больше понравится тем, кто уже катается уверенно и любит нагрузку на доску.";
    default:
      return "";
  }
}

function buildCatalogCardDescription(product: Product) {
  const lineLabel = getBoardLineCardLabel(product.boardLine);
  const shapeLabel = product.shapeType
    ? boardShapeLabels[product.shapeType]
    : null;
  const firstSentence = `${lineLabel} ${ridingStyleLabels[product.ridingStyle]} доска${
    shapeLabel ? ` с формой ${shapeLabel}` : ""
  }.`;

  return `${firstSentence} ${getSkillHint(product.skillLevel)}`;
}

function getCatalogImageCandidates(product: Product) {
  return Array.from(
    new Set(
      [product.imageUrl, ...(product.galleryImages ?? [])]
        .map((imageUrl) => imageUrl.trim())
        .filter(Boolean),
    ),
  );
}

interface CatalogBoardCardProps {
  product: Product;
  eyebrow?: string;
  primaryWidthType: WidthType;
  availabilityHeadline: string;
  availabilitySizePreview: string;
  shopHref: string;
  shopAnalyticsPayload: Record<string, unknown>;
}

function CatalogBoardCard({
  product,
  eyebrow,
  primaryWidthType,
  availabilityHeadline,
  availabilitySizePreview,
  shopHref,
  shopAnalyticsPayload,
}: CatalogBoardCardProps) {
  const [failedImageUrls, setFailedImageUrls] = useState<string[]>([]);
  const imageCandidates = getCatalogImageCandidates(product);
  const activeImageUrl = imageCandidates.find(
    (imageUrl) => !failedImageUrls.includes(imageUrl),
  );
  const modelHref = `/boards/${product.slug}`;
  const widthLabel = eyebrow ?? widthTypeLabels[primaryWidthType];
  const description =
    product.descriptionShort.trim() || buildCatalogCardDescription(product);
  const technicalFacts = [
    {
      label: "Стиль",
      value: ridingStyleLabels[product.ridingStyle],
    },
    {
      label: "Форма",
      value: product.shapeType
        ? boardShapeLabels[product.shapeType]
        : "уточняется",
    },
    {
      label: "Прогиб",
      value: product.camberProfile
        ? camberProfileLabels[product.camberProfile]
        : "уточняется",
    },
  ];

  return (
    <article className={styles.catalogCard}>
      <Link
        href={modelHref}
        className={styles.imageLink}
        aria-label={`Открыть модель ${product.brand} ${product.modelName}`}
      >
        <div className={styles.imageStage}>
          <div className={styles.imageGrid} aria-hidden="true" />
          {activeImageUrl ? (
            // External catalog sources are not part of the Next image allowlist.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={activeImageUrl}
              src={activeImageUrl}
              alt={`${product.brand} ${product.modelName}`}
              loading="lazy"
              decoding="async"
              onError={() => {
                setFailedImageUrls((current) =>
                  current.includes(activeImageUrl)
                    ? current
                    : [...current, activeImageUrl],
                );
              }}
              className={styles.productImage}
            />
          ) : (
            <div className={styles.imageFallback}>
              <span className={styles.fallbackBoard} aria-hidden="true" />
              <span>
                <small>{product.brand}</small>
                Фото пока не подготовлено
              </span>
            </div>
          )}
        </div>
      </Link>

      <div className={styles.cardBody}>
        <div className={styles.identityRow}>
          <div className={styles.identity}>
            <p>{product.brand}</p>
            <h3>
              <Link href={modelHref}>{product.modelName}</Link>
            </h3>
            {product.seasonLabel ? <span>{product.seasonLabel}</span> : null}
          </div>
          <div className={styles.tags} aria-label="Категории модели">
            <span>{widthLabel}</span>
            <span>{getBoardLineCardLabel(product.boardLine)}</span>
          </div>
        </div>

        <p className={styles.description}>{description}</p>

        <dl className={styles.technicalFacts}>
          {technicalFacts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>

        <div className={styles.commercialInfo}>
          <div className={styles.availability}>
            <p className={publicStyles.microLabel}>Наличие</p>
            <strong>{availabilityHeadline}</strong>
            <span>{availabilitySizePreview}</span>
          </div>
          <div className={styles.price}>
            <p className={publicStyles.microLabel}>Цена от</p>
            <strong>{formatMoney(product.priceFrom)}</strong>
          </div>
        </div>

        <div className={styles.actions}>
          <Link
            href={modelHref}
            className={`${publicStyles.secondaryAction} ${styles.cardAction}`}
          >
            О модели
          </Link>
          <TrackedStoreLink
            href={shopHref}
            analyticsPayload={shopAnalyticsPayload}
            className={`${publicStyles.primaryAction} ${styles.cardAction}`}
          >
            В магазин
          </TrackedStoreLink>
        </div>
      </div>
    </article>
  );
}

export function BoardCard({
  product,
  size,
  eyebrow,
  note,
  compact = false,
  variant = "default",
  shopHref,
  shopAnalyticsPayload,
}: BoardCardProps) {
  const primaryWidthType = size?.widthType ?? getPrimaryWidthType(product);
  const availabilityHeadline = getAvailabilityHeadline(product);
  const availabilitySizePreview = getAvailabilitySizePreview(product);
  const sizeLabel = size ? getBoardSizeLabel(size) : null;
  const descriptionText = compact
    ? product.descriptionShort
    : buildCatalogCardDescription(product);
  const resolvedShopHref =
    shopHref ??
    buildStoreRedirectHrefForSize(product.slug, size, {
      from: compact ? "result-card" : "catalog-card",
    });
  const resolvedShopAnalyticsPayload = shopAnalyticsPayload ?? {
    board_slug: product.slug,
    placement: compact ? "recommended" : "catalog",
    size_cm: size?.sizeCm ?? null,
    size_label: sizeLabel,
    width_type: size?.widthType ?? null,
  };

  if (variant === "catalog") {
    return (
      <CatalogBoardCard
        product={product}
        eyebrow={eyebrow}
        primaryWidthType={primaryWidthType}
        availabilityHeadline={availabilityHeadline}
        availabilitySizePreview={availabilitySizePreview}
        shopHref={resolvedShopHref}
        shopAnalyticsPayload={resolvedShopAnalyticsPayload}
      />
    );
  }

  const compactMetrics = [
    {
      label: "Стиль",
      value: ridingStyleLabels[product.ridingStyle],
    },
    {
      label: "Прогиб",
      value: product.camberProfile
        ? camberProfileLabels[product.camberProfile]
        : "уточняется",
    },
    {
      label: "Форма",
      value: product.shapeType
        ? boardShapeLabels[product.shapeType]
        : "уточняется",
    },
    {
      label: "Ширина",
      value: widthTypeLabels[primaryWidthType],
    },
  ];
  const catalogMetrics = [
    {
      label: "Стиль",
      value: ridingStyleLabels[product.ridingStyle],
    },
    {
      label: "Прогиб",
      value: product.camberProfile
        ? camberProfileLabels[product.camberProfile]
        : "уточняется",
    },
    {
      label: "Форма",
      value: product.shapeType
        ? boardShapeLabels[product.shapeType]
        : "уточняется",
    },
    {
      label: "Ширина",
      value: widthTypeLabels[primaryWidthType],
    },
  ];

  return (
    <article className="panel flex h-full flex-col overflow-hidden p-5">
      <div
        className={`w-full rounded-[1.2rem] border border-white/55 bg-[linear-gradient(145deg,rgba(32,89,119,0.96),rgba(74,136,170,0.74))] p-5 text-white ${
          compact
            ? "mb-4 flex min-h-[21.5rem] flex-col pb-6 sm:h-[21.5rem]"
            : "mb-5 flex h-[21.5rem] flex-col pb-5"
        }`}
      >
        <div
          className={`flex gap-3 ${
            compact
              ? "mb-5 flex-col sm:min-h-[5.5rem] sm:flex-row sm:items-start"
              : "mb-4 min-h-[5.5rem] flex-col sm:flex-row sm:items-start"
          }`}
        >
          <div className={compact ? "min-h-[5.5rem] flex-1" : "min-h-[5.5rem] flex-1"}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/72">
              {product.brand}
            </p>
            <h3
              className={`heading-display mt-2 text-2xl font-bold ${
                compact ? "line-clamp-2 min-h-[4.5rem]" : "line-clamp-2 min-h-[3.5rem]"
              }`}
            >
              {product.modelName}
            </h3>
          </div>

          {eyebrow ? (
            <span
              className={`inline-flex shrink-0 rounded-full bg-white/16 px-3 py-2 text-xs font-semibold text-white ${
                compact
                  ? "max-w-full items-center justify-center self-start text-center leading-5 whitespace-normal sm:max-w-[13.5rem]"
                  : "max-w-full items-center justify-center self-start text-center leading-5 whitespace-normal sm:max-w-[8.5rem]"
              }`}
            >
              {eyebrow}
            </span>
          ) : null}
        </div>

        {compact ? (
          <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-x-4 gap-y-2 text-sm text-white/84">
            {compactMetrics.map((metric) => (
              <div key={metric.label} className="min-h-[3rem]">
                <p className="text-white/58">{metric.label}</p>
                <p className="mt-1 line-clamp-2 font-semibold leading-5">
                  {metric.value}
                </p>
              </div>
            ))}

            <div className="col-span-2 rounded-[1rem] bg-white/12 px-4 py-2">
              <p className="text-white/58">Цена от</p>
              <p className="mt-1 text-lg font-semibold leading-6 text-white">
                {formatMoney(product.priceFrom)}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid h-full flex-1 grid-cols-2 grid-rows-2 gap-x-5 gap-y-3 text-sm text-white/84">
            {catalogMetrics.map((metric) => (
              <div key={metric.label} className="min-h-0">
                <p className="text-white/58">{metric.label}</p>
                <p className="mt-1 line-clamp-3 min-h-[4.5rem] font-semibold leading-6">
                  {metric.value}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <p
        className={`text-sm leading-7 text-[var(--color-muted)] ${
          compact
            ? "min-h-[6.5rem] [display:-webkit-box] overflow-hidden [-webkit-box-orient:vertical] [-webkit-line-clamp:3]"
            : "min-h-[6rem] [display:-webkit-box] overflow-hidden [-webkit-box-orient:vertical] [-webkit-line-clamp:3]"
        }`}
      >
        {descriptionText}
      </p>

      {!compact ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[1.1rem] border border-[var(--color-border)] bg-[var(--color-paper-soft)] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
              Цена от
            </p>
            <p className="mt-2 text-lg font-bold text-[var(--color-ink)]">
              {formatMoney(product.priceFrom)}
            </p>
          </div>
          <div className="rounded-[1.1rem] border border-[var(--color-border)] bg-[var(--color-paper-soft)] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
              В наличии
            </p>
            <p className="mt-2 text-base font-bold text-[var(--color-ink)]">
              {availabilityHeadline}
            </p>
            <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
              {availabilitySizePreview}
            </p>
          </div>
        </div>
      ) : null}

      {size ? (
        <div
          className={`mt-4 rounded-2xl bg-[var(--color-paper-soft)] p-4 text-sm text-[var(--color-ink)] ${
            compact ? "min-h-[6.5rem]" : ""
          }`}
        >
          <p className="font-semibold">
            Лучший размер сейчас: {getBoardSizeLabel(size)}
          </p>
          <p
            className={`mt-1 text-[var(--color-muted)] ${
              compact
                ? "[display:-webkit-box] overflow-hidden [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
                : ""
            }`}
          >
            Ширина талии {size.waistWidthMm} мм, рекомендованный вес{" "}
            {formatRecommendedWeightRange(size)}.
          </p>
        </div>
      ) : null}

      {note ? (
        <p
          className={`mt-4 text-sm leading-7 text-[var(--color-muted)] ${
            compact
              ? "min-h-[4.5rem] [display:-webkit-box] overflow-hidden [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
              : ""
          }`}
        >
          {note}
        </p>
      ) : null}

      <div className="mt-auto flex items-center gap-3 pt-6">
        <Link
          href={`/boards/${product.slug}`}
          className="inline-flex flex-1 items-center justify-center rounded-full border border-[var(--color-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--color-pine)] hover:border-[var(--color-sky)] hover:text-[var(--color-sky-deep)]"
        >
          О модели
        </Link>
        <TrackedStoreLink
          href={resolvedShopHref}
          analyticsPayload={resolvedShopAnalyticsPayload}
          className="inline-flex flex-1 items-center justify-center rounded-full bg-[var(--color-pine)] px-4 py-3 text-sm font-bold text-white hover:-translate-y-0.5 hover:bg-[var(--color-sky-deep)]"
        >
          В магазин
        </TrackedStoreLink>
      </div>
    </article>
  );
}

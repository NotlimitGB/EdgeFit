import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrackedStoreLink } from "@/components/analytics/tracked-store-link";
import { BoardCard } from "@/components/boards/board-card";
import { BoardGallery } from "@/components/boards/board-gallery";
import { getBoardSizeLabel } from "@/lib/board-size";
import { formatCatalogCheckedDate } from "@/lib/catalog-trust";
import {
  boardShapeLabels,
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
  const sourceCheckedAtLabel = formatCatalogCheckedDate(board.sourceCheckedAt);
  const availabilityHeadline = getAvailabilityHeadline(board);
  const availabilityDescription = getAvailabilityDescription(board);
  const availableSizes = getAvailableSizes(board);
  const hasAvailableSizes = availableSizes.length > 0;

  return (
    <div className="container-shell py-12 sm:py-16">
      <section className="grid gap-8 xl:grid-cols-[1fr_0.95fr]">
        <div className="space-y-5">
          <BoardGallery
            primaryImage={board.imageUrl}
            galleryImages={board.galleryImages}
            brand={board.brand}
            modelName={board.modelName}
          />

          <section className="panel overflow-hidden p-6 sm:p-8">
            <span className="eyebrow">{board.brand}</span>
            <h1 className="heading-display mt-4 text-4xl font-bold text-balance sm:text-5xl">
              {board.modelName}
            </h1>
            {board.seasonLabel ? (
              <div className="mt-4">
                <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[rgba(74,136,170,0.08)] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-sky-deep)]">
                  Сезон {board.seasonLabel}
                </span>
              </div>
            ) : null}
            <p className="mt-4 text-base leading-8 text-[var(--color-muted)] sm:text-lg">
              {board.descriptionFull}
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <InfoCard label="Стиль" value={ridingStyleLabels[board.ridingStyle]} />
              <InfoCard label="Уровень" value={skillLevelLabels[board.skillLevel]} />
              <InfoCard
                label="Форма"
                value={
                  board.shapeType
                    ? boardShapeLabels[board.shapeType]
                    : "Уточняется"
                }
              />
              <InfoCard
                label="Жёсткость доски"
                value={getBoardStiffnessValue(board)}
                caption={getBoardStiffnessCaption(board)}
              />
              <InfoCard label="Цена от" value={formatMoney(board.priceFrom)} />
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <TrackedStoreLink
                href={buildStoreRedirectHref(board.slug, {
                  from: "board-page",
                })}
                analyticsPayload={{
                  board_slug: board.slug,
                  placement: "board-page",
                }}
                className="inline-flex items-center justify-center rounded-full bg-[var(--color-pine)] px-6 py-4 text-sm font-bold text-white hover:-translate-y-0.5 hover:bg-[var(--color-sky-deep)]"
              >
                Перейти в магазин
              </TrackedStoreLink>
              <Link
                href="/quiz"
                className="inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-white px-6 py-4 text-sm font-bold text-[var(--color-pine)] hover:border-[var(--color-sky)]"
              >
                Проверить по своим параметрам
              </Link>
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <section className="panel p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--color-sky-deep)]">
                  Наличие
                </p>
                <p className="mt-4 text-2xl font-bold text-[var(--color-ink)]">
                  {availabilityHeadline}
                </p>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-muted)]">
                  {availabilityDescription}
                </p>
              </div>

              <span
                className={`inline-flex w-fit items-center justify-center rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] ${
                  hasAvailableSizes
                    ? "bg-[rgba(21,94,65,0.10)] text-[var(--color-pine)]"
                    : "bg-[rgba(160,92,45,0.12)] text-[rgb(142,76,28)]"
                }`}
              >
                {hasAvailableSizes ? "Доступно сейчас" : "Нужно уточнение"}
              </span>
            </div>
          </section>

          <section className="panel p-6">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--color-sky-deep)]">
              Размерная сетка
            </p>
            <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
              Показываем полную размерную сетку модели и отдельно отмечаем,
              какие размеры доступны сейчас.
            </p>
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-[var(--color-muted)]">
                  <tr>
                    <th className="pb-3 pr-6 font-semibold">Размер</th>
                    <th className="pb-3 pr-6 font-semibold">Waist</th>
                    <th className="pb-3 pr-6 font-semibold">Ширина</th>
                    <th className="pb-3 pr-6 font-semibold">Вес райдера</th>
                    <th className="pb-3 font-semibold">Наличие</th>
                  </tr>
                </thead>
                <tbody>
                  {board.sizes.map((size) => (
                    <tr
                      key={`${board.id}-${getBoardSizeLabel(size)}`}
                      className="border-t border-[var(--color-border)]"
                    >
                      <td className="py-3 pr-6 font-semibold">
                        {getBoardSizeLabel(size)}
                      </td>
                      <td className="py-3 pr-6">{size.waistWidthMm} мм</td>
                      <td className="py-3 pr-6">{widthTypeLabels[size.widthType]}</td>
                      <td className="py-3 pr-6">
                        {formatRecommendedWeightRange(size)}
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${
                            size.isAvailable
                              ? "bg-[rgba(21,94,65,0.10)] text-[var(--color-pine)]"
                              : "bg-[rgba(160,92,45,0.12)] text-[rgb(142,76,28)]"
                          }`}
                        >
                          {size.isAvailable ? "в наличии" : "нет сейчас"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel p-6">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--color-sky-deep)]">
              Кому подойдёт
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-[var(--color-muted)]">
              {board.scenarios.map((scenario) => (
                <li key={scenario}>{scenario}</li>
              ))}
            </ul>
          </section>

          <section className="panel p-6">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--color-sky-deep)]">
              Кому не подойдёт
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-[var(--color-muted)]">
              {board.notIdealFor.map((scenario) => (
                <li key={scenario}>{scenario}</li>
              ))}
            </ul>
          </section>

          {board.sourceName && board.sourceUrl ? (
            <section className="panel p-6">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--color-sky-deep)]">
                Источник характеристик
              </p>
              <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
                Данные по размерам и ширине сверялись с источником:
                {" "}
                {board.sourceName}
                {sourceCheckedAtLabel
                  ? `, проверка от ${sourceCheckedAtLabel}`
                  : ""}
                .
              </p>
              <a
                href={board.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--color-pine)] hover:border-[var(--color-sky)]"
              >
                Открыть источник
              </a>
            </section>
          ) : null}
        </div>
      </section>

      <section className="mt-12">
        <div className="mb-6">
          <span className="eyebrow">Похожие модели</span>
          <h2 className="heading-display mt-4 text-3xl font-bold sm:text-4xl">
            Что ещё посмотреть рядом
          </h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {relatedBoards.map((relatedBoard) => (
            <BoardCard
              key={relatedBoard.id}
              product={relatedBoard}
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
    </div>
  );
}

function getBoardStiffnessValue(board: BoardPageProduct) {
  if (board.dataStatus === "verified") {
    return `${board.flex} из 10`;
  }

  return "Требует перепроверки";
}

function getBoardStiffnessCaption(board: BoardPageProduct) {
  if (board.dataStatus === "verified") {
    return null;
  }

  return "Магазин не даёт надёжной точной оценки, поэтому число пока не показываем.";
}

function InfoCard({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption?: string | null;
}) {
  return (
    <div className="rounded-[1.2rem] border border-[var(--color-border)] bg-white/82 p-4">
      <p className="text-sm text-[var(--color-muted)]">{label}</p>
      <p className="mt-2 text-lg font-bold">{value}</p>
      {caption ? (
        <p className="mt-2 text-xs leading-6 text-[var(--color-muted)]">
          {caption}
        </p>
      ) : null}
    </div>
  );
}

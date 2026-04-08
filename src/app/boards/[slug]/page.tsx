import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrackedStoreLink } from "@/components/analytics/tracked-store-link";
import { BoardCard } from "@/components/boards/board-card";
import { getBoardSizeLabel } from "@/lib/board-size";
import { formatCatalogCheckedDate } from "@/lib/catalog-trust";
import {
  boardShapeLabels,
  formatMoney,
  ridingStyleLabels,
  skillLevelLabels,
  widthTypeLabels,
} from "@/lib/content";
import { buildStoreRedirectHref } from "@/lib/store-redirect";
import { formatRecommendedWeightRange } from "@/lib/weight-range";
import {
  получитьВсеМодели,
  получитьМодельПоСлагу,
  получитьПохожиеМодели,
} from "@/lib/products";

interface BoardPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const модели = await получитьВсеМодели();

  return модели.map((модель) => ({
    slug: модель.slug,
  }));
}

export async function generateMetadata({
  params,
}: BoardPageProps): Promise<Metadata> {
  const { slug } = await params;
  const board = await получитьМодельПоСлагу(slug);

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
  const board = await получитьМодельПоСлагу(slug);

  if (!board) {
    notFound();
  }

  const похожиеМодели = await получитьПохожиеМодели(slug);
  const sourceCheckedAtLabel = formatCatalogCheckedDate(board.sourceCheckedAt);

  return (
    <div className="container-shell py-12 sm:py-16">
      <section className="grid gap-8 xl:grid-cols-[1fr_0.95fr]">
        <div className="panel overflow-hidden p-6 sm:p-8">
          <span className="eyebrow">{board.brand}</span>
          <h1 className="heading-display mt-4 text-4xl font-bold text-balance sm:text-5xl">
            {board.modelName}
          </h1>
          <p className="mt-4 text-base leading-8 text-[var(--color-muted)] sm:text-lg">
            {board.descriptionFull}
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <InfoCard label="Стиль" value={ridingStyleLabels[board.ridingStyle]} />
            <InfoCard label="Уровень" value={skillLevelLabels[board.skillLevel]} />
            <InfoCard
              label="Форма"
              value={
                board.shapeType ? boardShapeLabels[board.shapeType] : "Уточняется"
              }
            />
            <InfoCard label="Flex" value={`${board.flex} / 10`} />
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
        </div>

        <div className="space-y-5">
          <section className="panel p-6">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--color-sky-deep)]">
              Размерная сетка
            </p>
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-[var(--color-muted)]">
                  <tr>
                    <th className="pb-3 pr-6 font-semibold">Размер</th>
                    <th className="pb-3 pr-6 font-semibold">Waist</th>
                    <th className="pb-3 pr-6 font-semibold">Ширина</th>
                    <th className="pb-3 font-semibold">Вес райдера</th>
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
                      <td className="py-3">{formatRecommendedWeightRange(size)}</td>
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
                Данные по размерам и ширине сверялись с источником: {board.sourceName}
                {sourceCheckedAtLabel ? `, проверка от ${sourceCheckedAtLabel}` : ""}.
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
          {похожиеМодели.map((relatedBoard) => (
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

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.2rem] border border-[var(--color-border)] bg-white/82 p-4">
      <p className="text-sm text-[var(--color-muted)]">{label}</p>
      <p className="mt-2 text-lg font-bold">{value}</p>
    </div>
  );
}

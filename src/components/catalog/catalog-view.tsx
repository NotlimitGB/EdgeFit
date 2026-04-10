"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { BoardCard } from "@/components/boards/board-card";
import {
  boardShapeLabels,
  ridingStyleLabels,
  skillLevelLabels,
  widthTypeLabels,
} from "@/lib/content";
import {
  getAvailableSizeCount,
  getAvailableSizes,
} from "@/lib/product-availability";
import type {
  BoardShape,
  Product,
  RidingStyle,
  SkillLevel,
  WidthType,
} from "@/types/domain";

interface CatalogViewProps {
  boards: Product[];
}

type SortKey =
  | "featured"
  | "price-asc"
  | "price-desc"
  | "beginners"
  | "big-boots"
  | "fresh";

const PAGE_SIZE = 24;

const boardLineLabels: Record<Product["boardLine"] | "all", string> = {
  all: "Любая линейка",
  men: "Мужская",
  women: "Женская",
  unisex: "Унисекс",
};

function getFilterSizes(board: Product) {
  const availableSizes = getAvailableSizes(board);
  return availableSizes.length > 0 ? availableSizes : board.sizes;
}

function getPrimaryWidthType(board: Product): WidthType {
  const widthTypes = getFilterSizes(board).map((size) => size.widthType);

  if (widthTypes.includes("wide")) {
    return "wide";
  }

  if (widthTypes.includes("mid-wide")) {
    return "mid-wide";
  }

  return "regular";
}

function compareByFeatured(left: Product, right: Product) {
  const verifiedDelta =
    Number(right.dataStatus === "verified") - Number(left.dataStatus === "verified");

  if (verifiedDelta !== 0) {
    return verifiedDelta;
  }

  const availableDelta = getAvailableSizeCount(right) - getAvailableSizeCount(left);
  if (availableDelta !== 0) {
    return availableDelta;
  }

  const freshnessDelta = String(right.sourceCheckedAt ?? "").localeCompare(
    String(left.sourceCheckedAt ?? ""),
    "ru",
  );
  if (freshnessDelta !== 0) {
    return freshnessDelta;
  }

  if (left.priceFrom !== right.priceFrom) {
    return left.priceFrom - right.priceFrom;
  }

  return `${left.brand} ${left.modelName}`.localeCompare(
    `${right.brand} ${right.modelName}`,
    "ru",
  );
}

function hasNonRegularWidth(board: Product) {
  return getFilterSizes(board).some((size) => size.widthType !== "regular");
}

export function CatalogView({ boards }: CatalogViewProps) {
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("all");
  const [style, setStyle] = useState<"all" | RidingStyle>("all");
  const [skill, setSkill] = useState<"all" | SkillLevel>("all");
  const [shape, setShape] = useState<"all" | BoardShape>("all");
  const [boardLine, setBoardLine] = useState<"all" | Product["boardLine"]>("all");
  const [width, setWidth] = useState<"all" | WidthType>("all");
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [sort, setSort] = useState<SortKey>("featured");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const deferredQuery = useDeferredValue(query);

  function resetVisibleCount() {
    setVisibleCount(PAGE_SIZE);
  }

  const brandOptions = useMemo(() => {
    const brands = Array.from(
      new Set(boards.map((board) => board.brand.trim()).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right, "ru"));

    return [{ value: "all", label: "Любой бренд" }, ...brands.map((value) => ({
      value,
      label: value,
    }))];
  }, [boards]);

  const filteredBoards = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    return boards
      .filter((board) => {
        if (!normalizedQuery) {
          return true;
        }

        const haystack =
          `${board.brand} ${board.modelName} ${board.slug}`.toLowerCase();

        return haystack.includes(normalizedQuery);
      })
      .filter((board) => (brand === "all" ? true : board.brand === brand))
      .filter((board) => (style === "all" ? true : board.ridingStyle === style))
      .filter((board) => (skill === "all" ? true : board.skillLevel === skill))
      .filter((board) => (shape === "all" ? true : board.shapeType === shape))
      .filter((board) => (boardLine === "all" ? true : board.boardLine === boardLine))
      .filter((board) => {
        if (width === "all") {
          return true;
        }

        return getFilterSizes(board).some((size) => size.widthType === width);
      })
      .filter((board) => (onlyVerified ? board.dataStatus === "verified" : true))
      .sort((left, right) => {
        if (sort === "price-asc") {
          return left.priceFrom - right.priceFrom;
        }

        if (sort === "price-desc") {
          return right.priceFrom - left.priceFrom;
        }

        if (sort === "beginners") {
          const skillRank: Record<SkillLevel, number> = {
            beginner: 0,
            intermediate: 1,
            advanced: 2,
          };

          const rankDelta =
            skillRank[left.skillLevel] - skillRank[right.skillLevel];

          return rankDelta !== 0
            ? rankDelta
            : compareByFeatured(left, right);
        }

        if (sort === "big-boots") {
          const widthDelta =
            Number(hasNonRegularWidth(right)) - Number(hasNonRegularWidth(left));

          return widthDelta !== 0
            ? widthDelta
            : compareByFeatured(left, right);
        }

        if (sort === "fresh") {
          const freshnessDelta = String(right.sourceCheckedAt ?? "").localeCompare(
            String(left.sourceCheckedAt ?? ""),
            "ru",
          );

          return freshnessDelta !== 0
            ? freshnessDelta
            : compareByFeatured(left, right);
        }

        return compareByFeatured(left, right);
      });
  }, [
    boards,
    brand,
    style,
    skill,
    shape,
    boardLine,
    width,
    onlyVerified,
    sort,
    deferredQuery,
  ]);

  const visibleBoards = filteredBoards.slice(0, visibleCount);
  const totalBrands = brandOptions.length - 1;
  const verifiedCount = filteredBoards.filter(
    (board) => board.dataStatus === "verified",
  ).length;
  const withWideOptionsCount = filteredBoards.filter(hasNonRegularWidth).length;
  const hasActiveFilters =
    query.trim().length > 0 ||
    brand !== "all" ||
    style !== "all" ||
    skill !== "all" ||
    shape !== "all" ||
    boardLine !== "all" ||
    width !== "all" ||
    onlyVerified ||
    sort !== "featured";

  function resetFilters() {
    setQuery("");
    setBrand("all");
    setStyle("all");
    setSkill("all");
    setShape("all");
    setBoardLine("all");
    setWidth("all");
    setOnlyVerified(false);
    setSort("featured");
    resetVisibleCount();
  }

  return (
    <div className="space-y-8">
      <section className="panel p-5 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
          <label className="xl:col-span-1">
            <span className="mb-2 block text-sm font-semibold">Поиск по каталогу</span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                resetVisibleCount();
              }}
              placeholder="Например, Jones Mountain Twin"
              className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 outline-none focus:border-[var(--color-sky)]"
            />
          </label>

            <SelectField
              label="Бренд"
              value={brand}
              onChange={(value) => {
                setBrand(value);
                resetVisibleCount();
              }}
              options={brandOptions}
            />
            <SelectField
              label="Стиль"
              value={style}
              onChange={(value) => {
                setStyle(value);
                resetVisibleCount();
              }}
              options={[
              { value: "all", label: "Все стили" },
              { value: "all-mountain", label: ridingStyleLabels["all-mountain"] },
              { value: "park", label: ridingStyleLabels.park },
              { value: "freeride", label: ridingStyleLabels.freeride },
            ]}
          />
            <SelectField
              label="Сортировка"
              value={sort}
              onChange={(value) => {
                setSort(value);
                resetVisibleCount();
              }}
              options={[
              { value: "featured", label: "Сначала сильные карточки" },
              { value: "fresh", label: "Сначала свежо проверенные" },
              { value: "price-asc", label: "Сначала дешевле" },
              { value: "price-desc", label: "Сначала дороже" },
              { value: "beginners", label: "Лучше для новичков" },
              { value: "big-boots", label: "Для больших ботинок" },
            ]}
          />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SelectField
              label="Уровень"
              value={skill}
              onChange={(value) => {
                setSkill(value);
                resetVisibleCount();
              }}
              options={[
              { value: "all", label: "Любой уровень" },
              { value: "beginner", label: skillLevelLabels.beginner },
              { value: "intermediate", label: skillLevelLabels.intermediate },
              { value: "advanced", label: skillLevelLabels.advanced },
            ]}
          />
            <SelectField
              label="Линейка"
              value={boardLine}
              onChange={(value) => {
                setBoardLine(value);
                resetVisibleCount();
              }}
              options={[
              { value: "all", label: boardLineLabels.all },
              { value: "men", label: boardLineLabels.men },
              { value: "women", label: boardLineLabels.women },
              { value: "unisex", label: boardLineLabels.unisex },
            ]}
          />
            <SelectField
              label="Форма"
              value={shape}
              onChange={(value) => {
                setShape(value);
                resetVisibleCount();
              }}
              options={[
              { value: "all", label: "Любая форма" },
              { value: "twin", label: boardShapeLabels.twin },
              { value: "asym-twin", label: boardShapeLabels["asym-twin"] },
              {
                value: "directional-twin",
                label: boardShapeLabels["directional-twin"],
              },
              { value: "directional", label: boardShapeLabels.directional },
              {
                value: "tapered-directional",
                label: boardShapeLabels["tapered-directional"],
              },
            ]}
          />
          <label className="flex items-end">
            <span className="flex w-full items-center justify-between rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3">
              <span>
                <span className="block text-sm font-semibold">Только проверенные</span>
                <span className="mt-1 block text-xs text-[var(--color-muted)]">
                  Сначала более надёжные карточки
                </span>
              </span>
              <input
                type="checkbox"
                checked={onlyVerified}
                onChange={(event) => {
                  setOnlyVerified(event.target.checked);
                  resetVisibleCount();
                }}
                className="h-5 w-5 accent-[var(--color-pine)]"
              />
            </span>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          {(["all", "regular", "mid-wide", "wide"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setWidth(option);
                resetVisibleCount();
              }}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                width === option
                  ? "bg-[var(--color-pine)] text-white"
                  : "border border-[var(--color-border)] bg-white text-[var(--color-muted)] hover:border-[var(--color-sky)] hover:text-[var(--color-sky-deep)]"
              }`}
            >
              {option === "all" ? "Все по ширине" : widthTypeLabels[option]}
            </button>
          ))}

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-pine)] hover:border-[var(--color-sky)] hover:text-[var(--color-sky-deep)]"
            >
              Сбросить всё
            </button>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="В выдаче сейчас"
          value={String(filteredBoards.length)}
          note="после текущих фильтров"
        />
        <StatCard
          label="Брендов"
          value={String(totalBrands)}
          note="в живом каталоге"
        />
        <StatCard
          label="Проверенных"
          value={String(verifiedCount)}
          note="в текущей выдаче"
        />
        <StatCard
          label="С wide / mid-wide"
          value={String(withWideOptionsCount)}
          note="есть запас по ширине"
        />
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-sky-deep)]">
              Каталог
            </p>
            <h2 className="heading-display mt-2 text-3xl font-bold sm:text-4xl">
              {filteredBoards.length} моделей в рабочей выдаче
            </h2>
          </div>
          <p className="hidden max-w-md text-right text-sm leading-6 text-[var(--color-muted)] md:block">
            Каталог теперь показывает только верхнюю часть выдачи и догружается по
            кнопке, чтобы не пытаться сразу рендерить сотни карточек разом.
          </p>
        </div>

        {filteredBoards.length === 0 ? (
          <div className="panel p-8">
            <p className="text-lg font-bold text-[var(--color-ink)]">
              Ничего не нашлось под текущие фильтры
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-muted)]">
              Попробуй убрать часть ограничений или начать с поиска только по бренду
              и стилю. Каталог сейчас большой, и слишком узкая комбинация фильтров
              легко даёт пустой экран.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-5 inline-flex items-center justify-center rounded-full bg-[var(--color-pine)] px-5 py-3 text-sm font-bold text-white hover:-translate-y-0.5 hover:bg-[var(--color-sky-deep)]"
            >
              Сбросить фильтры
            </button>
          </div>
        ) : (
          <>
            <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
              {visibleBoards.map((board) => (
                <BoardCard
                  key={board.id}
                  product={board}
                  eyebrow={widthTypeLabels[getPrimaryWidthType(board)]}
                />
              ))}
            </div>

            {visibleBoards.length < filteredBoards.length ? (
              <div className="mt-8 flex flex-col items-center gap-3">
                <p className="text-sm leading-6 text-[var(--color-muted)]">
                  Показано {visibleBoards.length} из {filteredBoards.length}
                </p>
                <button
                  type="button"
                  onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
                  className="inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-white px-5 py-3 text-sm font-bold text-[var(--color-pine)] hover:border-[var(--color-sky)] hover:text-[var(--color-sky-deep)]"
                >
                  Показать ещё {Math.min(PAGE_SIZE, filteredBoards.length - visibleBoards.length)}
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}

function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: SelectFieldProps<T>) {
  return (
    <label>
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 outline-none focus:border-[var(--color-sky)]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="panel p-5">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-sky-deep)]">
        {label}
      </p>
      <p className="heading-display mt-3 text-4xl font-bold text-[var(--color-ink)]">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">{note}</p>
    </div>
  );
}

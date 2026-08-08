"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { BoardCard } from "@/components/boards/board-card";
import publicStyles from "@/components/public/public-ui.module.css";
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
import styles from "./catalog.module.css";

interface CatalogViewProps {
  boards: Product[];
}

type SortKey = "default" | "price-asc" | "price-desc";

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

export function CatalogView({ boards }: CatalogViewProps) {
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("all");
  const [style, setStyle] = useState<"all" | RidingStyle>("all");
  const [skill, setSkill] = useState<"all" | SkillLevel>("all");
  const [shape, setShape] = useState<"all" | BoardShape>("all");
  const [boardLine, setBoardLine] = useState<"all" | Product["boardLine"]>("all");
  const [width, setWidth] = useState<"all" | WidthType>("all");
  const [sort, setSort] = useState<SortKey>("default");
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
      .sort((left, right) => {
        if (sort === "price-asc") {
          return left.priceFrom - right.priceFrom;
        }

        if (sort === "price-desc") {
          return right.priceFrom - left.priceFrom;
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
    sort,
    deferredQuery,
  ]);

  const visibleBoards = filteredBoards.slice(0, visibleCount);
  const activeFilterCount = [
    query.trim().length > 0,
    brand !== "all",
    style !== "all",
    skill !== "all",
    shape !== "all",
    boardLine !== "all",
    width !== "all",
  ].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0 || sort !== "default";

  function resetFilters() {
    setQuery("");
    setBrand("all");
    setStyle("all");
    setSkill("all");
    setShape("all");
    setBoardLine("all");
    setWidth("all");
    setSort("default");
    resetVisibleCount();
  }

  return (
    <div className={styles.catalogView}>
      <section
        className={`${publicStyles.raisedTechnicalSurface} ${styles.filters}`}
        aria-labelledby="catalog-filters-title"
      >
        <div className={styles.filtersHeader}>
          <div>
            <p className={publicStyles.microLabel}>Фильтры моделей</p>
            <h2 id="catalog-filters-title">Сузь каталог до нужного сценария</h2>
          </div>
          <p className={styles.activeFilterCount}>
            {activeFilterCount > 0
              ? `Активных фильтров: ${activeFilterCount}`
              : "Без ограничений"}
          </p>
        </div>

        <div className={styles.primaryFilters}>
          <label className={`${styles.field} ${styles.searchField}`}>
            <span>Поиск по каталогу</span>
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                resetVisibleCount();
              }}
              placeholder="Например, Jones Mountain Twin"
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
            label="Сортировка"
            value={sort}
            onChange={(value) => {
              setSort(value);
              resetVisibleCount();
            }}
            options={[
              { value: "default", label: "По умолчанию" },
              { value: "price-asc", label: "Сначала дешевле" },
              { value: "price-desc", label: "Сначала дороже" },
            ]}
          />
        </div>

        <div className={styles.secondaryFilters}>
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
        </div>

        <fieldset className={styles.widthFieldset}>
          <legend>Ширина</legend>
          <div className={styles.widthControls}>
            <div className={styles.widthOptions}>
              {(["all", "regular", "mid-wide", "wide"] as const).map(
                (option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={width === option}
                    onClick={() => {
                      setWidth(option);
                      resetVisibleCount();
                    }}
                    className={styles.widthOption}
                  >
                    {option === "all"
                      ? "Все по ширине"
                      : widthTypeLabels[option]}
                  </button>
                ),
              )}
            </div>

            {hasActiveFilters ? (
              <button
                type="button"
                onClick={resetFilters}
                className={styles.resetButton}
              >
                Сбросить всё
              </button>
            ) : null}
          </div>
        </fieldset>
      </section>

      <section className={styles.results} aria-labelledby="catalog-results-title">
        <div className={styles.resultsHeader}>
          <div>
            <p className={publicStyles.kicker}>Выдача каталога</p>
            <h2 id="catalog-results-title">
              <span aria-live="polite" aria-atomic="true">
                {filteredBoards.length}
              </span>{" "}
              моделей для сравнения
            </h2>
          </div>
          <p>
            Сравнивай свойства самих досок. Подходящую именно тебе ростовку и
            ширину проверяй через персональный подбор.
          </p>
        </div>

        {filteredBoards.length === 0 ? (
          <div
            className={`${publicStyles.raisedTechnicalSurface} ${styles.emptyState}`}
          >
            <p className={publicStyles.microLabel}>Нулевая выдача</p>
            <h3>Под текущие фильтры моделей не нашлось</h3>
            <p>
              Убери часть ограничений или начни с одного параметра — например,
              бренда или стиля. Это не означает, что подходящих досок нет вообще.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className={publicStyles.primaryAction}
            >
              Сбросить фильтры
            </button>
          </div>
        ) : (
          <>
            <div className={styles.boardGrid}>
              {visibleBoards.map((board) => (
                <BoardCard
                  key={board.id}
                  product={board}
                  eyebrow={widthTypeLabels[getPrimaryWidthType(board)]}
                  variant="catalog"
                />
              ))}
            </div>

            {visibleBoards.length < filteredBoards.length ? (
              <div className={styles.loadMore}>
                <p>
                  Показано {visibleBoards.length} из {filteredBoards.length}
                </p>
                <button
                  type="button"
                  onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
                  className={publicStyles.secondaryAction}
                >
                  Показать ещё{" "}
                  {Math.min(
                    PAGE_SIZE,
                    filteredBoards.length - visibleBoards.length,
                  )}
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
    <label className={styles.field}>
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
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

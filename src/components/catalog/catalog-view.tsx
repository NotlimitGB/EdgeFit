"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  Product,
  WidthType,
} from "@/types/domain";
import {
  buildCatalogSearchParams,
  CATALOG_DEFAULT_STATE,
  getCatalogStateKey,
  parseCatalogState,
  type CatalogUrlState,
} from "./catalog-state";
import styles from "./catalog.module.css";

interface CatalogViewProps {
  boards: Product[];
}

const PAGE_SIZE = 24;
const VISIBLE_COUNT_STORAGE_KEY = "edgefit:catalog-visible-count:v1";

interface StoredVisibleCount {
  stateKey: string;
  visibleCount: number;
}

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

function readStoredVisibleCount(): StoredVisibleCount | null {
  try {
    const rawValue = window.sessionStorage.getItem(VISIBLE_COUNT_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }

    const storedValue = JSON.parse(rawValue) as Partial<StoredVisibleCount>;
    if (
      typeof storedValue.stateKey !== "string" ||
      !Number.isInteger(storedValue.visibleCount) ||
      (storedValue.visibleCount ?? 0) < PAGE_SIZE
    ) {
      return null;
    }

    return storedValue as StoredVisibleCount;
  } catch {
    return null;
  }
}

function writeStoredVisibleCount(stateKey: string, visibleCount: number) {
  try {
    window.sessionStorage.setItem(
      VISIBLE_COUNT_STORAGE_KEY,
      JSON.stringify({ stateKey, visibleCount } satisfies StoredVisibleCount),
    );
  } catch {
    // Catalog navigation remains functional when storage is unavailable.
  }
}

export function CatalogView({ boards }: CatalogViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const serializedSearchParams = searchParams.toString();

  const brandOptions = useMemo(() => {
    const brands = Array.from(
      new Set(boards.map((board) => board.brand.trim()).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right, "ru"));

    return [{ value: "all", label: "Любой бренд" }, ...brands.map((value) => ({
      value,
      label: value,
    }))];
  }, [boards]);
  const brandValues = useMemo(
    () => brandOptions.slice(1).map((option) => option.value),
    [brandOptions],
  );
  const urlCatalogState = useMemo(
    () =>
      parseCatalogState(
        new URLSearchParams(serializedSearchParams),
        brandValues,
      ),
    [brandValues, serializedSearchParams],
  );
  const urlStateSnapshot = `${serializedSearchParams}\u0000${brandValues.join("\u0000")}`;
  const [catalogState, setCatalogState] = useState<CatalogUrlState>(urlCatalogState);
  const [catalogStateSnapshot, setCatalogStateSnapshot] =
    useState(urlStateSnapshot);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  if (catalogStateSnapshot !== urlStateSnapshot) {
    setCatalogStateSnapshot(urlStateSnapshot);
    setCatalogState(urlCatalogState);
  }

  const { q: query, brand, style, skill, shape, line: boardLine, width, sort } =
    catalogState;
  const deferredQuery = useDeferredValue(query);

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

  const catalogStateKey = getCatalogStateKey(catalogState);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const storedVisibleCount = readStoredVisibleCount();

      if (storedVisibleCount?.stateKey !== catalogStateKey) {
        setVisibleCount(PAGE_SIZE);
        return;
      }

      const clampedVisibleCount = Math.min(
        storedVisibleCount.visibleCount,
        Math.max(PAGE_SIZE, filteredBoards.length),
      );

      setVisibleCount(clampedVisibleCount);
      if (clampedVisibleCount !== storedVisibleCount.visibleCount) {
        writeStoredVisibleCount(catalogStateKey, clampedVisibleCount);
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [catalogStateKey, filteredBoards.length]);

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

  function replaceCatalogState(nextState: CatalogUrlState) {
    const nextSearchParams = buildCatalogSearchParams(
      new URLSearchParams(serializedSearchParams),
      nextState,
    );
    const normalizedState = parseCatalogState(nextSearchParams, brandValues);
    const normalizedStateKey = getCatalogStateKey(normalizedState);
    const nextSearch = nextSearchParams.toString();

    setCatalogState(normalizedState);
    setVisibleCount(PAGE_SIZE);
    writeStoredVisibleCount(normalizedStateKey, PAGE_SIZE);

    if (nextSearch !== serializedSearchParams) {
      router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname, {
        scroll: false,
      });
    }
  }

  function updateCatalogState(patch: Partial<CatalogUrlState>) {
    replaceCatalogState({ ...catalogState, ...patch });
  }

  function resetFilters() {
    replaceCatalogState({ ...CATALOG_DEFAULT_STATE });
  }

  function loadMoreBoards() {
    const nextVisibleCount = Math.min(
      visibleCount + PAGE_SIZE,
      filteredBoards.length,
    );

    setVisibleCount(nextVisibleCount);
    writeStoredVisibleCount(catalogStateKey, nextVisibleCount);
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
              onChange={(event) => updateCatalogState({ q: event.target.value })}
              placeholder="Например, Jones Mountain Twin"
            />
          </label>

          <SelectField
            label="Бренд"
            value={brand}
            onChange={(value) => updateCatalogState({ brand: value })}
            options={brandOptions}
          />
          <SelectField
            label="Сортировка"
            value={sort}
            onChange={(value) => updateCatalogState({ sort: value })}
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
            onChange={(value) => updateCatalogState({ style: value })}
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
            onChange={(value) => updateCatalogState({ skill: value })}
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
            onChange={(value) => updateCatalogState({ line: value })}
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
            onChange={(value) => updateCatalogState({ shape: value })}
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
                    onClick={() => updateCatalogState({ width: option })}
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
                  onClick={loadMoreBoards}
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

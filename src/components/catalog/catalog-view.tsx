"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  BoardShape,
  Product,
  RidingStyle,
  SkillLevel,
  WidthType,
} from "@/types/domain";
import {
  buildCatalogSearchParams,
  CATALOG_BOARD_LINES,
  CATALOG_BOARD_SHAPES,
  CATALOG_DEFAULT_STATE,
  CATALOG_RIDING_STYLES,
  CATALOG_SKILL_LEVELS,
  CATALOG_WIDTH_TYPES,
  getCatalogStateKey,
  parseCatalogState,
  toggleCatalogValue,
  type CatalogUrlState,
} from "./catalog-state";
import styles from "./catalog.module.css";

interface CatalogViewProps {
  boards: Product[];
}

const PAGE_SIZE = 24;
const VISIBLE_COUNT_STORAGE_KEY = "edgefit:catalog-visible-count:v2";

type MultiSelectKey = "style" | "skill" | "line" | "shape";

interface StoredVisibleCount {
  stateKey: string;
  visibleCount: number;
}

const boardLineLabels: Record<Product["boardLine"], string> = {
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
  const [catalogState, setCatalogState] = useState<CatalogUrlState>(urlCatalogState);
  const catalogStateRef = useRef(catalogState);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [openMultiSelect, setOpenMultiSelect] =
    useState<MultiSelectKey | null>(null);
  const desiredSearchRef = useRef<string | null>(null);
  const inFlightSearchRef = useRef<string | null>(null);

  useEffect(() => {
    const inFlightSearch = inFlightSearchRef.current;

    if (inFlightSearch !== null && serializedSearchParams !== inFlightSearch) {
      return;
    }

    if (inFlightSearch !== null) {
      const desiredSearch = desiredSearchRef.current ?? inFlightSearch;

      if (desiredSearch !== serializedSearchParams) {
        inFlightSearchRef.current = desiredSearch;
        router.replace(
          desiredSearch ? `${pathname}?${desiredSearch}` : pathname,
          { scroll: false },
        );
        return;
      }

      inFlightSearchRef.current = null;
      desiredSearchRef.current = null;
    }

    catalogStateRef.current = urlCatalogState;
    const synchronizationId = window.setTimeout(() => {
      setCatalogState(urlCatalogState);
    }, 0);

    return () => window.clearTimeout(synchronizationId);
  }, [pathname, router, serializedSearchParams, urlCatalogState]);

  const {
    q: query,
    brand,
    styles: selectedStyles,
    skills: selectedSkills,
    shapes: selectedShapes,
    lines: selectedLines,
    widths: selectedWidths,
    sort,
  } = catalogState;
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
      .filter((board) =>
        selectedStyles.length === 0
          ? true
          : selectedStyles.includes(board.ridingStyle),
      )
      .filter((board) =>
        selectedSkills.length === 0
          ? true
          : selectedSkills.includes(board.skillLevel),
      )
      .filter((board) =>
        selectedShapes.length === 0
          ? true
          : board.shapeType !== null && selectedShapes.includes(board.shapeType),
      )
      .filter((board) =>
        selectedLines.length === 0
          ? true
          : selectedLines.includes(board.boardLine),
      )
      .filter((board) => {
        if (selectedWidths.length === 0) {
          return true;
        }

        return getFilterSizes(board).some((size) =>
          selectedWidths.includes(size.widthType),
        );
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
    selectedStyles,
    selectedSkills,
    selectedShapes,
    selectedLines,
    selectedWidths,
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
    selectedStyles.length > 0,
    selectedSkills.length > 0,
    selectedShapes.length > 0,
    selectedLines.length > 0,
    selectedWidths.length > 0,
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

    catalogStateRef.current = normalizedState;
    setCatalogState(normalizedState);
    setVisibleCount(PAGE_SIZE);
    writeStoredVisibleCount(normalizedStateKey, PAGE_SIZE);
    desiredSearchRef.current = nextSearch;

    if (
      inFlightSearchRef.current === null &&
      nextSearch !== serializedSearchParams
    ) {
      inFlightSearchRef.current = nextSearch;
      router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname, {
        scroll: false,
      });
    } else if (
      inFlightSearchRef.current === null &&
      nextSearch === serializedSearchParams
    ) {
      desiredSearchRef.current = null;
    }
  }

  function updateCatalogState(patch: Partial<CatalogUrlState>) {
    replaceCatalogState({ ...catalogStateRef.current, ...patch });
  }

  function changeOpenMultiSelect(key: MultiSelectKey, isOpen: boolean) {
    setOpenMultiSelect((currentKey) =>
      isOpen ? key : currentKey === key ? null : currentKey,
    );
  }

  function resetFilters() {
    setOpenMultiSelect(null);
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
          <MultiSelectField<RidingStyle>
            id="style"
            label="Стиль"
            emptyLabel="Все стили"
            values={selectedStyles}
            isOpen={openMultiSelect === "style"}
            onOpenChange={(isOpen) =>
              changeOpenMultiSelect("style", isOpen)
            }
            onChange={(styles) => updateCatalogState({ styles })}
            options={CATALOG_RIDING_STYLES.map((value) => ({
              value,
              label: ridingStyleLabels[value],
            }))}
          />
          <MultiSelectField<SkillLevel>
            id="skill"
            label="Уровень"
            emptyLabel="Любой уровень"
            values={selectedSkills}
            isOpen={openMultiSelect === "skill"}
            onOpenChange={(isOpen) =>
              changeOpenMultiSelect("skill", isOpen)
            }
            onChange={(skills) => updateCatalogState({ skills })}
            options={CATALOG_SKILL_LEVELS.map((value) => ({
              value,
              label: skillLevelLabels[value],
            }))}
          />
          <MultiSelectField<Product["boardLine"]>
            id="line"
            label="Линейка"
            emptyLabel="Любая линейка"
            values={selectedLines}
            isOpen={openMultiSelect === "line"}
            onOpenChange={(isOpen) =>
              changeOpenMultiSelect("line", isOpen)
            }
            onChange={(lines) => updateCatalogState({ lines })}
            options={CATALOG_BOARD_LINES.map((value) => ({
              value,
              label: boardLineLabels[value],
            }))}
          />
          <MultiSelectField<BoardShape>
            id="shape"
            label="Форма"
            emptyLabel="Любая форма"
            values={selectedShapes}
            isOpen={openMultiSelect === "shape"}
            onOpenChange={(isOpen) =>
              changeOpenMultiSelect("shape", isOpen)
            }
            onChange={(shapes) => updateCatalogState({ shapes })}
            options={CATALOG_BOARD_SHAPES.map((value) => ({
              value,
              label: boardShapeLabels[value],
            }))}
          />
        </div>

        <fieldset className={styles.widthFieldset}>
          <legend>Ширина</legend>
          <div className={styles.widthControls}>
            <div className={styles.widthOptions}>
              <button
                type="button"
                aria-pressed={selectedWidths.length === 0}
                data-catalog-filter-action
                onClick={() => {
                  setOpenMultiSelect(null);
                  updateCatalogState({ widths: [] });
                }}
                className={styles.widthOption}
              >
                Все по ширине
              </button>
              {CATALOG_WIDTH_TYPES.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selectedWidths.includes(option)}
                  data-catalog-filter-action
                  onClick={() => {
                    setOpenMultiSelect(null);
                    updateCatalogState({
                      widths: toggleCatalogValue(
                        catalogStateRef.current.widths,
                        option,
                        CATALOG_WIDTH_TYPES,
                      ),
                    });
                  }}
                  className={styles.widthOption}
                >
                  {widthTypeLabels[option]}
                </button>
              ))}
            </div>

            {hasActiveFilters ? (
              <button
                type="button"
                onClick={resetFilters}
                data-catalog-filter-action
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

interface MultiSelectFieldProps<T extends string> {
  id: MultiSelectKey;
  label: string;
  emptyLabel: string;
  values: readonly T[];
  options: readonly { value: T; label: string }[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onChange: (values: T[]) => void;
}

function MultiSelectField<T extends string>({
  id,
  label,
  emptyLabel,
  values,
  options,
  isOpen,
  onOpenChange,
  onChange,
}: MultiSelectFieldProps<T>) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const labelId = `catalog-${id}-label`;
  const summaryId = `catalog-${id}-summary`;
  const panelId = `catalog-${id}-options`;
  const summary =
    values.length === 0
      ? emptyLabel
      : values.length === 1
        ? options.find((option) => option.value === values[0])?.label ?? emptyLabel
        : `Выбрано: ${values.length}`;
  const canonicalOrder = options.map((option) => option.value);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Element &&
        event.target.closest(
          "[data-catalog-multi-select-trigger], [data-catalog-filter-action]",
        )
      ) {
        return;
      }

      if (
        event.target instanceof Node &&
        !wrapperRef.current?.contains(event.target)
      ) {
        onOpenChange(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      onOpenChange(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onOpenChange]);

  return (
    <div
      ref={wrapperRef}
      className={`${styles.field} ${styles.multiSelectField} ${
        isOpen ? styles.multiSelectFieldOpen : ""
      }`}
      onBlur={(event) => {
        const nextFocus = event.relatedTarget;
        if (
          nextFocus instanceof Element &&
          nextFocus.closest(
            "[data-catalog-multi-select-trigger], [data-catalog-filter-action]",
          )
        ) {
          return;
        }

        if (
          isOpen &&
          (!(nextFocus instanceof Node) ||
            !event.currentTarget.contains(nextFocus))
        ) {
          onOpenChange(false);
        }
      }}
    >
      <span id={labelId}>{label}</span>
      <button
        ref={triggerRef}
        type="button"
        className={styles.multiSelectTrigger}
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-labelledby={`${labelId} ${summaryId}`}
        data-catalog-multi-select-trigger
        onClick={() => onOpenChange(!isOpen)}
      >
        <span id={summaryId}>{summary}</span>
        <span className={styles.multiSelectArrow} aria-hidden="true">
          ↓
        </span>
      </button>

      {isOpen ? (
        <div
          id={panelId}
          className={styles.multiSelectPanel}
          role="group"
          aria-labelledby={labelId}
        >
          <div className={styles.multiSelectOptions}>
            {options.map((option) => (
              <label key={option.value} className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={values.includes(option.value)}
                  onChange={() =>
                    onChange(
                      toggleCatalogValue(
                        values,
                        option.value,
                        canonicalOrder,
                      ),
                    )
                  }
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>

          {values.length > 0 ? (
            <button
              type="button"
              className={styles.groupResetButton}
              onClick={() => {
                onChange([]);
                triggerRef.current?.focus();
              }}
            >
              Снять выбор
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

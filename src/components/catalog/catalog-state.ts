import type {
  BoardShape,
  Product,
  RidingStyle,
  SkillLevel,
  WidthType,
} from "@/types/domain";

export type CatalogSort = "default" | "price-asc" | "price-desc";

export interface CatalogUrlState {
  q: string;
  brand: string;
  styles: readonly RidingStyle[];
  skills: readonly SkillLevel[];
  shapes: readonly BoardShape[];
  lines: readonly Product["boardLine"][];
  widths: readonly WidthType[];
  sort: CatalogSort;
}

export const CATALOG_DEFAULT_STATE: CatalogUrlState = {
  q: "",
  brand: "all",
  styles: [],
  skills: [],
  shapes: [],
  lines: [],
  widths: [],
  sort: "default",
};

const CATALOG_PARAM_NAMES = [
  "q",
  "brand",
  "style",
  "skill",
  "shape",
  "line",
  "width",
  "sort",
] as const;

export const CATALOG_RIDING_STYLES = [
  "all-mountain",
  "park",
  "freeride",
] as const;
export const CATALOG_SKILL_LEVELS = [
  "beginner",
  "intermediate",
  "advanced",
] as const;
export const CATALOG_BOARD_SHAPES = [
  "twin",
  "asym-twin",
  "directional-twin",
  "directional",
  "tapered-directional",
] as const;
export const CATALOG_BOARD_LINES = ["men", "women", "unisex"] as const;
export const CATALOG_WIDTH_TYPES = ["regular", "mid-wide", "wide"] as const;
const SORTS = ["price-asc", "price-desc"] as const;

function includesValue<T extends string>(
  allowedValues: readonly T[],
  value: string | null,
): value is T {
  return value !== null && allowedValues.includes(value as T);
}

function normalizeSelectedValues<T extends string>(
  values: readonly string[],
  canonicalOrder: readonly T[],
): T[] {
  const selectedValues = new Set(values);
  return canonicalOrder.filter((value) => selectedValues.has(value));
}

export function toggleCatalogValue<T extends string>(
  selected: readonly T[],
  value: T,
  canonicalOrder: readonly T[],
): T[] {
  const nextValues = new Set(selected);

  if (nextValues.has(value)) {
    nextValues.delete(value);
  } else {
    nextValues.add(value);
  }

  return canonicalOrder.filter((option) => nextValues.has(option));
}

export function parseCatalogState(
  searchParams: URLSearchParams,
  allowedBrands: readonly string[],
): CatalogUrlState {
  const q = searchParams.get("q")?.trim() ?? "";
  const brandParam = searchParams.get("brand");
  const sortParam = searchParams.get("sort");

  return {
    q,
    brand:
      brandParam !== null && allowedBrands.includes(brandParam)
        ? brandParam
        : "all",
    styles: normalizeSelectedValues(
      searchParams.getAll("style"),
      CATALOG_RIDING_STYLES,
    ),
    skills: normalizeSelectedValues(
      searchParams.getAll("skill"),
      CATALOG_SKILL_LEVELS,
    ),
    shapes: normalizeSelectedValues(
      searchParams.getAll("shape"),
      CATALOG_BOARD_SHAPES,
    ),
    lines: normalizeSelectedValues(
      searchParams.getAll("line"),
      CATALOG_BOARD_LINES,
    ),
    widths: normalizeSelectedValues(
      searchParams.getAll("width"),
      CATALOG_WIDTH_TYPES,
    ),
    sort: includesValue(SORTS, sortParam) ? sortParam : "default",
  };
}

export function buildCatalogSearchParams(
  currentSearchParams: URLSearchParams,
  state: CatalogUrlState,
): URLSearchParams {
  const nextSearchParams = new URLSearchParams(currentSearchParams);

  for (const paramName of CATALOG_PARAM_NAMES) {
    nextSearchParams.delete(paramName);
  }

  const normalizedQuery = state.q.trim();

  if (normalizedQuery) nextSearchParams.set("q", normalizedQuery);
  if (state.brand !== "all") nextSearchParams.set("brand", state.brand);
  for (const style of normalizeSelectedValues(
    state.styles,
    CATALOG_RIDING_STYLES,
  )) {
    nextSearchParams.append("style", style);
  }
  for (const skill of normalizeSelectedValues(
    state.skills,
    CATALOG_SKILL_LEVELS,
  )) {
    nextSearchParams.append("skill", skill);
  }
  for (const shape of normalizeSelectedValues(
    state.shapes,
    CATALOG_BOARD_SHAPES,
  )) {
    nextSearchParams.append("shape", shape);
  }
  for (const line of normalizeSelectedValues(
    state.lines,
    CATALOG_BOARD_LINES,
  )) {
    nextSearchParams.append("line", line);
  }
  for (const width of normalizeSelectedValues(
    state.widths,
    CATALOG_WIDTH_TYPES,
  )) {
    nextSearchParams.append("width", width);
  }
  if (state.sort !== "default") nextSearchParams.set("sort", state.sort);

  return nextSearchParams;
}

export function getCatalogStateKey(state: CatalogUrlState): string {
  const serializedState = buildCatalogSearchParams(
    new URLSearchParams(),
    state,
  ).toString();

  return serializedState || "default";
}

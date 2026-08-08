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
  style: "all" | RidingStyle;
  skill: "all" | SkillLevel;
  shape: "all" | BoardShape;
  line: "all" | Product["boardLine"];
  width: "all" | WidthType;
  sort: CatalogSort;
}

export const CATALOG_DEFAULT_STATE: CatalogUrlState = {
  q: "",
  brand: "all",
  style: "all",
  skill: "all",
  shape: "all",
  line: "all",
  width: "all",
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

const RIDING_STYLES = ["all-mountain", "park", "freeride"] as const;
const SKILL_LEVELS = ["beginner", "intermediate", "advanced"] as const;
const BOARD_SHAPES = [
  "twin",
  "asym-twin",
  "directional-twin",
  "directional",
  "tapered-directional",
] as const;
const BOARD_LINES = ["men", "women", "unisex"] as const;
const WIDTH_TYPES = ["regular", "mid-wide", "wide"] as const;
const SORTS = ["price-asc", "price-desc"] as const;

function includesValue<T extends string>(
  allowedValues: readonly T[],
  value: string | null,
): value is T {
  return value !== null && allowedValues.includes(value as T);
}

export function parseCatalogState(
  searchParams: URLSearchParams,
  allowedBrands: readonly string[],
): CatalogUrlState {
  const q = searchParams.get("q")?.trim() ?? "";
  const brandParam = searchParams.get("brand");
  const styleParam = searchParams.get("style");
  const skillParam = searchParams.get("skill");
  const shapeParam = searchParams.get("shape");
  const lineParam = searchParams.get("line");
  const widthParam = searchParams.get("width");
  const sortParam = searchParams.get("sort");

  return {
    q,
    brand:
      brandParam !== null && allowedBrands.includes(brandParam)
        ? brandParam
        : "all",
    style: includesValue(RIDING_STYLES, styleParam) ? styleParam : "all",
    skill: includesValue(SKILL_LEVELS, skillParam) ? skillParam : "all",
    shape: includesValue(BOARD_SHAPES, shapeParam) ? shapeParam : "all",
    line: includesValue(BOARD_LINES, lineParam) ? lineParam : "all",
    width: includesValue(WIDTH_TYPES, widthParam) ? widthParam : "all",
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
  if (state.style !== "all") nextSearchParams.set("style", state.style);
  if (state.skill !== "all") nextSearchParams.set("skill", state.skill);
  if (state.shape !== "all") nextSearchParams.set("shape", state.shape);
  if (state.line !== "all") nextSearchParams.set("line", state.line);
  if (state.width !== "all") nextSearchParams.set("width", state.width);
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

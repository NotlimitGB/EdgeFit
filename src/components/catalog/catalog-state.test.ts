import { describe, expect, it } from "vitest";
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

const brands = ["Burton", "YES.", "Jones"];

describe("catalog state", () => {
  it("uses empty multi-select arrays for an empty query string", () => {
    expect(parseCatalogState(new URLSearchParams(), brands)).toEqual(
      CATALOG_DEFAULT_STATE,
    );
  });

  it("keeps old single-value URLs compatible", () => {
    const state = parseCatalogState(
      new URLSearchParams("skill=intermediate&style=freeride&width=wide"),
      brands,
    );

    expect(state.skills).toEqual(["intermediate"]);
    expect(state.styles).toEqual(["freeride"]);
    expect(state.widths).toEqual(["wide"]);
  });

  it("parses repeated values in canonical order", () => {
    const state = parseCatalogState(
      new URLSearchParams("skill=advanced&skill=intermediate"),
      brands,
    );

    expect(state.skills).toEqual(["intermediate", "advanced"]);
  });

  it("deduplicates repeated owned values", () => {
    const state = parseCatalogState(
      new URLSearchParams("skill=advanced&skill=advanced"),
      brands,
    );

    expect(state.skills).toEqual(["advanced"]);
  });

  it("ignores invalid repeated values while retaining valid values", () => {
    const state = parseCatalogState(
      new URLSearchParams(
        "skill=advanced&skill=banana&skill=intermediate&width=mega&width=regular",
      ),
      brands,
    );

    expect(state.skills).toEqual(["intermediate", "advanced"]);
    expect(state.widths).toEqual(["regular"]);
  });

  it("serializes multi-values in canonical order", () => {
    const result = buildCatalogSearchParams(new URLSearchParams(), {
      ...CATALOG_DEFAULT_STATE,
      skills: ["advanced", "beginner"],
    });

    expect(result.toString()).toBe("skill=beginner&skill=advanced");
  });

  it("serializes a complete multi-filter state with repeated params", () => {
    const result = buildCatalogSearchParams(new URLSearchParams(), {
      q: "Mountain Twin",
      brand: "YES.",
      styles: ["all-mountain", "freeride"],
      skills: ["intermediate", "advanced"],
      shapes: ["twin", "directional-twin"],
      lines: ["men", "unisex"],
      widths: ["regular", "mid-wide"],
      sort: "price-desc",
    });

    expect(result.getAll("style")).toEqual(["all-mountain", "freeride"]);
    expect(result.getAll("skill")).toEqual(["intermediate", "advanced"]);
    expect(result.getAll("shape")).toEqual(["twin", "directional-twin"]);
    expect(result.getAll("line")).toEqual(["men", "unisex"]);
    expect(result.getAll("width")).toEqual(["regular", "mid-wide"]);
  });

  it("preserves parameters not owned by the catalog", () => {
    const result = buildCatalogSearchParams(
      new URLSearchParams("campaign=winter&brand=Burton"),
      { ...CATALOG_DEFAULT_STATE, widths: ["wide"] },
    );

    expect(result.get("campaign")).toBe("winter");
    expect(result.get("brand")).toBeNull();
    expect(result.getAll("width")).toEqual(["wide"]);
  });

  it("omits default values when serializing", () => {
    expect(
      buildCatalogSearchParams(
        new URLSearchParams(),
        CATALOG_DEFAULT_STATE,
      ).toString(),
    ).toBe("");
    expect(getCatalogStateKey(CATALOG_DEFAULT_STATE)).toBe("default");
  });

  it("reset removes every repeated owned param and keeps unrelated params", () => {
    const current = new URLSearchParams(
      "q=custom&brand=Jones&style=park&style=freeride&skill=beginner&skill=advanced&shape=twin&line=women&width=regular&width=wide&sort=price-asc&utm_source=test",
    );

    expect(
      buildCatalogSearchParams(current, CATALOG_DEFAULT_STATE).toString(),
    ).toBe("utm_source=test");
  });

  it("round trips normalized multi-value state", () => {
    const state: CatalogUrlState = {
      q: "  Custom X  ",
      brand: "Jones",
      styles: ["park", "freeride"],
      skills: ["beginner", "advanced"],
      shapes: ["asym-twin", "directional"],
      lines: ["women", "unisex"],
      widths: ["mid-wide", "wide"],
      sort: "price-asc",
    };
    const serialized = buildCatalogSearchParams(
      new URLSearchParams("ref=editorial"),
      state,
    );

    expect(parseCatalogState(serialized, brands)).toEqual({
      ...state,
      q: "Custom X",
    });
  });

  it("builds one state key regardless of input array order", () => {
    const first = {
      ...CATALOG_DEFAULT_STATE,
      skills: ["advanced", "intermediate"] as const,
      widths: ["mid-wide", "regular"] as const,
    };
    const second = {
      ...CATALOG_DEFAULT_STATE,
      skills: ["intermediate", "advanced"] as const,
      widths: ["regular", "mid-wide"] as const,
    };

    expect(getCatalogStateKey(first)).toBe(getCatalogStateKey(second));
  });

  it("requires an exact known brand", () => {
    expect(
      parseCatalogState(new URLSearchParams("brand=yes."), brands).brand,
    ).toBe("all");
  });

  it("preserves duplicate unrelated params", () => {
    const result = buildCatalogSearchParams(
      new URLSearchParams("tag=a&tag=b&skill=beginner"),
      { ...CATALOG_DEFAULT_STATE, skills: ["advanced"] },
    );

    expect(result.getAll("tag")).toEqual(["a", "b"]);
    expect(result.getAll("skill")).toEqual(["advanced"]);
  });

  it("preserves an explicit selection of every known value", () => {
    const state: CatalogUrlState = {
      ...CATALOG_DEFAULT_STATE,
      styles: CATALOG_RIDING_STYLES,
      skills: CATALOG_SKILL_LEVELS,
      shapes: CATALOG_BOARD_SHAPES,
      lines: CATALOG_BOARD_LINES,
      widths: CATALOG_WIDTH_TYPES,
    };
    const result = buildCatalogSearchParams(new URLSearchParams(), state);

    expect(result.getAll("skill")).toEqual([...CATALOG_SKILL_LEVELS]);
    expect(parseCatalogState(result, brands)).toEqual(state);
  });

  it("toggles values immutably and returns canonical order", () => {
    const selected = ["advanced"] as const;
    const added = toggleCatalogValue(
      selected,
      "intermediate",
      CATALOG_SKILL_LEVELS,
    );

    expect(added).toEqual(["intermediate", "advanced"]);
    expect(selected).toEqual(["advanced"]);
    expect(
      toggleCatalogValue(added, "advanced", CATALOG_SKILL_LEVELS),
    ).toEqual(["intermediate"]);
  });
});

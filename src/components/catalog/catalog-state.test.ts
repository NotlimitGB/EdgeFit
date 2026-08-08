import { describe, expect, it } from "vitest";
import {
  buildCatalogSearchParams,
  CATALOG_DEFAULT_STATE,
  getCatalogStateKey,
  parseCatalogState,
  type CatalogUrlState,
} from "./catalog-state";

const brands = ["Burton", "YES.", "Jones"];

describe("catalog state", () => {
  it("uses defaults for an empty query string", () => {
    expect(parseCatalogState(new URLSearchParams(), brands)).toEqual(
      CATALOG_DEFAULT_STATE,
    );
  });

  it("parses every supported catalog parameter", () => {
    const params = new URLSearchParams(
      "q=Mountain+Twin&brand=YES.&style=freeride&skill=advanced&shape=directional&line=men&width=wide&sort=price-desc",
    );

    expect(parseCatalogState(params, brands)).toEqual({
      q: "Mountain Twin",
      brand: "YES.",
      style: "freeride",
      skill: "advanced",
      shape: "directional",
      line: "men",
      width: "wide",
      sort: "price-desc",
    });
  });

  it("falls back for unsupported enum values", () => {
    const params = new URLSearchParams(
      "style=race&skill=expert&shape=banana&line=kids&width=extra-wide&sort=newest",
    );

    expect(parseCatalogState(params, brands)).toMatchObject({
      style: "all",
      skill: "all",
      shape: "all",
      line: "all",
      width: "all",
      sort: "default",
    });
  });

  it("requires an exact known brand", () => {
    expect(
      parseCatalogState(new URLSearchParams("brand=yes."), brands).brand,
    ).toBe("all");
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

  it("preserves parameters not owned by the catalog", () => {
    const result = buildCatalogSearchParams(
      new URLSearchParams("campaign=winter&brand=Burton"),
      { ...CATALOG_DEFAULT_STATE, width: "wide" },
    );

    expect(result.get("campaign")).toBe("winter");
    expect(result.get("brand")).toBeNull();
    expect(result.get("width")).toBe("wide");
  });

  it("reset removes only catalog-owned parameters", () => {
    const current = new URLSearchParams(
      "q=custom&brand=Jones&style=park&skill=beginner&shape=twin&line=women&width=regular&sort=price-asc&utm_source=test",
    );

    expect(
      buildCatalogSearchParams(current, CATALOG_DEFAULT_STATE).toString(),
    ).toBe("utm_source=test");
  });

  it("round trips normalized state deterministically", () => {
    const state: CatalogUrlState = {
      q: "  Custom X  ",
      brand: "Jones",
      style: "park",
      skill: "intermediate",
      shape: "directional-twin",
      line: "unisex",
      width: "mid-wide",
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
    expect(getCatalogStateKey(parseCatalogState(serialized, brands))).toBe(
      "q=Custom+X&brand=Jones&style=park&skill=intermediate&shape=directional-twin&line=unisex&width=mid-wide&sort=price-asc",
    );
  });
});

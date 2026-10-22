import { describe, expect, it } from "vitest";
import type { PublicCatalogItem } from "@/lib/public-catalog-dto";
import { catalogFacets, catalogModelCount, selectCatalog } from "./catalog-selection";
import { CATALOG_DEFAULT_STATE, buildCatalogSearchParams, parseCatalogState } from "./catalog-state";

function board(index: number): PublicCatalogItem {
  return { slug: `board-${index}`, brand: index % 2 ? "Alpha" : "Beta", modelName: `Model ${index}`,
    seasonLabel: "2025/2026", media: [], priceFrom: index, defaultOfferSlug: null,
    searchText: `alpha beta model ${index} alias ${index}`, availableSizeCount: 0, availabilityPreview: "", widthTypes: ["regular", "wide"],
    recordedVariants: [{ sizeCm: 149, displaySizeLabel: "149", widthType: "regular" }, { sizeCm: 156, displaySizeLabel: "156W", widthType: "wide" }],
    canonicalSpecs: { descriptionShort: null, ridingStyle: "park", skillLevel: "beginner", boardLine: "women", shapeType: "twin", camberProfile: "camber" } };
}
describe("full corpus reference selection", () => {
  it.each([[0, "моделей"], [1, "модель"], [2, "модели"], [5, "моделей"], [11, "моделей"], [21, "модель"], [22, "модели"], [25, "моделей"], [111, "моделей"]] as const)("uses correct Russian count wording for %s", (count, noun) => {
    expect(catalogModelCount(count)).toBe(`${count} ${noun}`);
  });
  it("retains 558 identities and searches aliases outside the first 24", () => {
    const input = Array.from({ length: 558 }, (_, i) => board(i + 1));
    expect(selectCatalog(input, CATALOG_DEFAULT_STATE)).toHaveLength(558);
    expect(selectCatalog(input, { ...CATALOG_DEFAULT_STATE, q: "alias-558" }).map((b) => b.slug)).toEqual(["board-558"]);
    expect(input[0].slug).toBe("board-1");
  });
  it("requires the same exact recorded variant for length and width", () => {
    const input = [board(1)];
    expect(selectCatalog(input, { ...CATALOG_DEFAULT_STATE, sizes: ["149"], widths: ["wide"] })).toEqual([]);
    expect(selectCatalog(input, { ...CATALOG_DEFAULT_STATE, sizes: ["156"], widths: ["wide"] })).toHaveLength(1);
    expect(selectCatalog(input, { ...CATALOG_DEFAULT_STATE, sizes: ["149", "156"], widths: ["wide"] })).toHaveLength(1);
  });
  it("ORs within groups and ANDs across groups, never interprets legacy stock", () => {
    const input = [board(1), board(2), { ...board(3), seasonLabel: "2024/2025", availableSizeCount: 100 }];
    const result = selectCatalog(input, { ...CATALOG_DEFAULT_STATE, brands: ["Alpha", "Beta"], seasons: ["2025/2026"], lines: ["women"] });
    expect(result.map((b) => b.slug)).toEqual(["board-1", "board-2"]);
  });
  it("normalizes new facets against the full corpus and round trips unknown URL parameters", () => {
    const input = [board(1)], facets = catalogFacets(input);
    const state = parseCatalogState(new URLSearchParams("season=2025%2F2026&season=bad&size=149&size=0149&camber=camber&camber=x&width=wide"), facets.brands, facets);
    expect(state.seasons).toEqual(["2025/2026"]); expect(state.sizes).toEqual(["149"]); expect(state.cambers).toEqual(["camber"]);
    const params = buildCatalogSearchParams(new URLSearchParams("utm=a&utm=b"), state);
    expect(params.getAll("utm")).toEqual(["a", "b"]);
    expect(parseCatalogState(params, facets.brands, facets)).toEqual(state);
  });
  it("keeps seasons distinct and sorts unknown prices last in both directions", () => {
    const a = { ...board(1), modelName: "Same", seasonLabel: "2024/2025" };
    const b = { ...a, slug: "new", seasonLabel: "2025/2026", priceFrom: 2 };
    const unknown = { ...a, slug: "unknown", priceFrom: 0 };
    expect(selectCatalog([a, b], CATALOG_DEFAULT_STATE).map((b) => b.slug)).toEqual(["new", "board-1"]);
    for (const sort of ["price-asc", "price-desc"] as const)
      expect(selectCatalog([unknown, a, b], { ...CATALOG_DEFAULT_STATE, sort }).at(-1)?.slug).toBe("unknown");
    expect(selectCatalog([a, b], { ...CATALOG_DEFAULT_STATE, sort: "season-desc" })[0]).toBe(b);
  });
  it("is deterministic under input permutations and never mutates variants", () => {
    const input = [board(1), board(2), board(3)]; const bytes = JSON.stringify(input);
    expect(selectCatalog(input, CATALOG_DEFAULT_STATE)).toEqual(selectCatalog([...input].reverse(), CATALOG_DEFAULT_STATE));
    expect(JSON.stringify(input)).toBe(bytes);
  });
});

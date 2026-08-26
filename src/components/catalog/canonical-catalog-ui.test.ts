import { describe, expect, it } from "vitest";
import type {
  CanonicalCatalogItem,
  CanonicalSizeVariant,
  SourceOfferSummary,
} from "@/types/canonical-catalog";
import {
  compareCanonicalFeatured,
  compareCanonicalPriceAsc,
  compareCanonicalPriceDesc,
  getCanonicalActiveSizes,
  getCanonicalAvailabilityHeadline,
  getCanonicalAvailabilityPreview,
  getCanonicalAvailableSizeCount,
  getCanonicalFilterSizes,
  getCanonicalPricePresentation,
  getCanonicalWidthSummary,
  getCanonicalWidthTypes,
  matchesCanonicalCatalogSearch,
} from "./canonical-catalog-ui";

function makeSize(
  id: string,
  overrides: Partial<CanonicalSizeVariant> = {},
): CanonicalSizeVariant {
  return {
    sourceSizeId: id,
    offerId: "offer-base",
    offerSlug: "brand-model",
    memberRole: "base",
    offerIsActive: true,
    rawSizeLabel: "156 cm",
    displaySizeLabel: "156",
    sizeLabel: "156",
    sizeCm: 156,
    waistWidthMm: 252,
    recommendedWeightMin: 60,
    recommendedWeightMax: 85,
    widthType: "regular",
    isAvailable: true,
    ...overrides,
  };
}

function makeOffer(
  overrides: Partial<SourceOfferSummary> = {},
): SourceOfferSummary {
  return {
    offerId: "offer-base",
    offerSlug: "brand-model",
    memberRole: null,
    familyMatchMethod: null,
    familyMatchConfidence: null,
    familyManualOverride: false,
    priceFrom: 60_000,
    isActive: true,
    hasAvailableSize: true,
    isFulfillable: true,
    sourceName: "Store",
    sourceUrl: "https://example.com/model",
    sourceCheckedAt: "2026-08-01T00:00:00.000Z",
    dataStatus: "verified",
    ...overrides,
  };
}

function makeBoard(
  overrides: Partial<CanonicalCatalogItem> & {
    canonicalSpecs?: Partial<CanonicalCatalogItem["canonicalSpecs"]>;
  } = {},
): CanonicalCatalogItem {
  const canonicalSpecs = {
    descriptionShort: "Описание",
    descriptionFull: "Полное описание",
    ridingStyle: "all-mountain" as const,
    skillLevel: "intermediate" as const,
    flex: 5,
    boardLine: "unisex" as const,
    shapeType: "directional-twin" as const,
    camberProfile: "hybrid-camber" as const,
    dataStatus: "verified" as const,
    canonicalSourceKind: "fallback-member" as const,
    sourceName: "Official",
    sourceUrl: "https://example.com/official",
    sourceCheckedAt: "2026-08-01T00:00:00.000Z",
    ...overrides.canonicalSpecs,
  };

  return {
    familyId: null,
    slug: "brand-model",
    brand: "Brand",
    modelName: "Model",
    seasonLabel: "2026/2027",
    canonicalSpecs,
    offers: [makeOffer()],
    sizes: [makeSize("size-156")],
    priceFrom: 60_000,
    isActive: true,
    hasAvailableSize: true,
    media: [],
    defaultOfferSlug: "brand-model",
    ...overrides,
    canonicalSpecs,
  };
}

describe("canonical Catalog UI helpers", () => {
  it("excludes sizes from inactive offers", () => {
    const board = makeBoard({
      sizes: [
        makeSize("active"),
        makeSize("inactive", { offerIsActive: false, widthType: "wide" }),
      ],
    });

    expect(getCanonicalActiveSizes(board).map((size) => size.sourceSizeId)).toEqual([
      "active",
    ]);
  });

  it("prefers available active sizes for filtering", () => {
    const board = makeBoard({
      sizes: [
        makeSize("available", { widthType: "regular" }),
        makeSize("unavailable", { widthType: "wide", isAvailable: false }),
      ],
    });

    expect(getCanonicalFilterSizes(board).map((size) => size.sourceSizeId)).toEqual([
      "available",
    ]);
  });

  it("falls back to all active sizes when none are available", () => {
    const board = makeBoard({
      sizes: [
        makeSize("regular", { isAvailable: false }),
        makeSize("wide", { widthType: "wide", isAvailable: false }),
      ],
    });

    expect(getCanonicalFilterSizes(board).map((size) => size.sourceSizeId)).toEqual([
      "regular",
      "wide",
    ]);
  });

  it("does not expose an inactive-only Wide category", () => {
    const board = makeBoard({
      sizes: [
        makeSize("regular", { isAvailable: false }),
        makeSize("wide", {
          widthType: "wide",
          offerIsActive: false,
          isAvailable: true,
        }),
      ],
    });

    expect(getCanonicalWidthTypes(board)).toEqual(["regular"]);
  });

  it("summarizes regular and Wide variants together", () => {
    const board = makeBoard({
      sizes: [makeSize("regular"), makeSize("wide", { widthType: "wide" })],
    });

    expect(getCanonicalWidthSummary(board)).toBe("обычная + wide");
  });

  it("keeps all width types in canonical order", () => {
    const board = makeBoard({
      sizes: [
        makeSize("wide", { widthType: "wide" }),
        makeSize("regular"),
        makeSize("mid", { widthType: "mid-wide" }),
      ],
    });

    expect(getCanonicalWidthTypes(board)).toEqual([
      "regular",
      "mid-wide",
      "wide",
    ]);
    expect(getCanonicalWidthSummary(board)).toBe("обычная + mid-wide + wide");
  });

  it("counts only active available sizes", () => {
    const board = makeBoard({
      sizes: [
        makeSize("available"),
        makeSize("unavailable", { isAvailable: false }),
        makeSize("inactive", { offerIsActive: false }),
      ],
    });

    expect(getCanonicalAvailableSizeCount(board)).toBe(1);
    expect(getCanonicalAvailabilityHeadline(board)).toBe(
      "В данных EdgeFit отмечено: 1 размер",
    );
  });

  it("uses display W labels and a compact five-size preview", () => {
    const board = makeBoard({
      sizes: [
        makeSize("151", { displaySizeLabel: "151" }),
        makeSize("156", { displaySizeLabel: "156" }),
        makeSize("159", { displaySizeLabel: "159" }),
        makeSize("161", { displaySizeLabel: "161W", widthType: "wide" }),
        makeSize("164", { displaySizeLabel: "164W", widthType: "wide" }),
        makeSize("167", { displaySizeLabel: "167W", widthType: "wide" }),
      ],
    });

    expect(getCanonicalAvailabilityPreview(board)).toBe(
      "Отмеченные размеры: 151, 156, 159, 161W, 164W + ещё 1.",
    );
  });

  it("uses a neutral fallback when availability is not confirmed", () => {
    const board = makeBoard({
      sizes: [makeSize("unavailable", { isAvailable: false })],
    });

    expect(getCanonicalAvailabilityHeadline(board)).toBe(
      "Доступность не подтверждена",
    );
    expect(getCanonicalAvailabilityPreview(board)).toBe(
      "Проверь наличие в магазине.",
    );
  });

  it("sorts canonical verified data before draft data", () => {
    const verified = makeBoard({ slug: "verified" });
    const draft = makeBoard({
      slug: "draft",
      canonicalSpecs: { dataStatus: "draft" },
    });

    expect([draft, verified].sort(compareCanonicalFeatured)[0]?.slug).toBe(
      "verified",
    );
  });

  it("uses active availability count in featured ordering", () => {
    const one = makeBoard({ slug: "one" });
    const two = makeBoard({
      slug: "two",
      sizes: [makeSize("one"), makeSize("two")],
    });

    expect([one, two].sort(compareCanonicalFeatured)[0]?.slug).toBe("two");
  });

  it("uses canonical source freshness in featured ordering", () => {
    const older = makeBoard({
      slug: "older",
      canonicalSpecs: { sourceCheckedAt: "2026-07-01" },
    });
    const newer = makeBoard({
      slug: "newer",
      canonicalSpecs: { sourceCheckedAt: "2026-08-01" },
    });

    expect([older, newer].sort(compareCanonicalFeatured)[0]?.slug).toBe(
      "newer",
    );
  });

  it("uses lower positive canonical price after stronger featured ties", () => {
    const expensive = makeBoard({ slug: "expensive", priceFrom: 80_000 });
    const affordable = makeBoard({ slug: "affordable", priceFrom: 50_000 });

    expect([expensive, affordable].sort(compareCanonicalFeatured)[0]?.slug).toBe(
      "affordable",
    );
  });

  it("keeps featured ordering deterministic when source dates are absent", () => {
    const beta = makeBoard({
      slug: "beta",
      brand: "Same",
      modelName: "Model",
      canonicalSpecs: { sourceCheckedAt: null },
    });
    const alpha = makeBoard({
      slug: "alpha",
      brand: "Same",
      modelName: "Model",
      canonicalSpecs: { sourceCheckedAt: null },
    });

    expect([beta, alpha].sort(compareCanonicalFeatured).map((board) => board.slug)).toEqual([
      "alpha",
      "beta",
    ]);
  });

  it("keeps an unknown featured price after a known price", () => {
    const unknown = makeBoard({ slug: "unknown", priceFrom: null });
    const known = makeBoard({ slug: "known", priceFrom: 70_000 });

    expect([unknown, known].sort(compareCanonicalFeatured)[0]?.slug).toBe(
      "known",
    );
  });

  it("sorts positive prices ascending with unknown values last", () => {
    const boards = [
      makeBoard({ slug: "unknown", priceFrom: null }),
      makeBoard({ slug: "high", priceFrom: 80_000 }),
      makeBoard({ slug: "low", priceFrom: 40_000 }),
      makeBoard({ slug: "zero", priceFrom: 0 }),
    ];

    expect(boards.sort(compareCanonicalPriceAsc).map((board) => board.slug)).toEqual([
      "low",
      "high",
      "unknown",
      "zero",
    ]);
  });

  it("sorts positive prices descending with unknown values last", () => {
    const boards = [
      makeBoard({ slug: "unknown", priceFrom: null }),
      makeBoard({ slug: "low", priceFrom: 40_000 }),
      makeBoard({ slug: "high", priceFrom: 80_000 }),
    ];

    expect(boards.sort(compareCanonicalPriceDesc).map((board) => board.slug)).toEqual([
      "high",
      "low",
      "unknown",
    ]);
  });

  it("matches canonical brand, model, and slug identity", () => {
    const board = makeBoard({
      brand: "Bataleon",
      modelName: "Beyond Medals",
      slug: "bataleon-beyond-medals",
    });

    expect(matchesCanonicalCatalogSearch(board, "Bataleon Beyond Medals")).toBe(
      true,
    );
  });

  it("matches an exact historical offer slug", () => {
    const board = makeBoard({
      offers: [makeOffer({ offerSlug: "bataleon-beyond-medals-wide" })],
    });

    expect(
      matchesCanonicalCatalogSearch(board, "bataleon-beyond-medals-wide"),
    ).toBe(true);
  });

  it("matches a humanized Wide offer alias", () => {
    const board = makeBoard({
      offers: [makeOffer({ offerSlug: "bataleon-beyond-medals-wide" })],
    });

    expect(matchesCanonicalCatalogSearch(board, "Beyond Medals Wide")).toBe(
      true,
    );
  });

  it("does not match an unrelated model", () => {
    expect(matchesCanonicalCatalogSearch(makeBoard(), "Mountain Twin")).toBe(
      false,
    );
  });

  it("never formats missing or invalid prices as zero rubles", () => {
    expect(getCanonicalPricePresentation(null)).toEqual({
      label: "Ориентир цены",
      value: "нет данных",
    });
    expect(getCanonicalPricePresentation(Number.NaN).value).toBe(
      "нет данных",
    );
    expect(getCanonicalPricePresentation(36_300)).toEqual({
      label: "Ориентир цены",
      value: "36 300 ₽",
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalCatalogItem } from "@/types/canonical-catalog";
import { toPublicCatalogItem } from "@/lib/public-catalog-dto";
import { compareCanonicalFeatured, compareCanonicalPriceAsc, compareCanonicalPriceDesc,
  getCanonicalAvailabilityHeadline, getCanonicalAvailabilityPreview,
  getCanonicalWidthSummary, matchesCanonicalCatalogSearch } from "@/components/catalog/canonical-catalog-ui";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getAllCanonicalCatalogItems: vi.fn(),
  entries: new Map<string, { value: unknown; expires: number }>(),
  time: 0,
  namespace: "fixture",
  configured: true,
  getSupport: vi.fn(),
  unstableCache: vi.fn(
    (operation: (...args: unknown[]) => Promise<unknown>, keys: string[], options: { revalidate: number }) => {
      return async (...args: unknown[]) => {
        const key = JSON.stringify([keys, args]);
        const entry = mocks.entries.get(key);
        if (entry && entry.expires > mocks.time) return entry.value;
        const value = await operation(...args);
        mocks.entries.set(key, { value, expires: mocks.time + options.revalidate * 1000 });
        return value;
      };
    },
  ),
}));

vi.mock("next/cache", () => ({
  unstable_cache: mocks.unstableCache,
}));

vi.mock("@/lib/canonical-catalog", () => ({
  loadPublicCanonicalCatalog: mocks.getAllCanonicalCatalogItems,
}));
vi.mock("@/lib/database/config", () => ({ базаНастроена: () => mocks.configured }));
vi.mock("@/lib/public-schema-cache", () => ({
  getPublicDatabaseNamespace: () => mocks.namespace,
  getPublicSchemaSupport: mocks.getSupport,
}));

import { getPublicCanonicalCatalogItems } from "@/lib/public-catalog-cache";

const boards: CanonicalCatalogItem[] = [
  {
    familyId: "family-1",
    slug: "brand-model",
    brand: "Brand",
    modelName: "Model",
    seasonLabel: "2026/2027",
    canonicalSpecs: {
      descriptionShort: "Описание",
      descriptionFull: "Полное описание",
      ridingStyle: "all-mountain",
      skillLevel: "intermediate",
      flex: 6,
      boardLine: "unisex",
      shapeType: "directional-twin",
      camberProfile: "hybrid-camber",
      dataStatus: "verified",
      canonicalSourceKind: "trusted-member",
      sourceName: "Store",
      sourceUrl: "https://example.com/board",
      sourceCheckedAt: "2026-08-30T00:00:00.000Z",
    },
    offers: [
      {
        offerId: "offer-1",
        offerSlug: "brand-model-offer",
        memberRole: "base",
        familyMatchMethod: "source-id",
        familyMatchConfidence: "high",
        familyManualOverride: false,
        priceFrom: 63_741,
        isActive: true,
        hasAvailableSize: true,
        isFulfillable: true,
        sourceName: "Store",
        sourceUrl: "https://example.com/board",
        sourceCheckedAt: "2026-08-30T00:00:00.000Z",
        dataStatus: "verified",
      },
    ],
    sizes: [
      {
        sourceSizeId: "source-size-1",
        offerId: "offer-1",
        offerSlug: "brand-model-offer",
        memberRole: "base",
        offerIsActive: true,
        rawSizeLabel: "156W",
        displaySizeLabel: "156W",
        sizeCm: 156,
        sizeLabel: "156W",
        waistWidthMm: 264,
        recommendedWeightMin: 70,
        recommendedWeightMax: 90,
        widthType: "wide",
        isAvailable: true,
      },
    ],
    priceFrom: 63_741,
    isActive: true,
    hasAvailableSize: true,
    media: ["https://example.com/board.jpg"],
    defaultOfferSlug: "brand-model-offer",
  },
];

describe("public catalog cache", () => {
  beforeEach(() => {
    mocks.getAllCanonicalCatalogItems.mockReset();
    mocks.entries.clear(); mocks.time = 0; mocks.namespace = "fixture"; mocks.configured = true;
    mocks.getSupport.mockReset(); mocks.getSupport.mockResolvedValue({});
  });

  it("configures the stable public cache contract", () => {
    expect(mocks.unstableCache).toHaveBeenCalledTimes(1);
    expect(mocks.unstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      ["edgefit-public-canonical-catalog-v2"],
      {
        revalidate: 300,
        tags: ["edgefit-public-canonical-catalog"],
      },
    );
  });

  it("reuses the cached loader result without changing catalog data", async () => {
    mocks.getAllCanonicalCatalogItems.mockResolvedValue(boards);

    const first = await getPublicCanonicalCatalogItems();
    const second = await getPublicCanonicalCatalogItems();

    expect(first).toEqual(boards.map(toPublicCatalogItem));
    expect(second).toEqual(first);
    expect(mocks.getAllCanonicalCatalogItems).toHaveBeenCalledTimes(1);
    expect(mocks.getSupport).toHaveBeenCalledTimes(2);
  });

  it("expires after 300 seconds, isolates namespaces and recovers after errors", async () => {
    mocks.getAllCanonicalCatalogItems.mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue(boards);
    await expect(getPublicCanonicalCatalogItems()).rejects.toThrow("unavailable");
    await getPublicCanonicalCatalogItems();
    await getPublicCanonicalCatalogItems();
    expect(mocks.getAllCanonicalCatalogItems).toHaveBeenCalledTimes(2);
    mocks.time = 300_001;
    await getPublicCanonicalCatalogItems();
    expect(mocks.getAllCanonicalCatalogItems).toHaveBeenCalledTimes(3);
    mocks.namespace = "other";
    await getPublicCanonicalCatalogItems();
    expect(mocks.getAllCanonicalCatalogItems).toHaveBeenCalledTimes(4);
  });

  it("performs no schema or data reads when the database is disabled", async () => {
    mocks.configured = false;
    expect(await getPublicCanonicalCatalogItems()).toEqual([]);
    expect(mocks.getSupport).not.toHaveBeenCalled();
    expect(mocks.getAllCanonicalCatalogItems).not.toHaveBeenCalled();
  });

  it("round-trips the public catalog payload through JSON", () => {
    const roundTripped = JSON.parse(JSON.stringify(boards.map(toPublicCatalogItem)));

    expect(roundTripped).toEqual(boards.map(toPublicCatalogItem));
    expect(roundTripped[0]).toMatchObject({
      slug: "brand-model",
      brand: "Brand",
      modelName: "Model",
      priceFrom: 63_741,
      defaultOfferSlug: "brand-model-offer",
    });
    expect(roundTripped[0].canonicalSpecs.ridingStyle).toBe("all-mountain");
    expect(roundTripped[0].offers).toHaveLength(1);
    expect(roundTripped[0].sizes[0]).toMatchObject({
      displaySizeLabel: "156W",
      widthType: "wide",
    });
  });

  it("reduces identical-fixture bytes while preserving presentation and search", () => {
    const original = boards[0];
    const projected = toPublicCatalogItem(original);
    const before = Buffer.byteLength(JSON.stringify(boards));
    const after = Buffer.byteLength(JSON.stringify([projected]));
    console.info(`034P_FIXTURE_BYTES before=${before} after=${after}`);
    expect(after).toBeLessThan(before * 0.6);
    for (const query of ["", "brand-model", "brand-model-offer", "unknown", "Brand Model"])
      expect(matchesCanonicalCatalogSearch(projected, query)).toBe(matchesCanonicalCatalogSearch(original, query));
    for (const present of [getCanonicalAvailabilityHeadline, getCanonicalAvailabilityPreview, getCanonicalWidthSummary])
      expect(present(projected)).toBe(present(original));
    expect(projected.media).toEqual(original.media);
    expect(projected.canonicalSpecs.descriptionShort).toBe(original.canonicalSpecs.descriptionShort);
    expect(JSON.stringify(projected)).not.toMatch(/sourceUrl|waistWidthMm|descriptionFull|familyMatch/);
  });

  it("keeps variant ordering, duplicates, fallback widths and sort tie-breaks", () => {
    const input = [boards[0], { ...boards[0], slug: "other", priceFrom: null,
      sizes: [boards[0].sizes[0], { ...boards[0].sizes[0], isAvailable: false, widthType: "regular" as const }, boards[0].sizes[0]] }];
    const projected = input.map(toPublicCatalogItem);
    expect(projected[1].sizes.map((size) => size.displaySizeLabel)).toEqual(["156W", "156W", "156W"]);
    for (const sorter of [compareCanonicalFeatured, compareCanonicalPriceAsc, compareCanonicalPriceDesc])
      expect([...projected].sort(sorter).map((item) => item.slug))
        .toEqual([...input].sort(sorter).map((item) => item.slug));
    for (const item of input) expect(getCanonicalWidthSummary(toPublicCatalogItem(item))).toBe(getCanonicalWidthSummary(item));
  });
});

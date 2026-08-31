import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalCatalogItem } from "@/types/canonical-catalog";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getAllCanonicalCatalogItems: vi.fn(),
  unstableCache: vi.fn(
    (operation: () => unknown | Promise<unknown>) => {
      let cachedResult: Promise<unknown> | undefined;

      return () => {
        cachedResult ??= Promise.resolve(operation());
        return cachedResult;
      };
    },
  ),
}));

vi.mock("next/cache", () => ({
  unstable_cache: mocks.unstableCache,
}));

vi.mock("@/lib/canonical-catalog", () => ({
  getAllCanonicalCatalogItems: mocks.getAllCanonicalCatalogItems,
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
        id: "size-1",
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
  });

  it("configures the stable public cache contract", () => {
    expect(mocks.unstableCache).toHaveBeenCalledTimes(1);
    expect(mocks.unstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      ["edgefit-public-canonical-catalog-v1"],
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

    expect(first).toEqual(boards);
    expect(second).toEqual(boards);
    expect(mocks.getAllCanonicalCatalogItems).toHaveBeenCalledTimes(1);
  });

  it("round-trips the public catalog payload through JSON", () => {
    const roundTripped = JSON.parse(JSON.stringify(boards));

    expect(roundTripped).toEqual(boards);
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
      sizeLabel: "156W",
      waistWidthMm: 264,
      widthType: "wide",
    });
  });
});

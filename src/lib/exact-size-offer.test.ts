import { describe, expect, it } from "vitest";
import { getExactSizeOfferIntelligence } from "@/lib/exact-size-offer";
import type { Product, ProductSize } from "@/types/domain";

const regular155: ProductSize = {
  sizeCm: 155,
  sizeLabel: "155",
  waistWidthMm: 252,
  recommendedWeightMin: 60,
  recommendedWeightMax: 80,
  widthType: "regular",
  isAvailable: true,
};

const wide155: ProductSize = {
  ...regular155,
  sizeLabel: "155W",
  waistWidthMm: 262,
  widthType: "wide",
};

const product: Product = {
  id: "product-1",
  slug: "test-board",
  brand: "Test",
  modelName: "Board",
  descriptionShort: "Test board",
  descriptionFull: "Test board",
  ridingStyle: "all-mountain",
  skillLevel: "intermediate",
  flex: 5,
  priceFrom: 50_000,
  imageUrl: "",
  affiliateUrl: "https://trial-sport.ru/goods/1/3131513.html",
  isActive: true,
  boardLine: "men",
  shapeType: "directional-twin",
  camberProfile: "hybrid-camber",
  dataStatus: "verified",
  sourceName: null,
  sourceUrl: null,
  sourceCheckedAt: null,
  scenarios: [],
  notIdealFor: [],
  sizes: [regular155, wide155],
};

function classify(
  recommendedSize: ProductSize,
  overrides: Partial<Product> = {},
  resultMode: "session" | "saved" = "session",
) {
  return getExactSizeOfferIntelligence({
    product: { ...product, ...overrides },
    recommendedSize,
    resultMode,
  });
}

describe("getExactSizeOfferIntelligence", () => {
  it("confirms one exact regular size at a direct identified merchant", () => {
    expect(classify(regular155)).toMatchObject({
      status: "confirmed_available",
      recommendedSizeLabel: "155",
      storeCode: "trial-sport",
      sourceProductId: "3131513",
      exactSizeMatched: true,
    });
  });

  it("matches Wide independently from a regular size of the same length", () => {
    expect(classify(wide155)).toMatchObject({
      status: "confirmed_available",
      recommendedSizeLabel: "155W",
      exactSizeMatched: true,
    });
  });

  it("does not confirm a Wide recommendation from a regular row", () => {
    expect(classify(wide155, { sizes: [regular155] })).toMatchObject({
      status: "not_confirmed",
      exactSizeMatched: false,
    });
  });

  it("does not treat a false availability flag as sold out", () => {
    expect(
      classify(
        { ...regular155, isAvailable: false },
        { sizes: [{ ...regular155, isAvailable: false }] },
      ),
    ).toMatchObject({ status: "not_confirmed", exactSizeMatched: true });
  });

  it("fails cautious when the direct source product ID is missing", () => {
    expect(
      classify(regular155, {
        affiliateUrl: "https://trial-sport.ru/catalog/snowboards/board",
      }),
    ).toMatchObject({
      status: "not_confirmed",
      storeCode: "trial-sport",
      sourceProductId: null,
    });
  });

  it("fails cautious when the exact size identity is duplicated", () => {
    expect(
      classify(regular155, { sizes: [regular155, { ...regular155 }] }),
    ).toMatchObject({ status: "not_confirmed", exactSizeMatched: false });
  });

  it("classifies a merchant search fallback as search-only", () => {
    expect(
      classify(regular155, {
        affiliateUrl: "https://example.com/official-board",
      }),
    ).toMatchObject({ status: "search_only", exactSizeMatched: true });
  });

  it("never makes a current exact-offer claim for a saved result", () => {
    expect(classify(regular155, {}, "saved")).toMatchObject({
      status: "search_only",
      destinationMode: "saved",
    });
  });
});

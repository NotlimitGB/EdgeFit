import { describe, expect, it } from "vitest";
import { hasTrustedFlex } from "@/lib/catalog-readiness";
import type { Product } from "@/types/domain";
import { formatCatalogCheckedDate, getProductTrustDetails } from "./catalog-trust";

const baseProduct: Product = {
  id: "test-board",
  slug: "test-board",
  brand: "Test",
  modelName: "Trust Board",
  descriptionShort: "Короткое описание",
  descriptionFull: "Полное описание",
  ridingStyle: "all-mountain",
  skillLevel: "intermediate",
  flex: 6,
  priceFrom: 49990,
  imageUrl: "/board.jpg",
  affiliateUrl: "https://shop.test/trust-board",
  isActive: true,
  boardLine: "unisex",
  shapeType: "directional",
  dataStatus: "verified",
  sourceName: "Официальная страница Test",
  sourceUrl: "https://brand.test/trust-board",
  sourceCheckedAt: "2026-04-07",
  scenarios: [],
  notIdealFor: [],
  sizes: [
    {
      sizeCm: 154,
      sizeLabel: "154",
      waistWidthMm: 255,
      recommendedWeightMin: 60,
      recommendedWeightMax: 80,
      widthType: "regular",
    },
  ],
};

describe("catalog trust helpers", () => {
  it("formats short ISO dates in Russian", () => {
    expect(formatCatalogCheckedDate("2026-04-07")).toBe("7 апреля 2026 г.");
  });

  it("builds verified trust details with source metadata", () => {
    const details = getProductTrustDetails(baseProduct);

    expect(details.isReady).toBe(true);
    expect(details.badgeLabel).toBe("Проверено");
    expect(details.sourceLabel).toBe("Официальная страница Test");
    expect(details.checkedAtLabel).toBe("7 апреля 2026 г.");
    expect(details.issueLabel).toBeNull();
  });

  it("returns the first concrete issue for a draft card", () => {
    const details = getProductTrustDetails({
      ...baseProduct,
      dataStatus: "draft",
      sourceName: null,
      sourceUrl: null,
      affiliateUrl: "https://example.com/trust-board",
      sourceCheckedAt: null,
    });

    expect(details.isReady).toBe(false);
    expect(details.badgeLabel).toBe("Нужно перепроверить");
    expect(details.issueLabel).toBe("Модель ещё не отмечена как проверенная.");
    expect(details.badgeDescription).toContain("Модель ещё не отмечена");
  });
  it("trusts stiffness only for verified non-store sources", () => {
    expect(hasTrustedFlex(baseProduct)).toBe(true);

    expect(
      hasTrustedFlex({
        ...baseProduct,
        sourceName: "Траектория",
        sourceUrl: "https://www.traektoria.ru/product/test-board/",
      }),
    ).toBe(false);

    expect(
      hasTrustedFlex({
        ...baseProduct,
        dataStatus: "draft",
      }),
    ).toBe(false);
  });
});

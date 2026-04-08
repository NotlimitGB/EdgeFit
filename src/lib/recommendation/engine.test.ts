import { describe, expect, it } from "vitest";
import type { Product, QuizInput } from "@/types/domain";
import { getRecommendation } from "./engine";

const baseInput: QuizInput = {
  heightCm: 178,
  weightKg: 74,
  bootSizeEu: 43,
  boardLinePreference: "men",
  skillLevel: "intermediate",
  ridingStyle: "all-mountain",
  terrainPriority: "balanced",
  aggressiveness: "balanced",
  stanceType: "standard",
};

describe("getRecommendation", () => {
  it("returns stable all-mountain length range for base input", () => {
    const result = getRecommendation(baseInput);

    expect(result.lengthRange).toEqual({ min: 152, max: 156 });
    expect(result.recommendedBoards.length).toBeGreaterThanOrEqual(3);
  });

  it("moves width recommendation to mid-wide for larger boots", () => {
    const result = getRecommendation({
      ...baseInput,
      bootSizeEu: 44,
    });

    expect(result.recommendedWidthType).toBe("mid-wide");
    expect(result.targetWaistWidthMm).toBeGreaterThanOrEqual(257);
  });

  it("moves width recommendation to wide for very large boots", () => {
    const result = getRecommendation({
      ...baseInput,
      bootSizeEu: 46,
    });

    expect(result.recommendedWidthType).toBe("wide");
    expect(result.bootDragRisk).not.toBe("low");
  });

  it("recommends shorter boards for park than for freeride", () => {
    const park = getRecommendation({
      ...baseInput,
      ridingStyle: "park",
    });
    const freeride = getRecommendation({
      ...baseInput,
      ridingStyle: "freeride",
    });

    expect(park.lengthRange.max).toBeLessThan(freeride.lengthRange.max);
    expect(park.lengthRange.min).toBeLessThan(freeride.lengthRange.min);
  });

  it("reduces boot drag risk a bit for duck stance", () => {
    const standard = getRecommendation({
      ...baseInput,
      bootSizeEu: 44.5,
      stanceType: "standard",
    });
    const duck = getRecommendation({
      ...baseInput,
      bootSizeEu: 44.5,
      stanceType: "duck",
    });

    expect(duck.targetWaistWidthMm).toBeLessThan(standard.targetWaistWidthMm);
  });

  it("returns a shape profile for the current scenario", () => {
    const result = getRecommendation(baseInput);

    expect(result.shapeProfile.primary).toBe("directional-twin");
    expect(result.shapeProfile.headline.length).toBeGreaterThan(0);
  });

  it("slightly lengthens the range for soft snow priority", () => {
    const balanced = getRecommendation(baseInput);
    const softSnow = getRecommendation({
      ...baseInput,
      terrainPriority: "soft-snow",
    });

    expect(softSnow.lengthRange.max).toBeGreaterThanOrEqual(balanced.lengthRange.max);
    expect(softSnow.lengthRange.min).toBeGreaterThanOrEqual(balanced.lengthRange.min);
  });

  it("prefers a verified card with a live source over a draft twin", () => {
    const readyBoard: Product = {
      id: "ready-board",
      slug: "ready-board",
      brand: "Test",
      modelName: "Ready Board",
      descriptionShort: "ready",
      descriptionFull: "ready",
      ridingStyle: "all-mountain",
      skillLevel: "intermediate",
      flex: 6,
      priceFrom: 50000,
      imageUrl: "/boards/ready.jpg",
      affiliateUrl: "https://example-store.test/ready-board",
      isActive: true,
      boardLine: "men",
      shapeType: "directional-twin",
      dataStatus: "verified",
      sourceName: "Официальный источник",
      sourceUrl: "https://brand.test/ready-board",
      sourceCheckedAt: "2026-04-07",
      scenarios: [],
      notIdealFor: [],
      sizes: [
        {
          sizeCm: 154,
          sizeLabel: null,
          waistWidthMm: 257,
          recommendedWeightMin: 65,
          recommendedWeightMax: 80,
          widthType: "mid-wide",
        },
      ],
    };

    const draftBoard: Product = {
      ...readyBoard,
      id: "draft-board",
      slug: "draft-board",
      modelName: "Draft Board",
      affiliateUrl: "https://example.com/draft-board",
      dataStatus: "draft",
      sourceName: null,
      sourceUrl: null,
      sourceCheckedAt: null,
    };

    const result = getRecommendation(
      {
        ...baseInput,
        bootSizeEu: 44,
      },
      [draftBoard, readyBoard],
    );

    expect(result.recommendedBoards[0]?.product.slug).toBe("ready-board");
    expect(result.recommendedBoards[0]?.isCatalogReady).toBe(true);
  });

  it("prefers a twin shape over a directional one for park input", () => {
    const baseBoard: Product = {
      id: "base-shape-board",
      slug: "base-shape-board",
      brand: "Test",
      modelName: "Shape Board",
      descriptionShort: "shape",
      descriptionFull: "shape",
      ridingStyle: "park",
      skillLevel: "intermediate",
      flex: 5,
      priceFrom: 42000,
      imageUrl: "/boards/shape.jpg",
      affiliateUrl: "https://example-store.test/shape-board",
      isActive: true,
      boardLine: "unisex",
      shapeType: "twin",
      dataStatus: "verified",
      sourceName: "Официальный источник",
      sourceUrl: "https://brand.test/shape-board",
      sourceCheckedAt: "2026-04-07",
      scenarios: [],
      notIdealFor: [],
      sizes: [
        {
          sizeCm: 152,
          sizeLabel: null,
          waistWidthMm: 252,
          recommendedWeightMin: 60,
          recommendedWeightMax: 80,
          widthType: "regular",
        },
      ],
    };

    const directionalBoard: Product = {
      ...baseBoard,
      id: "directional-shape-board",
      slug: "directional-shape-board",
      modelName: "Directional Shape Board",
      shapeType: "directional",
    };

    const result = getRecommendation(
      {
        ...baseInput,
        ridingStyle: "park",
      },
      [directionalBoard, baseBoard],
    );

    expect(result.recommendedBoards[0]?.product.slug).toBe("base-shape-board");
  });
});

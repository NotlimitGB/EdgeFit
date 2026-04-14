import { describe, expect, it } from "vitest";
import type { Product, ProductSize, QuizInput } from "@/types/domain";
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

function createSize(overrides: Partial<ProductSize> = {}): ProductSize {
  return {
    sizeCm: 154,
    sizeLabel: null,
    waistWidthMm: 252,
    recommendedWeightMin: 65,
    recommendedWeightMax: 80,
    widthType: "regular",
    isAvailable: true,
    ...overrides,
  };
}

function createProduct(
  overrides: Partial<Product> = {},
  sizeOverrides: Partial<ProductSize> = {},
): Product {
  return {
    id: overrides.slug ?? "test-board",
    slug: overrides.slug ?? "test-board",
    brand: "Test",
    modelName: "Test Board",
    descriptionShort: "test",
    descriptionFull: "test",
    ridingStyle: "all-mountain",
    skillLevel: "intermediate",
    flex: 6,
    priceFrom: 50000,
    imageUrl: "/boards/test.jpg",
    affiliateUrl: "https://store.test/test-board",
    isActive: true,
    boardLine: "men",
    shapeType: "directional-twin",
    dataStatus: "verified",
    sourceName: "Официальный источник",
    sourceUrl: "https://brand.test/test-board",
    sourceCheckedAt: "2026-04-07",
    scenarios: [],
    notIdealFor: [],
    sizes: [createSize(sizeOverrides)],
    ...overrides,
  };
}

const defaultBoards = [
  createProduct({
    slug: "default-all-mountain",
    modelName: "Default All Mountain",
  }),
  createProduct(
    {
      slug: "default-park",
      modelName: "Default Park",
      ridingStyle: "park",
      boardLine: "unisex",
      shapeType: "twin",
      flex: 5,
    },
    { sizeCm: 153, waistWidthMm: 250, widthType: "regular" },
  ),
  createProduct(
    {
      slug: "default-freeride",
      modelName: "Default Freeride",
      ridingStyle: "freeride",
      shapeType: "directional",
      flex: 7,
    },
    { sizeCm: 156, waistWidthMm: 258, widthType: "mid-wide" },
  ),
];

describe("getRecommendation", () => {
  it("returns stable all-mountain length range for base input", () => {
    const result = getRecommendation(baseInput, defaultBoards);

    expect(result.lengthRange).toEqual({ min: 152, max: 156 });
    expect(result.recommendedBoards.length).toBeGreaterThanOrEqual(3);
  });

  it("moves width recommendation to mid-wide for larger boots", () => {
    const result = getRecommendation({
      ...baseInput,
      bootSizeEu: 44,
    }, defaultBoards);

    expect(result.recommendedWidthType).toBe("mid-wide");
    expect(result.targetWaistWidthMm).toBeGreaterThanOrEqual(257);
  });

  it("moves width recommendation to wide for very large boots", () => {
    const result = getRecommendation({
      ...baseInput,
      bootSizeEu: 46,
    }, defaultBoards);

    expect(result.recommendedWidthType).toBe("wide");
    expect(result.bootDragRisk).not.toBe("low");
  });

  it("recommends shorter boards for park than for freeride", () => {
    const park = getRecommendation({
      ...baseInput,
      ridingStyle: "park",
    }, defaultBoards);
    const freeride = getRecommendation({
      ...baseInput,
      ridingStyle: "freeride",
    }, defaultBoards);

    expect(park.lengthRange.max).toBeLessThan(freeride.lengthRange.max);
    expect(park.lengthRange.min).toBeLessThan(freeride.lengthRange.min);
  });

  it("reduces boot drag risk a bit for duck stance", () => {
    const standard = getRecommendation({
      ...baseInput,
      bootSizeEu: 44.5,
      stanceType: "standard",
    }, defaultBoards);
    const duck = getRecommendation({
      ...baseInput,
      bootSizeEu: 44.5,
      stanceType: "duck",
    }, defaultBoards);

    expect(duck.targetWaistWidthMm).toBeLessThan(standard.targetWaistWidthMm);
  });

  it("returns a shape profile for the current scenario", () => {
    const result = getRecommendation(baseInput, defaultBoards);

    expect(result.shapeProfile.primary).toBe("directional-twin");
    expect(result.shapeProfile.headline.length).toBeGreaterThan(0);
  });

  it("slightly lengthens the range for soft snow priority", () => {
    const balanced = getRecommendation(baseInput, defaultBoards);
    const softSnow = getRecommendation({
      ...baseInput,
      terrainPriority: "soft-snow",
    }, defaultBoards);

    expect(softSnow.lengthRange.max).toBeGreaterThanOrEqual(
      balanced.lengthRange.max,
    );
    expect(softSnow.lengthRange.min).toBeGreaterThanOrEqual(
      balanced.lengthRange.min,
    );
  });

  it("prefers a verified card with a live source over a draft twin", () => {
    const readyBoard = createProduct({
      slug: "ready-board",
      modelName: "Ready Board",
      affiliateUrl: "https://store.test/ready-board",
      dataStatus: "verified",
      sourceName: "Официальный источник",
      sourceUrl: "https://brand.test/ready-board",
    });

    const draftBoard = createProduct(
      {
        slug: "draft-board",
        modelName: "Draft Board",
        affiliateUrl: "https://example.com/draft-board",
        dataStatus: "draft",
        sourceName: null,
        sourceUrl: null,
        sourceCheckedAt: null,
      },
      { waistWidthMm: 252, widthType: "regular" },
    );

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
    const twinBoard = createProduct({
      slug: "twin-shape-board",
      modelName: "Twin Shape Board",
      ridingStyle: "park",
      shapeType: "twin",
      boardLine: "unisex",
      flex: 5,
    });

    const directionalBoard = createProduct({
      slug: "directional-shape-board",
      modelName: "Directional Shape Board",
      ridingStyle: "park",
      shapeType: "directional",
      boardLine: "unisex",
      flex: 5,
    });

    const result = getRecommendation(
      {
        ...baseInput,
        ridingStyle: "park",
      },
      [directionalBoard, twinBoard],
    );

    expect(result.recommendedBoards[0]?.product.slug).toBe("twin-shape-board");
  });

  it("prefers the size closer to the ideal point inside the range", () => {
    const centeredBoard = createProduct(
      {
        slug: "centered-board",
        modelName: "Centered Board",
      },
      { sizeCm: 154 },
    );

    const edgeBoard = createProduct(
      {
        slug: "edge-board",
        modelName: "Edge Board",
      },
      { sizeCm: 152 },
    );

    const result = getRecommendation(baseInput, [edgeBoard, centeredBoard]);

    expect(result.recommendedBoards[0]?.product.slug).toBe("centered-board");
  });

  it("penalizes a board that is much wider than needed", () => {
    const balancedWidthBoard = createProduct(
      {
        slug: "balanced-width-board",
        modelName: "Balanced Width Board",
      },
      { waistWidthMm: 251, widthType: "regular" },
    );

    const tooWideBoard = createProduct(
      {
        slug: "too-wide-board",
        modelName: "Too Wide Board",
      },
      { waistWidthMm: 261, widthType: "wide" },
    );

    const result = getRecommendation(
      {
        ...baseInput,
        ridingStyle: "park",
        terrainPriority: "switch-freestyle",
        aggressiveness: "relaxed",
      },
      [tooWideBoard, balancedWidthBoard],
    );

    expect(result.recommendedBoards[0]?.product.slug).toBe(
      "balanced-width-board",
    );
  });

  it("prefers a stiffer freeride board for an aggressive rider", () => {
    const stiffBoard = createProduct({
      slug: "stiff-freeride-board",
      modelName: "Stiff Freeride Board",
      ridingStyle: "freeride",
      flex: 8,
      shapeType: "tapered-directional",
    });

    const softBoard = createProduct({
      slug: "soft-freeride-board",
      modelName: "Soft Freeride Board",
      ridingStyle: "freeride",
      flex: 4,
      shapeType: "tapered-directional",
    });

    const result = getRecommendation(
      {
        ...baseInput,
        skillLevel: "advanced",
        ridingStyle: "freeride",
        terrainPriority: "groomers-carving",
        aggressiveness: "aggressive",
      },
      [softBoard, stiffBoard],
    );

    expect(result.recommendedBoards[0]?.product.slug).toBe(
      "stiff-freeride-board",
    );
  });

  it("does not push a soft all-mountain board to the top for an aggressive advanced rider", () => {
    const softBoard = createProduct({
      slug: "soft-aggressive-all-mountain",
      modelName: "Soft Aggressive All Mountain",
      ridingStyle: "all-mountain",
      shapeType: "directional-twin",
      flex: 4,
    });

    const supportiveBoard = createProduct({
      slug: "supportive-aggressive-all-mountain",
      modelName: "Supportive Aggressive All Mountain",
      ridingStyle: "all-mountain",
      shapeType: "directional-twin",
      flex: 7,
    });

    const result = getRecommendation(
      {
        ...baseInput,
        skillLevel: "advanced",
        ridingStyle: "all-mountain",
        terrainPriority: "balanced",
        aggressiveness: "aggressive",
      },
      [softBoard, supportiveBoard],
    );

    expect(result.recommendedBoards[0]?.product.slug).toBe(
      "supportive-aggressive-all-mountain",
    );
  });

  it("prefers a softer park board for a relaxed rider", () => {
    const softBoard = createProduct({
      slug: "soft-park-board",
      modelName: "Soft Park Board",
      ridingStyle: "park",
      boardLine: "unisex",
      shapeType: "twin",
      flex: 4,
    });

    const stiffBoard = createProduct({
      slug: "stiff-park-board",
      modelName: "Stiff Park Board",
      ridingStyle: "park",
      boardLine: "unisex",
      shapeType: "twin",
      flex: 8,
    });

    const result = getRecommendation(
      {
        ...baseInput,
        ridingStyle: "park",
        terrainPriority: "switch-freestyle",
        aggressiveness: "relaxed",
      },
      [stiffBoard, softBoard],
    );

    expect(result.recommendedBoards[0]?.product.slug).toBe("soft-park-board");
  });

  it("keeps a universal scenario focused on all-mountain boards when enough of them exist", () => {
    const allMountainOne = createProduct({
      slug: "all-mountain-one",
      modelName: "All Mountain One",
      ridingStyle: "all-mountain",
    });

    const allMountainTwo = createProduct(
      {
        slug: "all-mountain-two",
        modelName: "All Mountain Two",
        ridingStyle: "all-mountain",
      },
      { sizeCm: 155 },
    );

    const allMountainThree = createProduct(
      {
        slug: "all-mountain-three",
        modelName: "All Mountain Three",
        ridingStyle: "all-mountain",
      },
      { sizeCm: 153 },
    );

    const parkBoard = createProduct({
      slug: "park-special",
      modelName: "Park Special",
      ridingStyle: "park",
      shapeType: "twin",
      boardLine: "unisex",
      flex: 4,
    });

    const freerideBoard = createProduct({
      slug: "freeride-special",
      modelName: "Freeride Special",
      ridingStyle: "freeride",
      shapeType: "directional",
      flex: 7,
    });

    const result = getRecommendation(baseInput, [
      parkBoard,
      freerideBoard,
      allMountainOne,
      allMountainTwo,
      allMountainThree,
    ]);

    expect(
      result.recommendedBoards.every(
        (match) => match.product.ridingStyle === "all-mountain",
      ),
    ).toBe(true);
  });

  it("keeps style relevance even when only mismatched boards are verified", () => {
    const verifiedParkOne = createProduct({
      slug: "verified-park-one",
      modelName: "Verified Park One",
      ridingStyle: "park",
      shapeType: "twin",
      boardLine: "unisex",
    });

    const verifiedParkTwo = createProduct(
      {
        slug: "verified-park-two",
        modelName: "Verified Park Two",
        ridingStyle: "park",
        shapeType: "twin",
        boardLine: "unisex",
      },
      { sizeCm: 155 },
    );

    const verifiedFreeride = createProduct({
      slug: "verified-freeride",
      modelName: "Verified Freeride",
      ridingStyle: "freeride",
      shapeType: "directional",
      flex: 7,
    });

    const draftAllMountainOne = createProduct({
      slug: "draft-all-mountain-one",
      modelName: "Draft All Mountain One",
      ridingStyle: "all-mountain",
      dataStatus: "draft",
      sourceName: null,
      sourceUrl: null,
      sourceCheckedAt: null,
      affiliateUrl: "https://store.test/draft-all-mountain-one",
    });

    const draftAllMountainTwo = createProduct(
      {
        slug: "draft-all-mountain-two",
        modelName: "Draft All Mountain Two",
        ridingStyle: "all-mountain",
        dataStatus: "draft",
        sourceName: null,
        sourceUrl: null,
        sourceCheckedAt: null,
        affiliateUrl: "https://store.test/draft-all-mountain-two",
      },
      { sizeCm: 155 },
    );

    const draftAllMountainThree = createProduct(
      {
        slug: "draft-all-mountain-three",
        modelName: "Draft All Mountain Three",
        ridingStyle: "all-mountain",
        dataStatus: "draft",
        sourceName: null,
        sourceUrl: null,
        sourceCheckedAt: null,
        affiliateUrl: "https://store.test/draft-all-mountain-three",
      },
      { sizeCm: 153 },
    );

    const result = getRecommendation(baseInput, [
      verifiedParkOne,
      verifiedParkTwo,
      verifiedFreeride,
      draftAllMountainOne,
      draftAllMountainTwo,
      draftAllMountainThree,
    ]);

    expect(
      result.recommendedBoards.every(
        (match) => match.product.ridingStyle === "all-mountain",
      ),
    ).toBe(true);
  });

  it("does not overtrust draft flex values against a verified board", () => {
    const verifiedBoard = createProduct({
      slug: "verified-flex-board",
      modelName: "Verified Flex Board",
      flex: 6,
      ridingStyle: "freeride",
      shapeType: "directional",
    });

    const draftBoard = createProduct({
      slug: "draft-flex-board",
      modelName: "Draft Flex Board",
      flex: 8,
      ridingStyle: "freeride",
      shapeType: "directional",
      dataStatus: "draft",
      sourceName: null,
      sourceUrl: null,
      sourceCheckedAt: null,
      affiliateUrl: "https://store.test/draft-flex-board",
    });

    const result = getRecommendation(
      {
        ...baseInput,
        skillLevel: "advanced",
        ridingStyle: "freeride",
        terrainPriority: "groomers-carving",
        aggressiveness: "aggressive",
      },
      [draftBoard, verifiedBoard],
    );

    expect(result.recommendedBoards[0]?.product.slug).toBe("verified-flex-board");
  });

  it("penalizes a too-demanding board more strongly for a beginner rider", () => {
    const beginnerFriendly = createProduct({
      slug: "beginner-friendly",
      modelName: "Beginner Friendly",
      skillLevel: "beginner",
      flex: 4,
      ridingStyle: "all-mountain",
      shapeType: "directional-twin",
    });

    const demandingBoard = createProduct({
      slug: "demanding-board",
      modelName: "Demanding Board",
      skillLevel: "advanced",
      flex: 7,
      ridingStyle: "all-mountain",
      shapeType: "directional",
    });

    const result = getRecommendation(
      {
        ...baseInput,
        skillLevel: "beginner",
        aggressiveness: "relaxed",
      },
      [demandingBoard, beginnerFriendly],
    );

    expect(result.recommendedBoards[0]?.product.slug).toBe("beginner-friendly");
  });

  it("prefers a calmer camber profile for a beginner all-mountain scenario", () => {
    const flatBoard = createProduct({
      slug: "flat-board",
      modelName: "Flat Board",
      camberProfile: "flat",
    });

    const camberBoard = createProduct({
      slug: "camber-board",
      modelName: "Camber Board",
      camberProfile: "camber",
    });

    const result = getRecommendation(
      {
        ...baseInput,
        skillLevel: "beginner",
        aggressiveness: "relaxed",
      },
      [camberBoard, flatBoard],
    );

    expect(result.recommendedBoards[0]?.product.slug).toBe("flat-board");
  });

  it("prefers camber under an aggressive carving-focused scenario", () => {
    const camberBoard = createProduct({
      slug: "carve-camber",
      modelName: "Carve Camber",
      ridingStyle: "freeride",
      shapeType: "directional",
      flex: 7,
      camberProfile: "camber",
    });

    const rockerBoard = createProduct({
      slug: "carve-rocker",
      modelName: "Carve Rocker",
      ridingStyle: "freeride",
      shapeType: "directional",
      flex: 7,
      camberProfile: "rocker",
    });

    const result = getRecommendation(
      {
        ...baseInput,
        skillLevel: "advanced",
        ridingStyle: "freeride",
        terrainPriority: "groomers-carving",
        aggressiveness: "aggressive",
      },
      [rockerBoard, camberBoard],
    );

    expect(result.recommendedBoards[0]?.product.slug).toBe("carve-camber");
  });

  it("keeps a well-sized board above a verified but badly sized option", () => {
    const reliableBadFit = createProduct(
      {
        slug: "reliable-bad-fit",
        modelName: "Reliable Bad Fit",
        dataStatus: "verified",
        sourceName: "Official source",
        sourceUrl: "https://brand.test/reliable-bad-fit",
        flex: 6,
      },
      {
        sizeCm: 160,
        waistWidthMm: 246,
        recommendedWeightMin: 88,
        recommendedWeightMax: 105,
        widthType: "regular",
      },
    );

    const draftGoodFit = createProduct(
      {
        slug: "draft-good-fit",
        modelName: "Draft Good Fit",
        dataStatus: "draft",
        sourceName: null,
        sourceUrl: null,
        sourceCheckedAt: null,
        affiliateUrl: "https://store.test/draft-good-fit",
      },
      {
        sizeCm: 154,
        waistWidthMm: 252,
        recommendedWeightMin: 65,
        recommendedWeightMax: 80,
        widthType: "regular",
      },
    );

    const result = getRecommendation(baseInput, [
      reliableBadFit,
      draftGoodFit,
    ]);

    expect(result.recommendedBoards[0]?.product.slug).toBe("draft-good-fit");
  });
});

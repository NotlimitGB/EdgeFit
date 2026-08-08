import { describe, expect, it } from "vitest";
import type { Product, ProductSize, QuizInput } from "@/types/domain";
import { ALGORITHM_VERSION, getRecommendation } from "./engine";

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
    camberProfile: "hybrid-camber",
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
  it("reports the localized width-safety algorithm version", () => {
    expect(ALGORITHM_VERSION).toBe("v1.6.3");
  });

  it("returns stable all-mountain length range for base input", () => {
    const result = getRecommendation(baseInput, defaultBoards);

    expect(result.lengthRange).toEqual({ min: 152, max: 156 });
    expect(result.recommendedBoards.length).toBeGreaterThanOrEqual(3);
  });

  it("uses a smaller regular target waist for an EU 37 boot", () => {
    const result = getRecommendation(
      {
        ...baseInput,
        bootSizeEu: 37,
      },
      defaultBoards,
    );

    expect(result.recommendedWidthType).toBe("regular");
    expect(result.targetWaistWidthMm).toBeLessThan(250);
    expect(result.bootDragRisk).toBe("low");
  });

  it("does not elevate boot-drag risk for an EU 37 unknown stance", () => {
    const result = getRecommendation(
      {
        ...baseInput,
        bootSizeEu: 37,
        stanceType: "unknown",
      },
      defaultBoards,
    );

    expect(result.bootDragRisk).toBe("low");
  });

  it("keeps EU 43 neutral outside carving and promotes only carving intent", () => {
    const balanced = getRecommendation(
      {
        ...baseInput,
        bootSizeEu: 43,
        terrainPriority: "balanced",
      },
      defaultBoards,
    );
    const carving = getRecommendation(
      {
        ...baseInput,
        bootSizeEu: 43,
        terrainPriority: "groomers-carving",
      },
      defaultBoards,
    );
    const widthRank = { regular: 0, "mid-wide": 1, wide: 2 } as const;

    expect(balanced.recommendedWidthType).toBe("regular");
    expect(balanced.targetWaistWidthMm).toBe(250);
    expect(carving.recommendedWidthType).toBe("mid-wide");
    expect(carving.targetWaistWidthMm).toBeGreaterThanOrEqual(257);
    expect(carving.targetWaistWidthMm).toBeLessThanOrEqual(259);
    expect(carving.targetWaistWidthMm).toBeGreaterThan(
      balanced.targetWaistWidthMm,
    );
    expect(widthRank[carving.recommendedWidthType]).toBeGreaterThanOrEqual(
      widthRank[balanced.recommendedWidthType],
    );
    expect(carving.bootDragRisk).toBe(balanced.bootDragRisk);
    expect(carving.explanation.join(" ")).toContain("углах закантовки");
    expect(balanced.explanation.join(" ")).not.toContain("углах закантовки");
  });

  it("adds only a modest carving buffer for EU 42 and keeps regular width", () => {
    const balanced = getRecommendation(
      {
        ...baseInput,
        bootSizeEu: 42,
        terrainPriority: "balanced",
      },
      defaultBoards,
    );
    const carving = getRecommendation(
      {
        ...baseInput,
        bootSizeEu: 42,
        terrainPriority: "groomers-carving",
      },
      defaultBoards,
    );

    expect(balanced.targetWaistWidthMm).toBe(250);
    expect(carving.recommendedWidthType).toBe("regular");
    expect(carving.targetWaistWidthMm).toBeGreaterThan(
      balanced.targetWaistWidthMm,
    );
    expect(carving.targetWaistWidthMm - balanced.targetWaistWidthMm).toBeLessThanOrEqual(
      3,
    );
  });

  it("preserves the EU 43.5 base and adds carving clearance", () => {
    const balanced = getRecommendation(
      {
        ...baseInput,
        bootSizeEu: 43.5,
        terrainPriority: "balanced",
      },
      defaultBoards,
    );
    const carving = getRecommendation(
      {
        ...baseInput,
        bootSizeEu: 43.5,
        terrainPriority: "groomers-carving",
      },
      defaultBoards,
    );

    expect(balanced.recommendedWidthType).toBe("mid-wide");
    expect(balanced.targetWaistWidthMm).toBe(257);
    expect(carving.recommendedWidthType).toBe("mid-wide");
    expect(carving.targetWaistWidthMm).toBeGreaterThanOrEqual(260);
    expect(carving.targetWaistWidthMm).toBeLessThanOrEqual(262);
  });

  it("applies duck correction after carving clearance without erasing it", () => {
    const standardCarving = getRecommendation(
      {
        ...baseInput,
        bootSizeEu: 43.5,
        terrainPriority: "groomers-carving",
        stanceType: "standard",
      },
      defaultBoards,
    );
    const duckCarving = getRecommendation(
      {
        ...baseInput,
        bootSizeEu: 43.5,
        terrainPriority: "groomers-carving",
        stanceType: "duck",
      },
      defaultBoards,
    );
    const duckBalanced = getRecommendation(
      {
        ...baseInput,
        bootSizeEu: 43.5,
        terrainPriority: "balanced",
        stanceType: "duck",
      },
      defaultBoards,
    );

    expect(duckCarving.targetWaistWidthMm).toBeLessThan(
      standardCarving.targetWaistWidthMm,
    );
    expect(duckCarving.targetWaistWidthMm).toBeGreaterThan(
      duckBalanced.targetWaistWidthMm,
    );
  });

  it("moves width recommendation to mid-wide for larger boots", () => {
    const result = getRecommendation({
      ...baseInput,
      bootSizeEu: 44,
    }, defaultBoards);

    expect(result.recommendedWidthType).toBe("mid-wide");
    expect(result.targetWaistWidthMm).toBeGreaterThanOrEqual(257);
  });

  it("preserves the wide boundary at EU 45.5", () => {
    const result = getRecommendation(
      {
        ...baseInput,
        bootSizeEu: 45.5,
      },
      defaultBoards,
    );

    expect(result.recommendedWidthType).toBe("wide");
  });

  it("moves width recommendation to wide for very large boots", () => {
    const result = getRecommendation({
      ...baseInput,
      bootSizeEu: 46,
    }, defaultBoards);

    expect(result.recommendedWidthType).toBe("wide");
    expect(result.targetWaistWidthMm).toBeGreaterThanOrEqual(264);
    expect(result.bootDragRisk).toBe("medium");
  });

  it("keeps an EU 46 duck stance at meaningful boot-drag concern", () => {
    const result = getRecommendation(
      {
        ...baseInput,
        bootSizeEu: 46,
        stanceType: "duck",
      },
      defaultBoards,
    );

    expect(result.recommendedWidthType).toBe("wide");
    expect(result.bootDragRisk).toBe("medium");
  });

  it("keeps an EU 46 unknown stance more cautious than standard", () => {
    const standard = getRecommendation(
      {
        ...baseInput,
        bootSizeEu: 46,
        stanceType: "standard",
      },
      defaultBoards,
    );
    const unknown = getRecommendation(
      {
        ...baseInput,
        bootSizeEu: 46,
        stanceType: "unknown",
      },
      defaultBoards,
    );

    expect(standard.bootDragRisk).toBe("medium");
    expect(unknown.bootDragRisk).toBe("high");
  });

  it("gives an EU 49 boot a distinct waist tier and high concern", () => {
    const result = getRecommendation(
      {
        ...baseInput,
        bootSizeEu: 49,
      },
      defaultBoards,
    );

    expect(result.recommendedWidthType).toBe("wide");
    expect(result.targetWaistWidthMm).toBeGreaterThanOrEqual(270);
    expect(result.bootDragRisk).toBe("high");
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

  it("moves the width-fit ranking toward carving clearance only for carving", () => {
    const narrowerBoard = createProduct(
      {
        slug: "neutral-width-board",
        modelName: "Neutral Width Board",
      },
      { waistWidthMm: 251, widthType: "regular" },
    );
    const carvingWidthBoard = createProduct(
      {
        slug: "carving-width-board",
        modelName: "Carving Width Board",
      },
      { waistWidthMm: 259, widthType: "mid-wide" },
    );
    const balanced = getRecommendation(
      {
        ...baseInput,
        bootSizeEu: 43,
        terrainPriority: "balanced",
      },
      [carvingWidthBoard, narrowerBoard],
    );
    const carving = getRecommendation(
      {
        ...baseInput,
        bootSizeEu: 43,
        terrainPriority: "groomers-carving",
      },
      [narrowerBoard, carvingWidthBoard],
    );

    expect(balanced.recommendedBoards[0]?.product.slug).toBe(
      "neutral-width-board",
    );
    expect(carving.recommendedBoards[0]?.product.slug).toBe(
      "carving-width-board",
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

  it("excludes an absurd child-sized candidate from every presented result", () => {
    const absurdBoard = createProduct(
      {
        slug: "synthetic-absurd-size",
        modelName: "Synthetic Absurd Size",
      },
      {
        sizeCm: 86,
        waistWidthMm: 180,
        recommendedWeightMin: 0,
        recommendedWeightMax: null,
      },
    );

    const result = getRecommendation(baseInput, [absurdBoard]);
    expect(result.recommendedBoards.map((match) => match.product.slug)).not.toContain(
      "synthetic-absurd-size",
    );
    expect(result.avoidBoards.map((match) => match.product.slug)).not.toContain(
      "synthetic-absurd-size",
    );
  });

  it.each([
    {
      label: "length",
      size: { sizeCm: 140 },
    },
    {
      label: "waist deficit",
      size: { waistWidthMm: 238 },
    },
    {
      label: "known weight range",
      size: { recommendedWeightMin: 94, recommendedWeightMax: 110 },
    },
  ] satisfies Array<{ label: string; size: Partial<ProductSize> }>)(
    "excludes a catastrophic $label mismatch on its own",
    ({ label, size }) => {
      const product = createProduct(
        {
          slug: `catastrophic-${label.replaceAll(" ", "-")}`,
          modelName: `Catastrophic ${label}`,
        },
        size,
      );

      const result = getRecommendation(baseInput, [product]);

      expect(result.recommendedBoards).toHaveLength(0);
      expect(result.avoidBoards).toHaveLength(0);
    },
  );

  it("excludes a size with two non-catastrophic hard mismatches", () => {
    const product = createProduct(
      {
        slug: "two-hard-mismatches",
        modelName: "Two Hard Mismatches",
      },
      {
        sizeCm: 148,
        waistWidthMm: 244,
      },
    );

    const result = getRecommendation(baseInput, [product]);

    expect(result.recommendedBoards).toHaveLength(0);
    expect(result.avoidBoards).toHaveLength(0);
  });

  it("keeps isolated hard and soft near-miss sizes eligible", () => {
    const isolatedHard = createProduct(
      {
        slug: "isolated-hard-length",
        modelName: "Isolated Hard Length",
      },
      { sizeCm: 148 },
    );
    const softNearMiss = createProduct(
      {
        slug: "soft-length-near-miss",
        modelName: "Soft Length Near Miss",
      },
      { sizeCm: 150 },
    );

    const result = getRecommendation(baseInput, [isolatedHard, softNearMiss]);
    const presentedSlugs = [
      ...result.recommendedBoards,
      ...result.avoidBoards,
    ].map((match) => match.product.slug);

    expect(presentedSlugs).toContain("isolated-hard-length");
    expect(presentedSlugs).toContain("soft-length-near-miss");
  });

  it("chooses the valid size when a product mixes impossible and valid sizes", () => {
    const mixedSizeProduct = createProduct({
      slug: "mixed-size-product",
      modelName: "Mixed Size Product",
      sizes: [
        createSize({
          sizeCm: 86,
          waistWidthMm: 180,
          recommendedWeightMin: 0,
          recommendedWeightMax: null,
        }),
        createSize({ sizeCm: 154, waistWidthMm: 252 }),
      ],
    });

    const result = getRecommendation(baseInput, [mixedSizeProduct]);
    const selectedMatch = [
      ...result.recommendedBoards,
      ...result.avoidBoards,
    ].find((match) => match.product.slug === "mixed-size-product");

    expect(selectedMatch?.size.sizeCm).toBe(154);
  });

  it("excludes a product when none of its available sizes are eligible", () => {
    const product = createProduct({
      slug: "no-eligible-sizes",
      modelName: "No Eligible Sizes",
      sizes: [
        createSize({ sizeCm: 86, waistWidthMm: 180 }),
        createSize({ sizeCm: 116, waistWidthMm: 205 }),
      ],
    });

    const result = getRecommendation(baseInput, [product]);

    expect(result.recommendedBoards).toHaveLength(0);
    expect(result.avoidBoards).toHaveLength(0);
  });

  it("does not pad recommendations with below-threshold candidates", () => {
    const strongBoard = createProduct({
      slug: "single-strong-board",
      modelName: "Single Strong Board",
    });
    const poorBoards = ["one", "two", "three"].map((suffix, index) =>
      createProduct(
        {
          slug: `poor-candidate-${suffix}`,
          modelName: `Poor Candidate ${suffix}`,
          ridingStyle: "park",
          skillLevel: "advanced",
          flex: 10,
          boardLine: "women",
          shapeType: "directional",
          camberProfile: "rocker",
          dataStatus: "draft",
          sourceName: null,
          sourceUrl: null,
          sourceCheckedAt: null,
          affiliateUrl: `https://example.com/poor-${suffix}`,
        },
        { sizeCm: 148 + index },
      ),
    );

    const result = getRecommendation(baseInput, [strongBoard, ...poorBoards]);

    expect(result.recommendedBoards.map((match) => match.product.slug)).toEqual([
      "single-strong-board",
    ]);
  });

  it("keeps a plausible below-threshold fit as an alternative", () => {
    const strongBoard = createProduct({
      slug: "alternative-strong-board",
      modelName: "Alternative Strong Board",
    });
    const plausibleBoard = createProduct(
      {
        slug: "plausible-alternative",
        modelName: "Plausible Alternative",
        ridingStyle: "park",
        skillLevel: "advanced",
        flex: 9,
        shapeType: "twin",
        dataStatus: "draft",
        sourceName: null,
        sourceUrl: null,
        sourceCheckedAt: null,
        affiliateUrl: "https://example.com/plausible-alternative",
      },
      { sizeCm: 150 },
    );
    const absurdBoard = createProduct(
      {
        slug: "alternative-absurd-board",
        modelName: "Alternative Absurd Board",
      },
      { sizeCm: 86, waistWidthMm: 180 },
    );

    const result = getRecommendation(baseInput, [
      strongBoard,
      plausibleBoard,
      absurdBoard,
    ]);
    const plausibleMatch = result.avoidBoards.find(
      (match) => match.product.slug === "plausible-alternative",
    );

    expect(plausibleMatch?.score).toBeGreaterThanOrEqual(40);
    expect(plausibleMatch?.score).toBeLessThan(56);
    expect(
      [...result.recommendedBoards, ...result.avoidBoards].some(
        (match) => match.product.slug === "alternative-absurd-board",
      ),
    ).toBe(false);
  });

  it("does not expose an eligible candidate below the alternative floor", () => {
    const lowValueBoard = createProduct(
      {
        slug: "below-alternative-floor",
        modelName: "Below Alternative Floor",
        ridingStyle: "park",
        skillLevel: "advanced",
        flex: 10,
        boardLine: "women",
        shapeType: "directional",
        camberProfile: "rocker",
        dataStatus: "draft",
        sourceName: null,
        sourceUrl: null,
        sourceCheckedAt: null,
        affiliateUrl: "https://example.com/below-floor",
      },
      { sizeCm: 148 },
    );

    const result = getRecommendation(baseInput, [lowValueBoard]);

    expect(result.recommendedBoards).toHaveLength(0);
    expect(result.avoidBoards).toHaveLength(0);
  });

  it("orders eligible alternatives from strongest to weakest", () => {
    const boards = [154, 155, 153, 156, 152, 151, 150].map(
      (sizeCm, index) =>
        createProduct(
          {
            slug: `ordered-alternative-${index + 1}`,
            modelName: `Ordered Alternative ${index + 1}`,
          },
          { sizeCm },
        ),
    );

    const result = getRecommendation(baseInput, boards);
    const alternativeScores = result.avoidBoards.map((match) => match.score);

    expect(result.recommendedBoards).toHaveLength(4);
    expect(result.avoidBoards).toHaveLength(3);
    expect(alternativeScores).toEqual(
      [...alternativeScores].sort((left, right) => right - left),
    );
  });
});

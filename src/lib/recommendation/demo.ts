import { getRecommendation } from "@/lib/recommendation/engine";
import type { Product, ProductSize, QuizInput } from "@/types/domain";

export const demoInput: QuizInput = {
  heightCm: 178,
  weightKg: 74,
  bootSizeEu: 44,
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
    waistWidthMm: 257,
    recommendedWeightMin: 65,
    recommendedWeightMax: 82,
    widthType: "mid-wide",
    isAvailable: true,
    ...overrides,
  };
}

function createProduct(
  slug: string,
  brand: string,
  modelName: string,
  overrides: Partial<Product> = {},
  sizeOverrides: Partial<ProductSize> = {},
): Product {
  return {
    id: slug,
    slug,
    brand,
    modelName,
    seasonLabel: null,
    descriptionShort: `${brand} ${modelName}`,
    descriptionFull: `${brand} ${modelName}`,
    ridingStyle: "all-mountain",
    skillLevel: "intermediate",
    flex: 6,
    priceFrom: 49990,
    imageUrl: "https://images.edgefit.local/demo-board.jpg",
    galleryImages: [],
    affiliateUrl: `https://shop.edgefit.local/${slug}`,
    isActive: true,
    boardLine: "men",
    shapeType: "directional-twin",
    camberProfile: "hybrid-camber",
    dataStatus: "verified",
    sourceName: "Demo catalog",
    sourceUrl: `https://catalog.edgefit.local/${slug}`,
    sourceCheckedAt: "2026-04-13",
    scenarios: [],
    notIdealFor: [],
    sizes: [createSize(sizeOverrides)],
    ...overrides,
  };
}

export const demoBoards: Product[] = [
  createProduct("demo-all-mountain", "EdgeFit", "All Mountain", {}, { sizeCm: 154 }),
  createProduct(
    "demo-playful",
    "EdgeFit",
    "Playful Twin",
    {
      ridingStyle: "park",
      shapeType: "twin",
      flex: 5,
      boardLine: "unisex",
    },
    { sizeCm: 153, waistWidthMm: 255, widthType: "regular" },
  ),
  createProduct(
    "demo-stable",
    "EdgeFit",
    "Stable Directional",
    {
      ridingStyle: "freeride",
      shapeType: "directional",
      flex: 7,
    },
    { sizeCm: 156, waistWidthMm: 259, widthType: "mid-wide" },
  ),
];

export const demoRecommendation = getRecommendation(demoInput, demoBoards);

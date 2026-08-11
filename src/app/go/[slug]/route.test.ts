import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  canonicalLookup: vi.fn(),
  saveAnalyticsEvent: vi.fn(),
}));

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
  priceFrom: 50000,
  imageUrl: "/board.jpg",
  affiliateUrl: "https://trial-sport.ru/goods/1.html",
  isActive: true,
  boardLine: "unisex",
  shapeType: "directional-twin",
  camberProfile: "hybrid-camber",
  dataStatus: "verified",
  sourceName: null,
  sourceUrl: null,
  sourceCheckedAt: null,
  scenarios: [],
  notIdealFor: [],
  sizes: [],
};

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "session-1" }) }),
  headers: async () => ({ get: () => null }),
}));
vi.mock("@/lib/products", () => ({
  getProductBySlug: async () => product,
}));
vi.mock("@/lib/canonical-catalog", () => ({
  getCanonicalOfferIdentityBySlug: (...parameters: unknown[]) =>
    mocks.canonicalLookup(...parameters),
}));
vi.mock("@/lib/analytics/server", () => ({
  saveAnalyticsEvent: (...parameters: unknown[]) =>
    mocks.saveAnalyticsEvent(...parameters),
}));

import { GET } from "@/app/go/[slug]/route";

describe("saved-result store redirect privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the exact merchant redirect without server click persistence", async () => {
    const response = await GET(
      new Request(
        "https://edge-fit.test/go/test-board?from=saved-result-top&placement=recommended",
      ),
      { params: Promise.resolve({ slug: "test-board" }) },
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(product.affiliateUrl);
    expect(mocks.canonicalLookup).not.toHaveBeenCalled();
    expect(mocks.saveAnalyticsEvent).not.toHaveBeenCalled();
  });
});

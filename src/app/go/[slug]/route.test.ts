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
  sizes: [
    {
      sizeCm: 156,
      sizeLabel: "156W",
      waistWidthMm: 264,
      recommendedWeightMin: 65,
      recommendedWeightMax: 85,
      widthType: "wide",
      isAvailable: true,
    },
  ],
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
    product.affiliateUrl = "https://trial-sport.ru/goods/1.html";
    product.sizes[0].isAvailable = true;
    mocks.canonicalLookup.mockResolvedValue(undefined);
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

describe("store click provenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    product.affiliateUrl = "https://trial-sport.ru/goods/1.html";
    product.sizes[0].isAvailable = true;
    mocks.canonicalLookup.mockResolvedValue({
      boardSlug: "test-family",
      offerSlug: "test-board",
    });
  });

  it("persists one server-authoritative first-party event and redirects", async () => {
    const response = await GET(
      new Request(
        "https://edge-fit.test/go/test-board?from=result-top&placement=primary_recommendation&sizeCm=156&sizeLabel=156W&widthType=wide&recommendationRank=1&recommendationScore=92&resultVariant=session&algorithmVersion=v1.6.4",
      ),
      { params: Promise.resolve({ slug: "test-board" }) },
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(product.affiliateUrl);
    expect(mocks.saveAnalyticsEvent).toHaveBeenCalledOnce();
    expect(mocks.saveAnalyticsEvent).toHaveBeenCalledWith({
      sessionId: "session-1",
      eventName: "product_clicked",
      pagePath: "/outbound/result-top",
      payload: expect.objectContaining({
        board_slug: "test-family",
        offer_slug: "test-board",
        product_id: "product-1",
        product_slug: "test-board",
        brand: "Test",
        model_name: "Board",
        size_label: "156W",
        recommendation_rank: 1,
        recommendation_score: 92,
        placement: "primary_recommendation",
        store_code: "trial-sport",
        source_product_id: "1",
        destination_url: product.affiliateUrl,
        result_variant: "session",
        algorithm_version: "v1.6.4",
        exact_size_offer_status: "confirmed_available",
        exact_size_matched: true,
      }),
    });
  });

  it("recomputes not-confirmed status from server ProductSize data", async () => {
    product.sizes[0].isAvailable = false;

    await GET(
      new Request(
        "https://edge-fit.test/go/test-board?from=result-top&sizeCm=156&sizeLabel=156W&widthType=wide&exactSizeOfferStatus=confirmed_available",
      ),
      { params: Promise.resolve({ slug: "test-board" }) },
    );

    expect(mocks.saveAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          exact_size_offer_status: "not_confirmed",
          exact_size_matched: true,
        }),
      }),
    );
  });

  it("recomputes search-only status for the server fallback destination", async () => {
    product.affiliateUrl = "https://example.com/test-board";

    const response = await GET(
      new Request(
        "https://edge-fit.test/go/test-board?from=result-top&sizeCm=156&sizeLabel=156W&widthType=wide",
      ),
      { params: Promise.resolve({ slug: "test-board" }) },
    );

    expect(response.headers.get("location")).toContain("trial-sport.ru/search/");
    expect(mocks.saveAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          exact_size_offer_status: "search_only",
          exact_size_matched: true,
          source_product_id: null,
        }),
      }),
    );
  });

  it("does not block merchant navigation when analytics persistence fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.saveAnalyticsEvent.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await GET(
      new Request(
        "https://edge-fit.test/go/test-board?from=result-top&placement=primary_recommendation",
      ),
      { params: Promise.resolve({ slug: "test-board" }) },
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(product.affiliateUrl);
    expect(mocks.saveAnalyticsEvent).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledWith(
      "Outbound click analytics persistence failed.",
      {
        category: "outbound_click_analytics_failed",
        errorName: "Error",
      },
    );
    errorSpy.mockRestore();
  });
});

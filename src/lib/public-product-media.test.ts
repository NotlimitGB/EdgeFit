import { describe, expect, it } from "vitest";
import { demoRecommendation } from "@/lib/recommendation/demo";
import { publicProductMedia, withoutProductPhotos } from "./public-product-media";

describe("temporary product photo shutdown", () => {
  it("does not expose any product photo candidates, including local and external media", () => {
    expect(publicProductMedia(["/board.jpg", "https://example.test/board.jpg", null])).toEqual([]);
  });
  it("preserves recommendation data and provenance without mutating the source", () => {
    const source = structuredClone(demoRecommendation);
    expect(source.recommendedBoards.length).toBeGreaterThan(0);
    source.avoidBoards = [...source.recommendedBoards];
    source.recommendedBoards[0].product.sourceUrl = "https://example.test/source";
    const before = JSON.stringify(source);
    const result = withoutProductPhotos(source);
    for (const match of [...result.recommendedBoards, ...result.avoidBoards]) {
      expect(match.product.imageUrl).toBe("");
      expect(match.product.galleryImages).toEqual([]);
    }
    expect(result.recommendedBoards[0].product.sourceUrl).toBe("https://example.test/source");
    expect(result.recommendedBoards.map(x => [x.product.slug, x.score, x.size, x.reasons]))
      .toEqual(source.recommendedBoards.map(x => [x.product.slug, x.score, x.size, x.reasons]));
    expect(JSON.stringify(source)).toBe(before);
  });
});

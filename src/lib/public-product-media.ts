import type { RecommendationResult } from "@/types/domain";

/** Temporary product-photo shutdown. Revert this policy when display is authorized. */
export function publicProductMedia(_urls: readonly (string | null | undefined)[]): string[] {
  void _urls;
  return [];
}

export function withoutProductPhotos(result: RecommendationResult): RecommendationResult {
  const project = (match: RecommendationResult["recommendedBoards"][number]) => ({
    ...match, product: { ...match.product, imageUrl: "", galleryImages: [] },
  });
  return { ...result, recommendedBoards: result.recommendedBoards.map(project), avoidBoards: result.avoidBoards.map(project) };
}

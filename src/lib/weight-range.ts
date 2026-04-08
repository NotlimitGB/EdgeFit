import type { ProductSize } from "@/types/domain";

export function getRecommendedWeightMaxValue(
  size: Pick<ProductSize, "recommendedWeightMax">,
) {
  return size.recommendedWeightMax ?? Number.POSITIVE_INFINITY;
}

export function formatRecommendedWeightRange(
  size: Pick<ProductSize, "recommendedWeightMin" | "recommendedWeightMax">,
) {
  if (size.recommendedWeightMin <= 0 && size.recommendedWeightMax == null) {
    return "нет данных";
  }

  if (size.recommendedWeightMax == null) {
    return `от ${size.recommendedWeightMin} кг`;
  }

  return `${size.recommendedWeightMin}-${size.recommendedWeightMax} кг`;
}

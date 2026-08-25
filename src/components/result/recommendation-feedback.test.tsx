import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RecommendationResult } from "@/types/domain";
import {
  buildRecommendationFeedbackContext,
  createRecommendationFeedbackTracker,
  RecommendationFeedback,
} from "@/components/result/recommendation-feedback";

const recommendation = {
  algorithmVersion: "v1.6.4",
  recommendedBoards: [
    {
      product: {
        id: "product-1",
        slug: "jones-mountain-twin",
        brand: "Jones",
        modelName: "Mountain Twin",
        affiliateUrl: "https://traektoria.ru/product/123_board/",
        sizes: [
          {
            sizeCm: 156,
            sizeLabel: "156 cm",
            waistWidthMm: 254,
            recommendedWeightMin: 65,
            recommendedWeightMax: 85,
            widthType: "regular",
            isAvailable: true,
          },
        ],
      },
      size: {
        sizeCm: 156,
        sizeLabel: "156 cm",
        waistWidthMm: 254,
        recommendedWeightMin: 65,
        recommendedWeightMax: 85,
        widthType: "regular",
        isAvailable: true,
      },
      score: 92,
    },
  ],
} as RecommendationResult;

describe("recommendation feedback", () => {
  it("builds exact top-recommendation provenance", () => {
    expect(buildRecommendationFeedbackContext(recommendation)).toEqual({
      product_id: "product-1",
      product_slug: "jones-mountain-twin",
      brand: "Jones",
      model_name: "Mountain Twin",
      recommended_size_label: "156",
      recommended_size_cm: 156,
      recommended_width_type: "regular",
      recommendation_rank: 1,
      recommendation_score: 92,
      algorithm_version: "v1.6.4",
      result_variant: "session",
      exact_size_offer_status: "confirmed_available",
    });
  });

  it("records only the first primary and first eligible reason", () => {
    const emit = vi.fn();
    const context = buildRecommendationFeedbackContext(recommendation)!;
    const tracker = createRecommendationFeedbackTracker(context, emit);

    expect(tracker.submitOutcome("need_more_confidence")).toBe(true);
    expect(tracker.submitOutcome("not_a_fit")).toBe(false);
    expect(tracker.submitReason("size_uncertainty")).toBe(true);
    expect(tracker.submitReason("price_or_offer")).toBe(false);

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenNthCalledWith(
      1,
      "recommendation_feedback_submitted",
      expect.objectContaining({
        feedback_outcome: "need_more_confidence",
        product_id: "product-1",
        recommended_size_label: "156",
        recommendation_rank: 1,
      }),
    );
    expect(emit).toHaveBeenNthCalledWith(
      2,
      "recommendation_feedback_reason_selected",
      expect.objectContaining({
        feedback_outcome: "need_more_confidence",
        feedback_reason: "size_uncertainty",
      }),
    );
  });

  it("does not accept a reason for the positive path", () => {
    const emit = vi.fn();
    const tracker = createRecommendationFeedbackTracker(
      buildRecommendationFeedbackContext(recommendation)!,
      emit,
    );

    tracker.submitOutcome("would_consider");
    expect(tracker.submitReason("other")).toBe(false);
    expect(emit).toHaveBeenCalledOnce();
  });

  it("renders accessible one-click choices without free text", () => {
    const markup = renderToStaticMarkup(
      <RecommendationFeedback recommendation={recommendation} />,
    );

    expect(markup).toContain("Помогла рекомендация принять решение?");
    expect(markup).toContain("Да, рассмотрю эту доску");
    expect(markup).toContain("Нужно больше уверенности");
    expect(markup).toContain("Нет, не подходит");
    expect(markup).not.toContain("textarea");
  });
});

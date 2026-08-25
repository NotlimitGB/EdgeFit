"use client";

import { useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics/client";
import { getBoardSizeLabel } from "@/lib/board-size";
import { getExactSizeOfferIntelligence } from "@/lib/exact-size-offer";
import type { RecommendationResult } from "@/types/domain";
import styles from "./result-view.module.css";

export const recommendationFeedbackOutcomes = [
  "would_consider",
  "need_more_confidence",
  "not_a_fit",
] as const;

export type RecommendationFeedbackOutcome =
  (typeof recommendationFeedbackOutcomes)[number];

export const recommendationFeedbackReasons = [
  "size_uncertainty",
  "board_uncertainty",
  "explanation_insufficient",
  "price_or_offer",
  "preference_mismatch",
  "other",
] as const;

export type RecommendationFeedbackReason =
  (typeof recommendationFeedbackReasons)[number];

const outcomeLabels: Record<RecommendationFeedbackOutcome, string> = {
  would_consider: "Да, рассмотрю эту доску",
  need_more_confidence: "Нужно больше уверенности",
  not_a_fit: "Нет, не подходит",
};

const reasonLabels: Record<RecommendationFeedbackReason, string> = {
  size_uncertainty: "Не уверен в размере",
  board_uncertainty: "Не уверен в самой модели",
  explanation_insufficient: "Не хватает объяснения",
  price_or_offer: "Цена или предложение магазина",
  preference_mismatch: "Не похоже на то, что я ищу",
  other: "Другая причина",
};

export interface RecommendationFeedbackContext {
  product_id: string;
  product_slug: string;
  brand: string;
  model_name: string;
  recommended_size_label: string;
  recommended_size_cm: number;
  recommended_width_type: string;
  recommendation_rank: 1;
  recommendation_score: number;
  algorithm_version: string;
  result_variant: "session";
  exact_size_offer_status: string;
}

type FeedbackEventName =
  | "recommendation_feedback_submitted"
  | "recommendation_feedback_reason_selected";

type FeedbackEmitter = (
  eventName: FeedbackEventName,
  payload: Record<string, unknown>,
) => void;

export function buildRecommendationFeedbackContext(
  recommendation: RecommendationResult,
): RecommendationFeedbackContext | null {
  const match = recommendation.recommendedBoards[0];

  if (!match) {
    return null;
  }

  const offerIntelligence = getExactSizeOfferIntelligence({
    product: match.product,
    recommendedSize: match.size,
    resultMode: "session",
  });

  return {
    product_id: match.product.id,
    product_slug: match.product.slug,
    brand: match.product.brand,
    model_name: match.product.modelName,
    recommended_size_label: getBoardSizeLabel(match.size),
    recommended_size_cm: match.size.sizeCm,
    recommended_width_type: match.size.widthType,
    recommendation_rank: 1,
    recommendation_score: match.score,
    algorithm_version: recommendation.algorithmVersion,
    result_variant: "session",
    exact_size_offer_status: offerIntelligence.status,
  };
}

export function createRecommendationFeedbackTracker(
  context: RecommendationFeedbackContext,
  emit: FeedbackEmitter,
) {
  let submittedOutcome: RecommendationFeedbackOutcome | null = null;
  let reasonSubmitted = false;

  return {
    submitOutcome(outcome: RecommendationFeedbackOutcome) {
      if (submittedOutcome) {
        return false;
      }

      submittedOutcome = outcome;
      emit("recommendation_feedback_submitted", {
        ...context,
        feedback_outcome: outcome,
      });
      return true;
    },
    submitReason(reason: RecommendationFeedbackReason) {
      if (
        reasonSubmitted ||
        (submittedOutcome !== "need_more_confidence" &&
          submittedOutcome !== "not_a_fit")
      ) {
        return false;
      }

      reasonSubmitted = true;
      emit("recommendation_feedback_reason_selected", {
        feedback_outcome: submittedOutcome,
        feedback_reason: reason,
        product_id: context.product_id,
        product_slug: context.product_slug,
        recommended_size_label: context.recommended_size_label,
        recommendation_rank: context.recommendation_rank,
        algorithm_version: context.algorithm_version,
        result_variant: context.result_variant,
      });
      return true;
    },
  };
}

export function RecommendationFeedback({
  recommendation,
}: {
  recommendation: RecommendationResult;
}) {
  const context = buildRecommendationFeedbackContext(recommendation);
  const [outcome, setOutcome] =
    useState<RecommendationFeedbackOutcome | null>(null);
  const [reason, setReason] = useState<RecommendationFeedbackReason | null>(null);
  const trackerRef = useRef<ReturnType<
    typeof createRecommendationFeedbackTracker
  > | null>(null);

  if (!context) {
    return null;
  }

  if (trackerRef.current == null) {
    trackerRef.current = createRecommendationFeedbackTracker(
      context,
      (eventName, payload) => {
        void trackEvent(eventName, payload);
      },
    );
  }

  function handleOutcome(selectedOutcome: RecommendationFeedbackOutcome) {
    if (trackerRef.current?.submitOutcome(selectedOutcome)) {
      setOutcome(selectedOutcome);
    }
  }

  function handleReason(selectedReason: RecommendationFeedbackReason) {
    if (trackerRef.current?.submitReason(selectedReason)) {
      setReason(selectedReason);
    }
  }

  return (
    <aside className={styles.recommendationFeedback} aria-labelledby="feedback-title">
      <div>
        <p className={styles.feedbackEyebrow}>Короткая обратная связь</p>
        <h3 id="feedback-title">Помогла рекомендация принять решение?</h3>
      </div>

      {!outcome ? (
        <div className={styles.feedbackChoices}>
          {recommendationFeedbackOutcomes.map((item) => (
            <button key={item} type="button" onClick={() => handleOutcome(item)}>
              {outcomeLabels[item]}
            </button>
          ))}
        </div>
      ) : outcome === "would_consider" || reason ? (
        <p className={styles.feedbackAcknowledgement} role="status">
          Спасибо — это помогает улучшать подбор.
        </p>
      ) : (
        <div className={styles.feedbackFollowUp}>
          <p>Что смущает больше всего? Ответ необязателен.</p>
          <div className={styles.feedbackReasons}>
            {recommendationFeedbackReasons.map((item) => (
              <button key={item} type="button" onClick={() => handleReason(item)}>
                {reasonLabels[item]}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

export const analyticsEvents = {
  homeViewed: "home_viewed",
  quizStarted: "quiz_started",
  quizStepViewed: "quiz_step_viewed",
  quizStepCompleted: "quiz_step_completed",
  quizCompleted: "quiz_completed",
  resultViewed: "result_viewed",
  productClicked: "product_clicked",
  emailSubmitted: "email_submitted",
  recalculationStarted: "recalculation_started",
  resultExited: "result_exited",
} as const;

export type AnalyticsEventName =
  (typeof analyticsEvents)[keyof typeof analyticsEvents];

type AnalyticsPayload = Record<string, unknown>;

export const yandexGoalNames: Partial<Record<AnalyticsEventName, string>> = {
  [analyticsEvents.quizStarted]: "edgefit_quiz_started",
  [analyticsEvents.quizStepCompleted]: "edgefit_quiz_step_completed",
  [analyticsEvents.quizCompleted]: "edgefit_quiz_completed",
  [analyticsEvents.resultViewed]: "edgefit_result_viewed",
  [analyticsEvents.productClicked]: "edgefit_product_clicked",
  [analyticsEvents.emailSubmitted]: "edgefit_email_submitted",
  [analyticsEvents.recalculationStarted]: "edgefit_recalculation_started",
};

function getScopedYandexGoalNames(
  eventName: AnalyticsEventName,
  payload: AnalyticsPayload,
) {
  if (
    eventName === analyticsEvents.productClicked &&
    payload.placement === "board-page"
  ) {
    return ["edgefit_product_clicked_board_page"];
  }

  return [];
}

export function getYandexGoalNames(
  eventName: AnalyticsEventName,
  payload: AnalyticsPayload = {},
) {
  const goalNames = [
    yandexGoalNames[eventName],
    ...getScopedYandexGoalNames(eventName, payload),
  ].filter((goalName): goalName is string => Boolean(goalName));

  return Array.from(new Set(goalNames));
}

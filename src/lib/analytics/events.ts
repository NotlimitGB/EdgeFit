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

export const yandexGoalNames: Partial<Record<AnalyticsEventName, string>> = {
  [analyticsEvents.quizStarted]: "edgefit_quiz_started",
  [analyticsEvents.quizStepCompleted]: "edgefit_quiz_step_completed",
  [analyticsEvents.quizCompleted]: "edgefit_quiz_completed",
  [analyticsEvents.resultViewed]: "edgefit_result_viewed",
  [analyticsEvents.productClicked]: "edgefit_product_clicked",
  [analyticsEvents.emailSubmitted]: "edgefit_email_submitted",
  [analyticsEvents.recalculationStarted]: "edgefit_recalculation_started",
};

export function getYandexGoalName(eventName: AnalyticsEventName) {
  return yandexGoalNames[eventName] ?? null;
}

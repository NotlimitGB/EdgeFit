import {
  analyticsEvents,
  type AnalyticsEventName,
} from "@/lib/analytics/events";

type AnalyticsPayload = Record<string, unknown>;
type ExternalAnalyticsValue = string | number | boolean;

const resultDimensionKeys = [
  "result_width_type",
  "result_boot_drag_risk",
  "result_shape_primary",
  "riding_style",
  "terrain_priority",
  "skill_level",
  "board_line_preference",
] as const;

const externalPayloadKeys = {
  [analyticsEvents.homeViewed]: [],
  [analyticsEvents.quizStarted]: [],
  [analyticsEvents.quizStepViewed]: ["step_name", "step_number"],
  [analyticsEvents.quizStepCompleted]: ["step_name", "step_number"],
  [analyticsEvents.quizCompleted]: [
    "riding_style",
    "terrain_priority",
    "skill_level",
    "board_line_preference",
    "result_width_type",
    "result_boot_drag_risk",
  ],
  [analyticsEvents.resultViewed]: resultDimensionKeys,
  [analyticsEvents.productClicked]: [
    "placement",
    "board_slug",
    "offer_slug",
    "size_cm",
    "size_label",
    "source_size_label",
    "width_type",
    ...resultDimensionKeys,
  ],
  [analyticsEvents.emailSubmitted]: ["source", ...resultDimensionKeys],
  [analyticsEvents.recalculationStarted]: resultDimensionKeys,
  [analyticsEvents.resultExited]: resultDimensionKeys,
} satisfies Record<AnalyticsEventName, readonly string[]>;

function normalizeExternalValue(value: unknown): ExternalAnalyticsValue | undefined {
  if (typeof value === "string") {
    const normalizedValue = value.trim();
    return normalizedValue.length > 0 ? normalizedValue : undefined;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  return typeof value === "boolean" ? value : undefined;
}

export function getExternalAnalyticsPayload(
  eventName: AnalyticsEventName,
  payload: AnalyticsPayload = {},
) {
  const allowedKeys = externalPayloadKeys[eventName];
  const safeEntries = allowedKeys.flatMap((key) => {
    const value = normalizeExternalValue(payload[key]);
    return value === undefined ? [] : ([[key, value]] as const);
  });

  return Object.fromEntries(safeEntries) as Record<string, ExternalAnalyticsValue>;
}

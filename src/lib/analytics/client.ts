import { getOrCreateSessionId } from "@/lib/session-id";
import {
  getYandexGoalNames,
  type AnalyticsEventName,
} from "@/lib/analytics/events";

type AnalyticsPayload = Record<string, unknown>;

interface TrackEventOptions {
  useBeacon?: boolean;
  skipInternalApi?: boolean;
}

function getYandexMetrikaId() {
  const rawValue = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID;
  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function normalizeYandexParams(payload: AnalyticsPayload) {
  const normalizedEntries = Object.entries(payload).flatMap(([key, value]) => {
    if (value == null) {
      return [];
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return [[key, value] as const];
    }

    if (Array.isArray(value)) {
      return [[key, value.join(", ")] as const];
    }

    return [[key, JSON.stringify(value)] as const];
  });

  return Object.fromEntries(normalizedEntries);
}

function sendYandexGoal(eventName: AnalyticsEventName, payload: AnalyticsPayload) {
  if (typeof window === "undefined") {
    return;
  }

  const yandexMetrikaId = getYandexMetrikaId();
  const ym = (window as Window & {
    ym?: (counterId: number, method: string, goal: string, params?: Record<string, unknown>) => void;
  }).ym;

  if (!yandexMetrikaId || !ym) {
    return;
  }

  const goalNames = getYandexGoalNames(eventName, payload);

  if (goalNames.length === 0) {
    return;
  }

  const params = normalizeYandexParams(payload);

  for (const goalName of goalNames) {
    ym(yandexMetrikaId, "reachGoal", goalName, params);
  }
}

function buildBody(
  eventName: AnalyticsEventName,
  payload: AnalyticsPayload = {},
  pagePath?: string,
) {
  return JSON.stringify({
    sessionId: getOrCreateSessionId(),
    eventName,
    pagePath:
      pagePath ??
      (typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : undefined),
    payload,
  });
}

export async function trackEvent(
  eventName: AnalyticsEventName,
  payload: AnalyticsPayload = {},
  options: TrackEventOptions = {},
) {
  if (typeof window === "undefined") {
    return;
  }

  sendYandexGoal(eventName, payload);

  if (options.skipInternalApi) {
    return;
  }

  const body = buildBody(eventName, payload);

  if (options.useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
    const sent = navigator.sendBeacon(
      "/api/analytics",
      new Blob([body], { type: "application/json" }),
    );

    if (sent) {
      return;
    }
  }

  try {
    await fetch("/api/analytics", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
      keepalive: options.useBeacon,
    });
  } catch {
    // Аналитика не должна ломать пользовательский сценарий.
  }
}

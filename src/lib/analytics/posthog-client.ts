import type { AnalyticsEventName } from "@/lib/analytics/events";
import { getExternalAnalyticsPayload } from "@/lib/analytics/external-payload";

type AnalyticsPayload = Record<string, unknown>;
type PostHogClient = (typeof import("posthog-js"))["default"];

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

let postHogClientPromise: Promise<PostHogClient | null> | null = null;

export function getPostHogConfiguration(
  key = process.env.NEXT_PUBLIC_POSTHOG_KEY,
  host = process.env.NEXT_PUBLIC_POSTHOG_HOST,
) {
  const normalizedKey = key?.trim();

  if (!normalizedKey) {
    return null;
  }

  return {
    key: normalizedKey,
    host: host?.trim() || DEFAULT_POSTHOG_HOST,
  };
}

async function getPostHogClient() {
  if (typeof window === "undefined") {
    return null;
  }

  const configuration = getPostHogConfiguration();

  if (!configuration) {
    return null;
  }

  postHogClientPromise ??= import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(configuration.key, {
        api_host: configuration.host,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_dead_clicks: false,
        capture_heatmaps: false,
        capture_performance: false,
        capture_exceptions: false,
        disable_session_recording: true,
        disable_surveys: true,
        person_profiles: "identified_only",
        advanced_disable_flags: true,
        rageclick: false,
      });

      return posthog;
    })
    .catch(() => null);

  return postHogClientPromise;
}

export async function capturePostHogEvent(
  eventName: AnalyticsEventName,
  payload: AnalyticsPayload = {},
) {
  try {
    const posthog = await getPostHogClient();

    if (posthog) {
      posthog.capture(eventName, getExternalAnalyticsPayload(eventName, payload));
    }
  } catch {
    // Внешняя аналитика не должна влиять на пользовательский сценарий.
  }
}

export async function capturePostHogPageview(currentUrl: string) {
  try {
    const posthog = await getPostHogClient();

    if (posthog) {
      posthog.capture("$pageview", { $current_url: currentUrl });
    }
  } catch {
    // Внешняя аналитика не должна влиять на пользовательский сценарий.
  }
}

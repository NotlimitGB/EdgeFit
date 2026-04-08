"use client";

import { useEffect } from "react";
import type { AnalyticsEventName } from "@/lib/analytics/events";
import { trackEvent } from "@/lib/analytics/client";

export function MountEvent({
  eventName,
  payload,
}: {
  eventName: AnalyticsEventName;
  payload?: Record<string, unknown>;
}) {
  useEffect(() => {
    void trackEvent(eventName, payload);
  }, [eventName, payload]);

  return null;
}

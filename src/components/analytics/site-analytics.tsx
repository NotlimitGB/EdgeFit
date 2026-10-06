"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { getHostingProvider, isBrowserAnalyticsAllowed } from "@/lib/deployment-policy";
import { YandexMetrika } from "@/components/analytics/yandex-metrika";
import { captureCurrentFirstTouchAcquisitionContext } from "@/lib/analytics/acquisition-context";
import { isPrivateSavedResultPath } from "@/lib/saved-result-contract";

interface SiteAnalyticsProps {
  yandexMetrikaId: number | null;
  enableVercelTelemetry?: boolean;
}

const subscribeHost = () => () => {};
const serverAnalyticsAllowed = () => getHostingProvider() !== "timeweb";

export function SiteAnalytics({ yandexMetrikaId, enableVercelTelemetry = true }: SiteAnalyticsProps) {
  const pathname = usePathname();
  // Timeweb SSR emits no tracker/pixel. Hydration decides using the actual browser host.
  const analyticsAllowed = useSyncExternalStore(subscribeHost, isBrowserAnalyticsAllowed, serverAnalyticsAllowed);

  useEffect(() => {
    if (analyticsAllowed && !isPrivateSavedResultPath(pathname)) {
      captureCurrentFirstTouchAcquisitionContext();
    }
  }, [pathname, analyticsAllowed]);

  if (!analyticsAllowed || isPrivateSavedResultPath(pathname)) {
    return null;
  }

  return (
    <>
      {yandexMetrikaId ? <YandexMetrika counterId={yandexMetrikaId} /> : null}
      {enableVercelTelemetry && getHostingProvider() === "vercel" ? <Analytics /> : null}
      {enableVercelTelemetry && getHostingProvider() === "vercel" ? <SpeedInsights /> : null}
    </>
  );
}

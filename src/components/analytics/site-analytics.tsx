"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { YandexMetrika } from "@/components/analytics/yandex-metrika";
import { captureCurrentFirstTouchAcquisitionContext } from "@/lib/analytics/acquisition-context";
import { isPrivateSavedResultPath } from "@/lib/saved-result-contract";

interface SiteAnalyticsProps {
  yandexMetrikaId: number | null;
}

export function SiteAnalytics({ yandexMetrikaId }: SiteAnalyticsProps) {
  const pathname = usePathname();

  useEffect(() => {
    if (!isPrivateSavedResultPath(pathname)) {
      captureCurrentFirstTouchAcquisitionContext();
    }
  }, [pathname]);

  if (isPrivateSavedResultPath(pathname)) {
    return null;
  }

  return (
    <>
      {yandexMetrikaId ? <YandexMetrika counterId={yandexMetrikaId} /> : null}
      <Analytics />
      <SpeedInsights />
    </>
  );
}

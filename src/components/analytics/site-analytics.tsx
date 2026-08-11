"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { usePathname } from "next/navigation";
import { YandexMetrika } from "@/components/analytics/yandex-metrika";
import { isPrivateSavedResultPath } from "@/lib/saved-result-contract";

interface SiteAnalyticsProps {
  yandexMetrikaId: number | null;
}

export function SiteAnalytics({ yandexMetrikaId }: SiteAnalyticsProps) {
  const pathname = usePathname();

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

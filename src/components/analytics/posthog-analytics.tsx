"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { capturePostHogPageview } from "@/lib/analytics/posthog-client";

export function PostHogAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const lastPageviewUrl = useRef<string | null>(null);

  useEffect(() => {
    const currentUrl = `${window.location.origin}${pathname}${search ? `?${search}` : ""}`;

    if (lastPageviewUrl.current === currentUrl) {
      return;
    }

    lastPageviewUrl.current = currentUrl;
    void capturePostHogPageview(currentUrl);
  }, [pathname, search]);

  return null;
}

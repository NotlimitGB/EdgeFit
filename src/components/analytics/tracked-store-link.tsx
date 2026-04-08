"use client";

import type { ReactNode } from "react";
import { analyticsEvents } from "@/lib/analytics/events";
import { trackEvent } from "@/lib/analytics/client";

interface TrackedStoreLinkProps {
  href: string;
  className: string;
  children: ReactNode;
  analyticsPayload?: Record<string, unknown>;
}

export function TrackedStoreLink({
  href,
  className,
  children,
  analyticsPayload,
}: TrackedStoreLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={() => {
        if (!analyticsPayload) {
          return;
        }

        void trackEvent(analyticsEvents.productClicked, analyticsPayload, {
          useBeacon: true,
          skipInternalApi: true,
        });
      }}
      className={className}
    >
      {children}
    </a>
  );
}

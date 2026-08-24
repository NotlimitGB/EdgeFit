import type { MouseEvent, ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  trackEvent: vi.fn(async () => undefined),
}));

vi.mock("@/lib/analytics/client", () => ({
  trackEvent: mocks.trackEvent,
}));

import { TrackedStoreLink } from "@/components/analytics/tracked-store-link";

describe("TrackedStoreLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits one canonical event without taking over merchant navigation", () => {
    const element = TrackedStoreLink({
      href: "/go/test-board?from=result-top",
      className: "primary",
      analyticsPayload: {
        product_id: "product-1",
        product_slug: "test-board",
        placement: "primary_recommendation",
      },
      children: "В магазин",
    }) as ReactElement<{
      href: string;
      target: string;
      onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
    }>;
    const preventDefault = vi.fn();

    element.props.onClick({ preventDefault } as unknown as MouseEvent<HTMLAnchorElement>);

    expect(mocks.trackEvent).toHaveBeenCalledOnce();
    expect(mocks.trackEvent).toHaveBeenCalledWith(
      "product_clicked",
      expect.objectContaining({
        product_id: "product-1",
        product_slug: "test-board",
        placement: "primary_recommendation",
        offer_slug: "test-board",
      }),
      {
        useBeacon: true,
        skipInternalApi: true,
      },
    );
    expect(preventDefault).not.toHaveBeenCalled();
    expect(element.props.href).toBe("/go/test-board?from=result-top");
    expect(element.props.target).toBe("_blank");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CanonicalCatalogItem } from "@/types/canonical-catalog";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    prefetch,
    ...props
  }: React.ComponentProps<"a"> & {
    href: string;
    prefetch?: boolean;
  }) => (
    <a href={href} data-prefetch={String(prefetch)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/analytics/tracked-store-link", () => ({
  TrackedStoreLink: ({
    analyticsPayload,
    children,
    ...props
  }: React.ComponentProps<"a"> & {
    analyticsPayload?: Record<string, unknown>;
  }) => (
    <a
      {...props}
      data-analytics={
        analyticsPayload ? JSON.stringify(analyticsPayload) : undefined
      }
    >
      {children}
    </a>
  ),
}));

import { CanonicalBoardCard } from "@/components/catalog/canonical-board-card";

const board: CanonicalCatalogItem = {
  familyId: null,
  slug: "brand-model",
  brand: "Brand",
  modelName: "Model",
  seasonLabel: "2026/2027",
  canonicalSpecs: {
    descriptionShort: "Описание модели",
    descriptionFull: "Полное описание модели",
    ridingStyle: "all-mountain",
    skillLevel: "intermediate",
    flex: 5,
    boardLine: "unisex",
    shapeType: "directional-twin",
    camberProfile: "hybrid-camber",
    dataStatus: "verified",
    canonicalSourceKind: "trusted-member",
    sourceName: "Store",
    sourceUrl: "https://example.com/model",
    sourceCheckedAt: "2026-08-01T00:00:00.000Z",
  },
  offers: [
    {
      offerId: "offer-1",
      offerSlug: "brand-model",
      memberRole: null,
      familyMatchMethod: null,
      familyMatchConfidence: null,
      familyManualOverride: false,
      priceFrom: 60_000,
      isActive: true,
      hasAvailableSize: true,
      isFulfillable: true,
      sourceName: "Store",
      sourceUrl: "https://example.com/model",
      sourceCheckedAt: "2026-08-01T00:00:00.000Z",
      dataStatus: "verified",
    },
  ],
  sizes: [],
  priceFrom: 60_000,
  isActive: true,
  hasAvailableSize: true,
  media: [],
  defaultOfferSlug: "brand-model",
};

describe("CanonicalBoardCard route prefetch", () => {
  it("disables prefetch on all three board links without changing the store action", () => {
    const markup = renderToStaticMarkup(<CanonicalBoardCard board={board} />);
    const boardLinks = Array.from(
      markup.matchAll(/<a\b[^>]*href="\/boards\/brand-model"[^>]*>/g),
      ([link]) => link,
    );

    expect(boardLinks).toHaveLength(3);
    expect(boardLinks.every((link) => link.includes('data-prefetch="false"'))).toBe(
      true,
    );
    expect(markup).toContain("/go/brand-model");
    expect(markup).toContain("data-analytics");
    expect(markup).toContain("catalog");
  });
});

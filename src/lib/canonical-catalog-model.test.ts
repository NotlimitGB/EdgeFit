import { describe, expect, it } from "vitest";
import {
  buildCanonicalCatalogItems,
  type CanonicalFamilySource,
  type CanonicalOfferSizeSource,
  type CanonicalOfferSource,
} from "@/lib/canonical-catalog-model";

function makeSize(
  overrides: Partial<CanonicalOfferSizeSource> = {},
): CanonicalOfferSizeSource {
  return {
    id: "size-154",
    sizeCm: 154,
    sizeLabel: "154 cm",
    waistWidthMm: 250,
    recommendedWeightMin: 55,
    recommendedWeightMax: 75,
    widthType: "regular",
    isAvailable: true,
    ...overrides,
  };
}

function makeOffer(
  overrides: Partial<CanonicalOfferSource> = {},
): CanonicalOfferSource {
  return {
    id: "offer-base",
    slug: "brand-model",
    brand: "Brand",
    modelName: "Model",
    seasonLabel: "2025/2026",
    descriptionShort: "Offer short",
    descriptionFull: "Offer full",
    ridingStyle: "all-mountain",
    skillLevel: "intermediate",
    flex: 5,
    boardLine: "unisex",
    shapeType: "directional-twin",
    camberProfile: "hybrid-camber",
    dataStatus: "verified",
    priceFrom: 40_000,
    imageUrl: "https://images.example/base.jpg",
    galleryImages: [],
    isActive: true,
    sourceName: "Store",
    sourceUrl: "https://store.example/model",
    sourceCheckedAt: "2026-08-01",
    familyId: null,
    memberRole: null,
    familyMatchMethod: null,
    familyMatchConfidence: null,
    familyManualOverride: false,
    sizes: [makeSize()],
    ...overrides,
  };
}

function makeFamily(
  overrides: Partial<CanonicalFamilySource> = {},
): CanonicalFamilySource {
  return {
    id: "family-1",
    slug: "brand-model",
    brand: "Brand",
    modelName: "Model",
    seasonLabel: "2025/2026",
    descriptionShort: "Family short",
    descriptionFull: "Family full",
    ridingStyle: "freeride",
    skillLevel: "advanced",
    flex: 7,
    boardLine: "men",
    shapeType: "directional",
    camberProfile: "camber",
    canonicalSourceKind: "fallback-member",
    sourceName: "Canonical source",
    sourceUrl: "https://brand.example/model",
    sourceCheckedAt: "2026-08-02",
    dataStatus: "verified",
    ...overrides,
  };
}

function familyOffer(
  role: "base" | "wide" | "other",
  overrides: Partial<CanonicalOfferSource> = {},
) {
  return makeOffer({
    id: `offer-${role}`,
    slug: `brand-model${role === "base" ? "" : `-${role}`}`,
    familyId: "family-1",
    memberRole: role,
    familyMatchMethod: "audit-high-v1",
    familyMatchConfidence: "high",
    ...overrides,
  });
}

describe("canonical catalog model", () => {
  it("projects an active ungrouped Product as a singleton with provenance", () => {
    const [item] = buildCanonicalCatalogItems([], [makeOffer()]);

    expect(item).toMatchObject({
      familyId: null,
      slug: "brand-model",
      offers: [{ offerId: "offer-base", memberRole: null }],
      sizes: [
        {
          sourceSizeId: "size-154",
          offerId: "offer-base",
          offerSlug: "brand-model",
        },
      ],
    });
  });

  it("omits an inactive ungrouped Product", () => {
    expect(buildCanonicalCatalogItems([], [makeOffer({ isActive: false })])).toEqual(
      [],
    );
  });

  it("aggregates Regular and Wide Products into one family item", () => {
    const items = buildCanonicalCatalogItems(
      [makeFamily()],
      [familyOffer("base"), familyOffer("wide")],
    );

    expect(items).toHaveLength(1);
    expect(items[0].offers).toHaveLength(2);
  });

  it("uses canonical family identity instead of member identity", () => {
    const [item] = buildCanonicalCatalogItems(
      [makeFamily({ brand: "Canonical", modelName: "Canonical Model" })],
      [familyOffer("base", { brand: "Member", modelName: "Member Model" })],
    );

    expect(item).toMatchObject({
      brand: "Canonical",
      modelName: "Canonical Model",
      seasonLabel: "2025/2026",
    });
  });

  it("uses canonical family specs without member averaging or override", () => {
    const family = makeFamily({ flex: 8, ridingStyle: "freeride" });
    const [item] = buildCanonicalCatalogItems(
      [family],
      [familyOffer("base", { flex: 2, ridingStyle: "park" })],
    );

    expect(item.canonicalSpecs).toMatchObject({
      flex: 8,
      ridingStyle: "freeride",
      canonicalSourceKind: "fallback-member",
    });
  });

  it("unions every exact base and Wide size", () => {
    const [item] = buildCanonicalCatalogItems(
      [makeFamily()],
      [
        familyOffer("base", {
          sizes: [151, 156, 159].map((sizeCm) =>
            makeSize({ id: `base-${sizeCm}`, sizeCm, sizeLabel: `${sizeCm} cm` }),
          ),
        }),
        familyOffer("wide", {
          sizes: [161, 164].map((sizeCm) =>
            makeSize({
              id: `wide-${sizeCm}`,
              sizeCm,
              sizeLabel: `${sizeCm} cm`,
              widthType: "wide",
            }),
          ),
        }),
      ],
    );

    expect(item.sizes).toHaveLength(5);
  });

  it("retains equal numeric sizes from different offers", () => {
    const [item] = buildCanonicalCatalogItems(
      [makeFamily()],
      [
        familyOffer("base", {
          sizes: [makeSize({ id: "regular-159", sizeCm: 159 })],
        }),
        familyOffer("wide", {
          sizes: [
            makeSize({
              id: "wide-159",
              sizeCm: 159,
              waistWidthMm: 266,
              widthType: "wide",
            }),
          ],
        }),
      ],
    );

    expect(item.sizes.map((size) => size.sourceSizeId)).toEqual([
      "regular-159",
      "wide-159",
    ]);
  });

  it("preserves the exact ProductSize ID", () => {
    const [item] = buildCanonicalCatalogItems([], [
      makeOffer({ sizes: [makeSize({ id: "db-size-uuid" })] }),
    ]);

    expect(item.sizes[0].sourceSizeId).toBe("db-size-uuid");
  });

  it("normalizes an explicit raw terminal W label", () => {
    const [item] = buildCanonicalCatalogItems([], [
      makeOffer({ sizes: [makeSize({ sizeLabel: "159 W cm", sizeCm: 159 })] }),
    ]);

    expect(item.sizes[0]).toMatchObject({
      rawSizeLabel: "159 W cm",
      displaySizeLabel: "159W",
      sizeLabel: "159W",
    });
  });

  it("derives W for an audit-high explicit Wide member", () => {
    const [item] = buildCanonicalCatalogItems(
      [makeFamily()],
      [
        familyOffer("wide", {
          sizes: [
            makeSize({ sizeCm: 161, sizeLabel: "161 cm", widthType: "wide" }),
          ],
        }),
      ],
    );

    expect(item.sizes[0]).toMatchObject({
      rawSizeLabel: "161 cm",
      displaySizeLabel: "161W",
    });
  });

  it("derives W for a manually confirmed Wide member", () => {
    const [item] = buildCanonicalCatalogItems(
      [makeFamily()],
      [
        familyOffer("wide", {
          familyMatchMethod: "manual",
          familyMatchConfidence: "reviewed",
          familyManualOverride: true,
          sizes: [
            makeSize({ sizeCm: 162, sizeLabel: "162 cm", widthType: "wide" }),
          ],
        }),
      ],
    );

    expect(item.sizes[0].displaySizeLabel).toBe("162W");
  });

  it("does not derive W from malformed or unsupported membership provenance", () => {
    const [item] = buildCanonicalCatalogItems(
      [makeFamily()],
      [
        familyOffer("wide", {
          familyMatchMethod: "unknown",
          sizes: [
            makeSize({ sizeCm: 162, sizeLabel: "162 cm", widthType: "wide" }),
          ],
        }),
      ],
    );

    expect(item.sizes[0].displaySizeLabel).toBe("162");
  });

  it("does not derive W from a base mid-wide size", () => {
    const [item] = buildCanonicalCatalogItems(
      [makeFamily()],
      [
        familyOffer("base", {
          sizes: [
            makeSize({ sizeCm: 159, sizeLabel: "159 cm", widthType: "mid-wide" }),
          ],
        }),
      ],
    );

    expect(item.sizes[0].displaySizeLabel).toBe("159");
  });

  it("does not derive W from an ungrouped wide size", () => {
    const [item] = buildCanonicalCatalogItems([], [
      makeOffer({
        sizes: [
          makeSize({ sizeCm: 160, sizeLabel: "160 cm", widthType: "wide" }),
        ],
      }),
    ]);

    expect(item.sizes[0].displaySizeLabel).toBe("160");
  });

  it("uses the minimum positive active family price", () => {
    const [item] = buildCanonicalCatalogItems(
      [makeFamily()],
      [familyOffer("base", { priceFrom: 42_000 }), familyOffer("wide", { priceFrom: 39_900 })],
    );

    expect(item.priceFrom).toBe(39_900);
  });

  it("excludes inactive offer prices", () => {
    const [item] = buildCanonicalCatalogItems(
      [makeFamily()],
      [
        familyOffer("base", { priceFrom: 42_000 }),
        familyOffer("wide", { priceFrom: 10_000, isActive: false }),
      ],
    );

    expect(item.priceFrom).toBe(42_000);
  });

  it("ignores non-positive prices when a positive price exists", () => {
    const [item] = buildCanonicalCatalogItems(
      [makeFamily()],
      [familyOffer("base", { priceFrom: 0 }), familyOffer("wide", { priceFrom: 39_900 })],
    );

    expect(item.priceFrom).toBe(39_900);
  });

  it("returns null when no active offer has a positive price", () => {
    const [item] = buildCanonicalCatalogItems(
      [makeFamily()],
      [familyOffer("base", { priceFrom: 0 }), familyOffer("wide", { priceFrom: -1 })],
    );

    expect(item.priceFrom).toBeNull();
  });

  it("marks a family available from an active available offer", () => {
    const [item] = buildCanonicalCatalogItems(
      [makeFamily()],
      [familyOffer("base", { sizes: [makeSize({ isAvailable: true })] })],
    );

    expect(item.hasAvailableSize).toBe(true);
  });

  it("ignores inactive historical availability", () => {
    const [item] = buildCanonicalCatalogItems(
      [makeFamily()],
      [
        familyOffer("base", { sizes: [makeSize({ isAvailable: false })] }),
        familyOffer("wide", { isActive: false, sizes: [makeSize({ isAvailable: true })] }),
      ],
    );

    expect(item.hasAvailableSize).toBe(false);
  });

  it("selects the lowest positive-priced fulfillable offer", () => {
    const [item] = buildCanonicalCatalogItems(
      [makeFamily()],
      [familyOffer("base", { priceFrom: 42_000 }), familyOffer("wide", { priceFrom: 39_900 })],
    );

    expect(item.defaultOfferSlug).toBe("brand-model-wide");
  });

  it("prefers the base offer on an equal price", () => {
    const [item] = buildCanonicalCatalogItems(
      [makeFamily()],
      [familyOffer("wide", { priceFrom: 40_000 }), familyOffer("base", { priceFrom: 40_000 })],
    );

    expect(item.defaultOfferSlug).toBe("brand-model");
  });

  it("uses newest source evidence after price and role ties", () => {
    const [item] = buildCanonicalCatalogItems(
      [makeFamily()],
      [
        familyOffer("other", { id: "old", slug: "old", sourceCheckedAt: "2026-07-01" }),
        familyOffer("other", { id: "new", slug: "new", sourceCheckedAt: "2026-08-01" }),
      ],
    );

    expect(item.defaultOfferSlug).toBe("new");
  });

  it("uses lexical offer slug after a complete default-offer tie", () => {
    const [item] = buildCanonicalCatalogItems(
      [makeFamily()],
      [
        familyOffer("other", { id: "z", slug: "z-offer" }),
        familyOffer("other", { id: "a", slug: "a-offer" }),
      ],
    );

    expect(item.defaultOfferSlug).toBe("a-offer");
  });

  it("excludes an unavailable offer from default selection", () => {
    const [item] = buildCanonicalCatalogItems(
      [makeFamily()],
      [
        familyOffer("base", { priceFrom: 10_000, sizes: [makeSize({ isAvailable: false })] }),
        familyOffer("wide", { priceFrom: 40_000 }),
      ],
    );

    expect(item.defaultOfferSlug).toBe("brand-model-wide");
  });

  it("returns no default offer when none is fulfillable", () => {
    const [item] = buildCanonicalCatalogItems(
      [makeFamily()],
      [familyOffer("base", { sizes: [makeSize({ isAvailable: false })] })],
    );

    expect(item.defaultOfferSlug).toBeNull();
  });

  it("orders active media base primary/gallery before Wide media", () => {
    const [item] = buildCanonicalCatalogItems(
      [makeFamily()],
      [
        familyOffer("wide", { imageUrl: "wide-primary", galleryImages: ["wide-gallery"] }),
        familyOffer("base", { imageUrl: "base-primary", galleryImages: ["base-gallery"] }),
      ],
    );

    expect(item.media).toEqual([
      "base-primary",
      "base-gallery",
      "wide-primary",
      "wide-gallery",
    ]);
  });

  it("trims and deduplicates media URLs", () => {
    const [item] = buildCanonicalCatalogItems([], [
      makeOffer({
        imageUrl: " same ",
        galleryImages: ["same", " unique ", ""],
      }),
    ]);

    expect(item.media).toEqual(["same", "unique"]);
  });

  it("does not append inactive media when active media exists", () => {
    const [item] = buildCanonicalCatalogItems(
      [makeFamily()],
      [
        familyOffer("base", { imageUrl: "active" }),
        familyOffer("wide", { imageUrl: "inactive", isActive: false }),
      ],
    );

    expect(item.media).toEqual(["active"]);
  });

  it("uses inactive historical media only when active media is empty", () => {
    const [item] = buildCanonicalCatalogItems(
      [makeFamily()],
      [
        familyOffer("base", { imageUrl: "", galleryImages: [] }),
        familyOffer("wide", { imageUrl: "fallback", isActive: false }),
      ],
    );

    expect(item.media).toEqual(["fallback"]);
  });

  it("omits a family with no active member offer", () => {
    expect(
      buildCanonicalCatalogItems(
        [makeFamily()],
        [familyOffer("base", { isActive: false })],
      ),
    ).toEqual([]);
  });

  it("retains an inactive historical member inside an active family", () => {
    const [item] = buildCanonicalCatalogItems(
      [makeFamily()],
      [familyOffer("base"), familyOffer("wide", { isActive: false })],
    );

    expect(item.offers).toHaveLength(2);
    expect(item.offers.find((offer) => offer.memberRole === "wide")?.isActive).toBe(
      false,
    );
  });

  it("sorts exact sizes deterministically regardless of input order", () => {
    const sizes = [
      makeSize({ id: "wide-159", sizeCm: 159, widthType: "wide" }),
      makeSize({ id: "regular-154", sizeCm: 154 }),
      makeSize({ id: "regular-159", sizeCm: 159 }),
    ];
    const first = buildCanonicalCatalogItems([], [makeOffer({ sizes })])[0];
    const second = buildCanonicalCatalogItems([], [
      makeOffer({ sizes: [...sizes].reverse() }),
    ])[0];

    expect(first.sizes.map((size) => size.sourceSizeId)).toEqual(
      second.sizes.map((size) => size.sourceSizeId),
    );
  });

  it("sorts canonical items deterministically regardless of source order", () => {
    const offers = [
      makeOffer({ id: "z", slug: "z", brand: "Zed" }),
      makeOffer({ id: "a", slug: "a", brand: "Alpha" }),
    ];

    expect(buildCanonicalCatalogItems([], offers).map((item) => item.slug)).toEqual(
      buildCanonicalCatalogItems([], [...offers].reverse()).map((item) => item.slug),
    );
  });

  it("rejects duplicate canonical slugs", () => {
    expect(() =>
      buildCanonicalCatalogItems(
        [makeFamily({ slug: "collision" })],
        [
          familyOffer("base"),
          makeOffer({ id: "singleton", slug: "collision" }),
        ],
      ),
    ).toThrow("Duplicate canonical catalog slug collision");
  });

  it("rejects a grouped Product whose family row is missing", () => {
    expect(() => buildCanonicalCatalogItems([], [familyOffer("base")])).toThrow(
      "references missing family family-1",
    );
  });

  it("rejects a grouped Product without a valid member role", () => {
    expect(() =>
      buildCanonicalCatalogItems(
        [makeFamily()],
        [familyOffer("base", { memberRole: null })],
      ),
    ).toThrow("is missing a valid family role");
  });
});

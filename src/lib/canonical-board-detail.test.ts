import { describe, expect, it } from "vitest";
import {
  getCanonicalBoardAvailabilityDescription,
  getCanonicalBoardAvailabilityHeadline,
  getCanonicalBoardPricePresentation,
  getCanonicalBoardTrustDetails,
  getCanonicalCurrentAvailableSizes,
  getCanonicalFlexPresentation,
  getCanonicalNarrativeOfferSlug,
  getCanonicalSizeAvailabilityLabel,
  getCanonicalSizeStoreAction,
  getRelatedCanonicalBoards,
} from "@/lib/canonical-board-detail";
import type {
  CanonicalCatalogItem,
  CanonicalSizeVariant,
  SourceOfferSummary,
} from "@/types/canonical-catalog";

function makeSize(
  id: string,
  overrides: Partial<CanonicalSizeVariant> = {},
): CanonicalSizeVariant {
  return {
    sourceSizeId: id,
    offerId: "offer-base",
    offerSlug: "brand-model",
    memberRole: "base",
    offerIsActive: true,
    rawSizeLabel: "156 cm",
    displaySizeLabel: "156",
    sizeLabel: "156",
    sizeCm: 156,
    waistWidthMm: 252,
    recommendedWeightMin: 60,
    recommendedWeightMax: 85,
    widthType: "regular",
    isAvailable: true,
    ...overrides,
  };
}

function makeOffer(
  slug: string,
  overrides: Partial<SourceOfferSummary> = {},
): SourceOfferSummary {
  return {
    offerId: `id-${slug}`,
    offerSlug: slug,
    memberRole: "base",
    familyMatchMethod: "audit-high-v1",
    familyMatchConfidence: "high",
    familyManualOverride: false,
    priceFrom: 50_000,
    isActive: true,
    hasAvailableSize: true,
    isFulfillable: true,
    sourceName: "Source",
    sourceUrl: "https://brand.example/model",
    sourceCheckedAt: "2026-08-01",
    dataStatus: "verified",
    ...overrides,
  };
}

function makeBoard(
  overrides: Partial<CanonicalCatalogItem> & {
    canonicalSpecs?: Partial<CanonicalCatalogItem["canonicalSpecs"]>;
  } = {},
): CanonicalCatalogItem {
  const canonicalSpecs = {
    descriptionShort: "Short",
    descriptionFull: "Full",
    ridingStyle: "all-mountain" as const,
    skillLevel: "intermediate" as const,
    flex: 6,
    boardLine: "unisex" as const,
    shapeType: "directional-twin" as const,
    camberProfile: "hybrid-camber" as const,
    dataStatus: "verified" as const,
    canonicalSourceKind: "verified-official" as const,
    sourceName: "Official source",
    sourceUrl: "https://brand.example/model",
    sourceCheckedAt: "2026-08-01",
    ...overrides.canonicalSpecs,
  };

  return {
    familyId: "family-1",
    slug: "brand-model",
    brand: "Brand",
    modelName: "Model",
    seasonLabel: "2025/2026",
    canonicalSpecs,
    offers: [makeOffer("brand-model")],
    sizes: [makeSize("size-156")],
    priceFrom: 50_000,
    isActive: true,
    hasAvailableSize: true,
    media: [],
    defaultOfferSlug: "brand-model",
    ...overrides,
    canonicalSpecs,
  };
}

function boardWithAvailableSizeCount(count: number) {
  return makeBoard({
    sizes: Array.from({ length: count }, (_, index) =>
      makeSize(`size-${index}`, {
        sizeCm: 150 + index,
        displaySizeLabel: String(150 + index),
      }),
    ),
  });
}

describe("canonical Board Detail helpers", () => {
  it("returns only active and available sizes as current", () => {
    const board = makeBoard({
      sizes: [
        makeSize("current"),
        makeSize("unavailable", { isAvailable: false }),
        makeSize("inactive", { offerIsActive: false }),
      ],
    });

    expect(
      getCanonicalCurrentAvailableSizes(board).map(
        (size) => size.sourceSizeId,
      ),
    ).toEqual(["current"]);
  });

  it("does not count stale availability from an inactive offer", () => {
    const board = makeBoard({
      sizes: [makeSize("inactive", { offerIsActive: false, isAvailable: true })],
    });

    expect(getCanonicalBoardAvailabilityHeadline(board)).toBe(
      "Доступность не подтверждена",
    );
  });

  it("pluralizes zero available sizes", () => {
    expect(getCanonicalBoardAvailabilityHeadline(boardWithAvailableSizeCount(0))).toBe(
      "Доступность не подтверждена",
    );
  });

  it("pluralizes one available size", () => {
    expect(getCanonicalBoardAvailabilityHeadline(boardWithAvailableSizeCount(1))).toBe(
      "В данных EdgeFit отмечено: 1 размер",
    );
  });

  it("pluralizes two available sizes", () => {
    expect(getCanonicalBoardAvailabilityHeadline(boardWithAvailableSizeCount(2))).toBe(
      "В данных EdgeFit отмечено: 2 размера",
    );
  });

  it("pluralizes five available sizes", () => {
    expect(getCanonicalBoardAvailabilityHeadline(boardWithAvailableSizeCount(5))).toBe(
      "В данных EdgeFit отмечено: 5 размеров",
    );
  });

  it("uses canonical W display labels in availability preview", () => {
    const board = makeBoard({
      sizes: [
        makeSize("wide-161", { displaySizeLabel: "161W" }),
        makeSize("wide-164", { displaySizeLabel: "164W" }),
      ],
    });

    expect(getCanonicalBoardAvailabilityDescription(board)).toBe(
      "Отмеченные размеры: 161W, 164W. Актуальную доступность проверяй в магазине.",
    );
  });

  it("uses stored-data labels for size availability", () => {
    expect(getCanonicalSizeAvailabilityLabel(makeSize("available"))).toBe(
      "отмечен доступным",
    );
    expect(
      getCanonicalSizeAvailabilityLabel(
        makeSize("unavailable", { isAvailable: false }),
      ),
    ).toBe("доступность не подтверждена");
  });

  it("formats a known positive canonical price", () => {
    expect(getCanonicalBoardPricePresentation(36_300)).toEqual({
      label: "Ориентир цены",
      value: "36 300 ₽",
    });
  });

  it("does not present a null price as zero", () => {
    expect(getCanonicalBoardPricePresentation(null)).toEqual({
      label: "Ориентир цены",
      value: "нет данных",
    });
  });

  it("does not present a zero price as money", () => {
    expect(getCanonicalBoardPricePresentation(0).value).toBe(
      "нет данных",
    );
  });

  it("does not present a non-finite price as money", () => {
    expect(getCanonicalBoardPricePresentation(Number.NaN).value).toBe(
      "нет данных",
    );
  });

  it("shows numeric flex for a verified official source", () => {
    expect(getCanonicalFlexPresentation(makeBoard().canonicalSpecs)).toEqual({
      value: "6 из 10",
      caption: null,
    });
  });

  it("shows numeric flex for verified manual canonical data", () => {
    const specs = makeBoard({
      canonicalSpecs: {
        canonicalSourceKind: "manual",
        sourceName: null,
        sourceUrl: null,
      },
    }).canonicalSpecs;

    expect(getCanonicalFlexPresentation(specs).value).toBe("6 из 10");
  });

  it("shows numeric flex for a verified safe non-store source", () => {
    const specs = makeBoard({
      canonicalSpecs: { canonicalSourceKind: "fallback-member" },
    }).canonicalSpecs;

    expect(getCanonicalFlexPresentation(specs).value).toBe("6 из 10");
  });

  it("warns for verified Trial Sport fallback flex", () => {
    const specs = makeBoard({
      canonicalSpecs: {
        canonicalSourceKind: "fallback-member",
        sourceName: "Триал-Спорт",
        sourceUrl: "https://trial-sport.ru/goods/model",
      },
    }).canonicalSpecs;

    expect(getCanonicalFlexPresentation(specs).value).toBe(
      "Требует перепроверки",
    );
  });

  it("shows an unknown state for missing flex", () => {
    const specs = makeBoard({ canonicalSpecs: { flex: null } }).canonicalSpecs;

    expect(getCanonicalFlexPresentation(specs)).toEqual({
      value: "Уточняется",
      caption: null,
    });
  });

  it("marks complete verified canonical specs as ready", () => {
    const trust = getCanonicalBoardTrustDetails(makeBoard().canonicalSpecs);

    expect(trust.isReady).toBe(true);
    expect(trust.badgeLabel).toBe("Проверено");
    expect(trust.badgeDescription).toContain(
      "Характеристики модели отмечены как проверенные",
    );
  });

  it("reports a missing canonical source", () => {
    const specs = makeBoard({
      canonicalSpecs: { sourceName: null, sourceUrl: null },
    }).canonicalSpecs;
    const trust = getCanonicalBoardTrustDetails(specs);

    expect(trust.isReady).toBe(false);
    expect(trust.issueLabel).toBe(
      "Не указан источник характеристик.",
    );
  });

  it("keeps canonical trust independent from availability", () => {
    const board = makeBoard({
      sizes: [],
      defaultOfferSlug: null,
      hasAvailableSize: false,
    });

    expect(getCanonicalBoardTrustDetails(board.canonicalSpecs).isReady).toBe(
      true,
    );
  });

  it("selects an active base offer for narrative content", () => {
    const board = makeBoard({
      offers: [
        makeOffer("brand-model-wide", { memberRole: "wide" }),
        makeOffer("brand-model", { memberRole: "base" }),
      ],
      defaultOfferSlug: "brand-model-wide",
    });

    expect(getCanonicalNarrativeOfferSlug(board)).toBe("brand-model");
  });

  it("uses an active default offer when the base is inactive", () => {
    const board = makeBoard({
      offers: [
        makeOffer("brand-model", { memberRole: "base", isActive: false }),
        makeOffer("brand-model-wide", { memberRole: "wide" }),
      ],
      defaultOfferSlug: "brand-model-wide",
    });

    expect(getCanonicalNarrativeOfferSlug(board)).toBe("brand-model-wide");
  });

  it("uses deterministic role and slug order for narrative fallback", () => {
    const board = makeBoard({
      offers: [
        makeOffer("brand-z", { memberRole: "other" }),
        makeOffer("brand-a", { memberRole: "wide" }),
      ],
      defaultOfferSlug: null,
    });

    expect(getCanonicalNarrativeOfferSlug(board)).toBe("brand-a");
  });

  it("builds an exact base size store action", () => {
    const action = getCanonicalSizeStoreAction(
      "brand-model",
      makeSize("base"),
    );

    expect(action?.href).toContain("/go/brand-model?");
    expect(action?.analyticsPayload.board_slug).toBe("brand-model");
  });

  it("routes a Wide display size through its exact Wide offer and raw label", () => {
    const action = getCanonicalSizeStoreAction(
      "bataleon-beyond-medals",
      makeSize("wide", {
        offerId: "wide-offer",
        offerSlug: "bataleon-beyond-medals-wide",
        memberRole: "wide",
        rawSizeLabel: "161 cm",
        displaySizeLabel: "161W",
        sizeLabel: "161W",
        sizeCm: 161,
        waistWidthMm: 264,
        widthType: "wide",
      }),
    );
    const url = new URL(action!.href, "https://edgefit.test");

    expect(url.pathname).toBe("/go/bataleon-beyond-medals-wide");
    expect(url.searchParams.get("sizeLabel")).toBe("161W");
    expect(url.searchParams.get("sourceSizeLabel")).toBe("161 cm");
    expect(action?.analyticsPayload.source_size_label).toBe("161 cm");
  });

  it("does not build an action for an unavailable size", () => {
    expect(
      getCanonicalSizeStoreAction(
        "brand-model",
        makeSize("unavailable", { isAvailable: false }),
      ),
    ).toBeNull();
  });

  it("does not build an action for a size from an inactive offer", () => {
    expect(
      getCanonicalSizeStoreAction(
        "brand-model",
        makeSize("inactive", { offerIsActive: false, isAvailable: true }),
      ),
    ).toBeNull();
  });

  it("excludes the current canonical identity from related boards", () => {
    const current = makeBoard();

    expect(getRelatedCanonicalBoards(current, [current])).toEqual([]);
  });

  it("prioritizes matching riding style", () => {
    const current = makeBoard();
    const sameLine = makeBoard({
      slug: "same-line",
      modelName: "Same line",
      canonicalSpecs: { ridingStyle: "park" },
    });
    const sameStyle = makeBoard({
      slug: "same-style",
      modelName: "Same style",
      canonicalSpecs: { boardLine: "men" },
    });

    expect(
      getRelatedCanonicalBoards(current, [sameLine, sameStyle]).map(
        (board) => board.slug,
      ),
    ).toEqual(["same-style", "same-line"]);
  });

  it("uses matching board line as the second related dimension", () => {
    const current = makeBoard();
    const sameLine = makeBoard({
      slug: "same-line",
      canonicalSpecs: { ridingStyle: "park" },
    });
    const unrelated = makeBoard({
      slug: "unrelated",
      canonicalSpecs: { ridingStyle: "park", boardLine: "men" },
    });

    expect(
      getRelatedCanonicalBoards(current, [unrelated, sameLine]).map(
        (board) => board.slug,
      ),
    ).toEqual(["same-line"]);
  });

  it("does not treat null canonical dimensions as a related match", () => {
    const current = makeBoard({
      canonicalSpecs: { ridingStyle: null, boardLine: null },
    });
    const candidate = makeBoard({
      slug: "also-unknown",
      canonicalSpecs: { ridingStyle: null, boardLine: null },
    });

    expect(getRelatedCanonicalBoards(current, [candidate])).toEqual([]);
  });

  it("keeps related ordering deterministic for shuffled input", () => {
    const current = makeBoard();
    const alpha = makeBoard({ slug: "alpha", brand: "A", modelName: "Alpha" });
    const beta = makeBoard({ slug: "beta", brand: "B", modelName: "Beta" });

    const first = getRelatedCanonicalBoards(current, [beta, alpha]).map(
      (board) => board.slug,
    );
    const second = getRelatedCanonicalBoards(current, [alpha, beta]).map(
      (board) => board.slug,
    );

    expect(first).toEqual(["alpha", "beta"]);
    expect(second).toEqual(first);
  });
});

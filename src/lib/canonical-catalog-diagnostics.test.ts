import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(operation: T) => operation,
}));

const databaseMocks = vi.hoisted(() => ({
  configured: vi.fn(() => true),
  getClient: vi.fn(),
  getSupport: vi.fn(),
}));

vi.mock("@/lib/database/config", () => ({
  базаНастроена: databaseMocks.configured,
}));
vi.mock("@/lib/database/client", () => ({
  получитьКлиентБазы: databaseMocks.getClient,
}));
vi.mock("@/lib/database/product-column-support", () => ({
  getProductColumnSupport: databaseMocks.getSupport,
}));

import {
  getAllCanonicalCatalogItems,
  getCanonicalCatalogItemBySlug,
  resolveCanonicalBoardRouteBySlug,
} from "@/lib/canonical-catalog";
import {
  buildCanonicalCatalogItems,
  type CanonicalFamilySource,
  type CanonicalOfferSource,
} from "@/lib/canonical-catalog-model";
import type { Sql } from "postgres";

const completeSupport = {
  seasonLabel: true,
  galleryImages: true,
  shapeType: true,
  camberProfile: true,
  dataStatus: true,
  sourceName: true,
  sourceUrl: true,
  sourceCheckedAt: true,
  sizeLabel: true,
  sizeAvailable: true,
  modelFamilies: true,
  familyId: true,
  familyMemberRole: true,
  familyMatchMethod: true,
  familyMatchConfidence: true,
  familyManualOverride: true,
  familyMatchReason: true,
  familyMatchedAt: true,
};

const family: CanonicalFamilySource = {
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
};

const offer: CanonicalOfferSource = {
  id: "offer-base",
  slug: "brand-model-offer",
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
  familyId: "family-1",
  memberRole: "base",
  familyMatchMethod: "audit-high-v1",
  familyMatchConfidence: "high",
  familyManualOverride: false,
  sizes: [
    {
      id: "size-154",
      sizeCm: 154,
      sizeLabel: "154 cm",
      waistWidthMm: 250,
      recommendedWeightMin: 55,
      recommendedWeightMax: 75,
      widthType: "regular",
      isAvailable: true,
    },
  ],
};

interface FakeSqlOptions {
  familyRows: (values: readonly unknown[]) => CanonicalFamilySource[];
  offerRows: (values: readonly unknown[]) => CanonicalOfferSource[];
  aliasRows?: (values: readonly unknown[]) => unknown[];
}

interface LoggedCatalogEvent {
  stage: string;
  event: string;
  branch?: string;
  rowCount?: number;
  traceId: string;
}

function createFakePool(options: FakeSqlOptions) {
  const release = vi.fn();
  const query = vi.fn(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const source = strings.join(" ");
      if (source.includes("json_agg(")) {
        return options.offerRows(values);
      }
      if (source.includes('p.slug as "offerSlug"')) {
        return options.aliasRows?.(values) ?? [];
      }
      if (source.includes("from model_families mf")) {
        return options.familyRows(values);
      }
      throw new Error("Unexpected fake catalog query");
    },
  );
  const reservedSql = Object.assign(query, {
    unsafe: vi.fn((value: string) => value),
    release,
  });
  const reserve = vi.fn(async () => reservedSql);
  const pool = { reserve } as unknown as Sql;

  return { pool, query, reserve, release };
}

function capturedEvents(info: { mock: { calls: unknown[][] } }) {
  return info.mock.calls.map(
    (call) => JSON.parse(String(call[0])) as LoggedCatalogEvent,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  databaseMocks.configured.mockReturnValue(true);
  databaseMocks.getSupport.mockResolvedValue(completeSupport);
});

describe("canonical catalog diagnostic orchestration", () => {
  it("loads the full catalog in the measured support → family → offer → build order", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fake = createFakePool({
      familyRows: () => [family],
      offerRows: () => [offer],
    });
    databaseMocks.getClient.mockReturnValue(fake.pool);

    const result = await getAllCanonicalCatalogItems();

    expect(result).toEqual(buildCanonicalCatalogItems([family], [offer]));
    expect(fake.reserve).toHaveBeenCalledTimes(1);
    expect(fake.release).toHaveBeenCalledTimes(1);
    expect(
      capturedEvents(info)
        .filter(({ event }) => event === "start")
        .map(({ stage }) => stage),
    ).toEqual([
      "canonical_catalog",
      "connection_acquisition",
      "product_column_support",
      "family_rows",
      "offer_rows",
      "canonical_build",
    ]);
    expect(
      capturedEvents(info).find(
        ({ stage, event }) => stage === "canonical_catalog" && event === "success",
      ),
    ).toMatchObject({ rowCount: 1 });
  });

  it("marks the family offer branch for a canonical family slug", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fake = createFakePool({
      familyRows: () => [family],
      offerRows: () => [offer],
    });
    databaseMocks.getClient.mockReturnValue(fake.pool);

    await expect(getCanonicalCatalogItemBySlug(family.slug)).resolves.toEqual(
      buildCanonicalCatalogItems([family], [offer])[0],
    );

    expect(
      capturedEvents(info).filter(
        ({ stage, event }) => stage === "offer_rows" && event === "start",
      ),
    ).toEqual([
      expect.objectContaining({ branch: "family" }),
    ]);
    expect(fake.release).toHaveBeenCalledTimes(1);
  });

  it("marks the singleton branch when no family row exists", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const singletonOffer: CanonicalOfferSource = {
      ...offer,
      slug: "singleton-board",
      familyId: null,
      memberRole: null,
      familyMatchMethod: null,
      familyMatchConfidence: null,
    };
    const fake = createFakePool({
      familyRows: () => [],
      offerRows: () => [singletonOffer],
    });
    databaseMocks.getClient.mockReturnValue(fake.pool);

    await expect(
      getCanonicalCatalogItemBySlug(singletonOffer.slug),
    ).resolves.toEqual(buildCanonicalCatalogItems([], [singletonOffer])[0]);

    expect(
      capturedEvents(info).filter(
        ({ stage, event }) => stage === "offer_rows" && event === "start",
      ),
    ).toEqual([
      expect.objectContaining({ branch: "singleton" }),
    ]);
    expect(fake.release).toHaveBeenCalledTimes(1);
  });

  it("measures the alias lookup separately and releases every reserved connection", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fake = createFakePool({
      familyRows: (values) =>
        values.includes(family.slug) ? [family] : [],
      offerRows: (values) =>
        values.includes(family.id) ? [offer] : [],
      aliasRows: () => [
        {
          offerSlug: "legacy-store-offer",
          familyId: family.id,
          familySlug: family.slug,
        },
      ],
    });
    databaseMocks.getClient.mockReturnValue(fake.pool);

    await expect(
      resolveCanonicalBoardRouteBySlug("legacy-store-offer"),
    ).resolves.toMatchObject({
      kind: "redirect",
      canonicalSlug: family.slug,
      item: { slug: family.slug },
    });

    const events = capturedEvents(info);
    expect(
      events.find(
        ({ stage, event }) => stage === "alias_rows" && event === "success",
      ),
    ).toMatchObject({ rowCount: 1 });
    expect(
      new Set(
        events
          .filter(({ stage }) => stage === "alias_rows")
          .map(({ traceId }) => traceId),
      ).size,
    ).toBe(1);
    expect(fake.reserve).toHaveBeenCalledTimes(3);
    expect(fake.release).toHaveBeenCalledTimes(3);
  });
});

import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildProductTruthV2,
  buildSizeTruthV2,
  knownTruth,
  resolveBoardLineTruth,
  resolveCamberTruth,
  resolveRidingStylesTruth,
  resolveShapeTruth,
  resolveSkillApplicabilityTruth,
} from "../../../scripts/lib/store-import/attribute-truth.mjs";

const context = {
  sourceName: "Fixture",
  sourceUrl: "https://example.com/board",
  observedAt: "2026-08-31",
  sourceField: "fixture",
};

function truth() {
  return buildProductTruthV2({
    ridingStyles: resolveRidingStylesTruth("all-mountain", context),
    skillApplicability: resolveSkillApplicabilityTruth("Продвинутый", context),
    boardLine: resolveBoardLineTruth("men", context),
    flex: knownTruth(6.5, context),
    shapeType: resolveShapeTruth("Directional", context),
    camberProfile: resolveCamberTruth("camber", context),
  });
}

function product() {
  return {
    slug: "fixture-board",
    brand: "Fixture",
    modelName: "Board",
    descriptionShort: "Short",
    descriptionFull: "Full",
    ridingStyle: "all-mountain",
    skillLevel: "intermediate",
    flex: 6,
    priceFrom: 1,
    imageUrl: "",
    affiliateUrl: "https://example.com/board",
    isActive: true,
    boardLine: "men",
    shapeType: "directional",
    camberProfile: "camber",
    scenarios: [],
    notIdealFor: [],
    truthV2: truth(),
    sizes: [
      {
        sizeCm: 159,
        sizeLabel: "159",
        waistWidthMm: 250,
        recommendedWeightMin: 60,
        recommendedWeightMax: 85,
        widthType: "regular",
        isAvailable: true,
        truthV2: buildSizeTruthV2(knownTruth(250, context)),
      },
      {
        sizeCm: 159,
        sizeLabel: "159W",
        waistWidthMm: 270,
        recommendedWeightMin: 65,
        recommendedWeightMax: 90,
        widthType: "wide",
        isAvailable: true,
        truthV2: buildSizeTruthV2(knownTruth(270, context)),
      },
    ],
  };
}

const legacyProductColumns = [
  "season_label", "gallery_images", "shape_type", "camber_profile",
  "data_status", "source_name", "source_url", "source_checked_at",
];
const legacySizeColumns = ["size_label", "is_available"];
const truthProductColumns = [
  "truth_model_version", "truth_riding_styles", "truth_skill_level_min",
  "truth_skill_level_max", "truth_board_line", "truth_flex", "truth_shape_type",
  "truth_camber_profile", "truth_attribute_evidence",
];
const truthSizeColumns = [
  "truth_model_version", "truth_waist_width_mm", "truth_width_type",
  "truth_attribute_evidence",
];

function fakeSql({ withTruthSchema = true, failOnSizeTruth = false } = {}) {
  const calls = [];
  let sizeId = 0;
  let beginCount = 0;
  let rolledBack = false;
  const transaction = async (strings, ...values) => {
    const text = strings.join("?").replace(/\s+/gu, " ").trim();
    calls.push({ text, values });
    if (text.includes("table_name in ('products', 'product_sizes')")) {
      return withTruthSchema
        ? [
            ...truthProductColumns.map((column_name) => ({ table_name: "products", column_name })),
            ...truthSizeColumns.map((column_name) => ({ table_name: "product_sizes", column_name })),
          ]
        : [];
    }
    if (text.includes("information_schema.columns")) {
      return [
        ...legacyProductColumns.map((column_name) => ({ table_name: "products", column_name })),
        ...legacySizeColumns.map((column_name) => ({ table_name: "product_sizes", column_name })),
      ];
    }
    if (text.startsWith("insert into products")) return [{ id: "product-1" }];
    if (text.startsWith("insert into product_sizes")) return [{ id: `size-${++sizeId}` }];
    if (failOnSizeTruth && text.startsWith("update product_sizes set truth_model_version")) {
      throw new Error("shadow size failure");
    }
    return [];
  };
  transaction.begin = async () => { throw new Error("nested transaction"); };
  const sql = Object.assign(transaction, {
    begin: async (callback) => {
      beginCount += 1;
      try {
        return await callback(transaction);
      } catch (error) {
        rolledBack = true;
        throw error;
      }
    },
  });
  return { sql, calls, get beginCount() { return beginCount; }, get rolledBack() { return rolledBack; } };
}

beforeEach(() => vi.resetModules());

describe("catalog truth shadow persistence", () => {
  it("keeps the default upsert independent of truth schema and columns", async () => {
    const fake = fakeSql({ withTruthSchema: false });
    const { upsertCatalogProducts } = await import("./upsert-catalog.mjs");
    const result = await upsertCatalogProducts(fake.sql, [product()]);
    expect(result).toMatchObject({ importedModels: 1, importedSizes: 2 });
    expect(fake.calls.some((call) => call.text.includes("truth_model_version"))).toBe(false);
  });

  it("rejects invalid truth before opening a transaction", async () => {
    const fake = fakeSql();
    const invalid = product();
    invalid.truthV2.flex = null;
    const { upsertCatalogProducts } = await import("./upsert-catalog.mjs");
    await expect(upsertCatalogProducts(fake.sql, [invalid], { truthWriteMode: "shadow" }))
      .rejects.toThrow(/mismatch/u);
    expect(fake.beginCount).toBe(0);
  });

  it("requires the complete shadow schema before product mutation", async () => {
    const fake = fakeSql({ withTruthSchema: false });
    const { upsertCatalogProducts } = await import("./upsert-catalog.mjs");
    await expect(upsertCatalogProducts(fake.sql, [product()], { truthWriteMode: "shadow" }))
      .rejects.toMatchObject({ code: "TRUTH_V2_SCHEMA_REQUIRED" });
    expect(fake.calls.some((call) => call.text.startsWith("insert into products"))).toBe(false);
  });

  it("writes product and duplicate-length size truth by returned row id", async () => {
    const fake = fakeSql();
    const { upsertCatalogProducts } = await import("./upsert-catalog.mjs");
    await upsertCatalogProducts(fake.sql, [product()], { truthWriteMode: "shadow" });
    const productTruthCall = fake.calls.find((call) => call.text.startsWith("update products set truth_model_version"));
    expect(productTruthCall?.values).toContain(6.5);
    const sizeTruthCalls = fake.calls.filter((call) => call.text.startsWith("update product_sizes set truth_model_version"));
    expect(sizeTruthCalls).toHaveLength(2);
    expect(sizeTruthCalls[0].values).toEqual(expect.arrayContaining([250, "size-1"]));
    expect(sizeTruthCalls[1].values).toEqual(expect.arrayContaining([270, "size-2"]));
  });

  it("keeps legacy and shadow writes in one rollback boundary", async () => {
    const fake = fakeSql({ failOnSizeTruth: true });
    const { upsertCatalogProducts } = await import("./upsert-catalog.mjs");
    await expect(upsertCatalogProducts(fake.sql, [product()], { truthWriteMode: "shadow" }))
      .rejects.toThrow("shadow size failure");
    expect(fake.rolledBack).toBe(true);
  });

  it("does not enable shadow writes from current store-import orchestration", async () => {
    const source = await readFile(new URL("../../../scripts/import-from-stores.mjs", import.meta.url), "utf8");
    expect(source).toMatch(/upsertCatalogProducts\(sql,\s*finalProducts\)/u);
    expect(source).not.toMatch(/truthWriteMode/u);
  });
});

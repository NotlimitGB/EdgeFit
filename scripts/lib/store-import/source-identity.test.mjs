import { describe, expect, it } from "vitest";
import { applyOfficialProductSpecs } from "../official-specs.mjs";
import { mergeImportedProducts } from "./common.mjs";
import {
  buildSourceIdentityPlan,
  getBoardLineEvidence,
  getSourceOfferCompatibility,
  getStoreIdentityFromUrl,
  normalizeSourceIdentityText,
  SOURCE_IDENTITY_CLASSES,
} from "./source-identity.mjs";

function makeProduct({
  id = null,
  slug = "yes-airmaster-3d",
  brand = "YES.",
  modelName = "Airmaster 3D",
  storeCode = "traektoria",
  sourceProductId = "1914518",
  boardLine = "men",
  boardLineEvidence = "known",
  seasonLabel = null,
  variantMarker = null,
  sizes = [150, 153, 156],
  priceFrom = 50_000,
  isActive = true,
  affiliateUrl = null,
  familyId = null,
} = {}) {
  const storeUrl =
    storeCode === "trial-sport"
      ? `https://trial-sport.ru/goods/51526/${sourceProductId}.html`
      : `https://www.traektoria.ru/product/${sourceProductId}_${slug}/`;

  return {
    id,
    slug,
    brand,
    modelName,
    seasonLabel,
    descriptionShort: "",
    descriptionFull: "",
    ridingStyle: "all-mountain",
    skillLevel: "intermediate",
    flex: 6,
    priceFrom,
    imageUrl: "",
    galleryImages: [],
    affiliateUrl: affiliateUrl ?? storeUrl,
    isActive,
    boardLine,
    shapeType: "directional-twin",
    camberProfile: null,
    dataStatus: "draft",
    sourceName: storeCode,
    sourceUrl: affiliateUrl ?? storeUrl,
    sourceCheckedAt: "2026-08-09",
    scenarios: [],
    notIdealFor: [],
    familyId,
    familyMemberRole: null,
    familyMatchMethod: null,
    familyManualOverride: false,
    sizes: sizes.map((sizeCm) => ({
      sizeCm,
      sizeLabel: String(sizeCm),
      waistWidthMm: 250,
      recommendedWeightMin: 0,
      recommendedWeightMax: null,
      widthType: variantMarker === "wide" ? "wide" : "regular",
      isAvailable: true,
    })),
    importMeta: {
      storeCode,
      sourceProductId,
      baseSlug: slug.replace(/-(?:men|women|unisex|wide)$/u, ""),
      boardLineEvidence,
      variantMarker,
    },
  };
}

describe("source offer identity", () => {
  it("recognizes explicit board-line evidence without treating missing copy as known unisex", () => {
    expect(getBoardLineEvidence("Женский")).toEqual({
      boardLine: "women",
      evidence: "known",
    });
    expect(getBoardLineEvidence("Унисекс")).toEqual({
      boardLine: "unisex",
      evidence: "known",
    });
    expect(getBoardLineEvidence("")).toEqual({
      boardLine: "unisex",
      evidence: "missing",
    });
  });

  it("extracts stable merchant IDs for both managed stores", () => {
    expect(
      getStoreIdentityFromUrl(
        "https://www.traektoria.ru/product/1914525_snoubord-yes-airmaster-3d/",
      ),
    ).toEqual({ storeCode: "traektoria", sourceProductId: "1914525" });
    expect(
      getStoreIdentityFromUrl(
        "https://trial-sport.ru/goods/51526/2779985.html",
      ),
    ).toEqual({ storeCode: "trial-sport", sourceProductId: "2779985" });
  });

  it("keeps protected model identity suffixes", () => {
    expect(normalizeSourceIdentityText("Aviator 2.0 Pro Plus Wide")).toBe(
      "aviator 2 0 pro plus wide",
    );
  });

  it("allows compatible cross-store representations to reconcile", () => {
    const left = makeProduct();
    const right = makeProduct({
      storeCode: "trial-sport",
      sourceProductId: "2779985",
      priceFrom: 45_000,
    });
    const plan = buildSourceIdentityPlan({
      importedProducts: [left, right],
    });

    expect(getSourceOfferCompatibility(left, right).compatible).toBe(true);
    expect(plan.resolvedProducts).toHaveLength(1);
    expect(plan.logicalPlan.groups[0].classification).toBe(
      SOURCE_IDENTITY_CLASSES.safe,
    );
  });

  it("keeps same-store merchant product IDs distinct with deterministic slugs", () => {
    const men = makeProduct({ sourceProductId: "1914518" });
    const women = makeProduct({
      sourceProductId: "1914525",
      boardLine: "women",
      sizes: [146, 149, 152],
    });
    const plan = buildSourceIdentityPlan({
      importedProducts: [women, men],
      officialSpecs: new Map([
        ["yes-airmaster-3d", { slug: "yes-airmaster-3d", boardLine: "men" }],
      ]),
    });

    expect(plan.resolvedProducts.map((product) => product.slug)).toEqual([
      "yes-airmaster-3d",
      "yes-airmaster-3d-women",
    ]);
    expect(plan.logicalPlan.groups[0].classification).toBe(
      SOURCE_IDENTITY_CLASSES.confirmed,
    );
  });

  it("repairs the Airmaster base identity using explicit official line evidence", () => {
    const men = makeProduct({ sourceProductId: "1914518" });
    const women = makeProduct({
      sourceProductId: "1914525",
      boardLine: "women",
      sizes: [146, 149, 152],
    });
    const corrupted = makeProduct({
      id: "existing",
      sourceProductId: "1914525",
      boardLine: "men",
      sizes: [150, 153, 156],
    });
    delete corrupted.importMeta;
    const plan = buildSourceIdentityPlan({
      importedProducts: [women, men],
      existingProducts: [corrupted],
      officialSpecs: new Map([
        ["yes-airmaster-3d", { slug: "yes-airmaster-3d", boardLine: "men" }],
      ]),
    });
    const group = plan.logicalPlan.groups[0];

    expect(group.repairRequired).toBe(true);
    expect(
      group.assignments.find((assignment) => assignment.slug === "yes-airmaster-3d")
        .members[0].sourceProductId,
    ).toBe("1914518");
  });

  it("never mixes sizes and affiliate URL across compatible commerce offers", () => {
    const expensive = makeProduct({
      sourceProductId: "1914518",
      sizes: [150, 153, 156],
      priceFrom: 60_000,
    });
    const cheaper = makeProduct({
      storeCode: "trial-sport",
      sourceProductId: "2779985",
      sizes: [151, 154],
      priceFrom: 40_000,
    });
    const merged = mergeImportedProducts(expensive, cheaper);

    expect(merged.sizes.map((size) => size.sizeCm)).toEqual([151, 154]);
    expect(merged.affiliateUrl).toBe(cheaper.affiliateUrl);
    expect(merged.priceFrom).toBe(40_000);
  });

  it("throws before creating a Frankenstein merge for incompatible offers", () => {
    const men = makeProduct({ sourceProductId: "1914518" });
    const women = makeProduct({
      sourceProductId: "1914525",
      boardLine: "women",
      sizes: [146, 149, 152],
    });

    expect(() => mergeImportedProducts(men, women)).toThrow(
      /incompatible source offers/u,
    );
  });

  it("separates known season conflicts", () => {
    const current = makeProduct({ seasonLabel: "2025/2026" });
    const historical = makeProduct({
      storeCode: "trial-sport",
      sourceProductId: "2779985",
      seasonLabel: "2024/2025",
    });
    const plan = buildSourceIdentityPlan({
      importedProducts: [current, historical],
    });

    expect(plan.resolvedProducts).toHaveLength(2);
  });

  it("keeps regular and explicit Wide offers separate", () => {
    const regular = makeProduct();
    const wide = makeProduct({
      slug: "yes-airmaster-3d-wide",
      modelName: "Airmaster 3D Wide",
      sourceProductId: "1914999",
      variantMarker: "wide",
    });
    wide.importMeta.baseSlug = "yes-airmaster-3d";
    const plan = buildSourceIdentityPlan({
      importedProducts: [regular, wide],
    });

    expect(plan.resolvedProducts).toHaveLength(2);
    expect(plan.resolvedProducts.map((product) => product.slug)).toContain(
      "yes-airmaster-3d-wide",
    );
  });

  it("does not apply an official spec across a board-line boundary", () => {
    const women = makeProduct({ boardLine: "women", flex: 4 });
    const result = applyOfficialProductSpecs(women, {
      slug: women.slug,
      boardLine: "men",
      flex: 9,
      shapeType: "directional",
      camberProfile: "camber",
      sourceName: "Official",
      sourceUrl: "https://example.com/official",
      sourceCheckedAt: "2026-08-09",
    });

    expect(result).toBe(women);
    expect(result.flex).toBe(6);
  });

  it("fails conservatively when line evidence is missing", () => {
    const known = makeProduct();
    const missing = makeProduct({
      storeCode: "trial-sport",
      sourceProductId: "2779985",
      boardLineEvidence: "missing",
    });

    expect(getSourceOfferCompatibility(known, missing)).toEqual({
      compatible: false,
      reasons: ["board-line evidence is missing for an ambiguous identity"],
    });
  });

  it("preserves an existing collision suffix after its sibling disappears", () => {
    const women = makeProduct({
      slug: "yes-airmaster-3d-women",
      sourceProductId: "1914525",
      boardLine: "women",
      sizes: [146, 149, 152],
    });
    women.importMeta.baseSlug = "yes-airmaster-3d";
    const existing = { ...women, id: "existing" };
    delete existing.importMeta;
    const plan = buildSourceIdentityPlan({
      importedProducts: [women],
      existingProducts: [existing],
    });

    expect(plan.resolvedProducts[0].slug).toBe("yes-airmaster-3d-women");
  });

  it("produces the same logical plan and hash for reordered input", () => {
    const men = makeProduct({ sourceProductId: "1914518" });
    const women = makeProduct({
      sourceProductId: "1914525",
      boardLine: "women",
      sizes: [146, 149, 152],
    });
    const first = buildSourceIdentityPlan({ importedProducts: [men, women] });
    const second = buildSourceIdentityPlan({ importedProducts: [women, men] });

    expect(first.logicalPlan).toEqual(second.logicalPlan);
    expect(first.planHash).toBe(second.planHash);
  });

  it("recognizes an exact repaired state as a no-op", () => {
    const men = makeProduct({ sourceProductId: "1914518" });
    const women = makeProduct({
      slug: "yes-airmaster-3d-women",
      sourceProductId: "1914525",
      boardLine: "women",
      sizes: [146, 149, 152],
    });
    men.importMeta.baseSlug = "yes-airmaster-3d";
    women.importMeta.baseSlug = "yes-airmaster-3d";
    const existingMen = { ...men, id: "men" };
    const existingWomen = { ...women, id: "women" };
    delete existingMen.importMeta;
    delete existingWomen.importMeta;
    const plan = buildSourceIdentityPlan({
      importedProducts: [men, women],
      existingProducts: [existingMen, existingWomen],
    });

    expect(plan.logicalPlan.groups[0].repairRequired).toBe(false);
  });

  it("recognizes a repaired source suffix when display model wording differs", () => {
    const shortName = makeProduct({
      slug: "kemper-freestyle",
      brand: "Kemper",
      modelName: "Freestyle",
      sourceProductId: "1422759",
    });
    const longName = makeProduct({
      slug: "kemper-freestyle",
      brand: "Kemper",
      modelName: "Freestyle Snowboard",
      sourceProductId: "1596933",
    });
    shortName.importMeta.baseSlug = "kemper-freestyle";
    longName.importMeta.baseSlug = "kemper-freestyle";
    const existingShortName = { ...shortName, id: "short-name" };
    const existingLongName = {
      ...longName,
      id: "long-name",
      slug: "kemper-freestyle-traektoria-1596933",
    };
    delete existingShortName.importMeta;
    delete existingLongName.importMeta;

    const plan = buildSourceIdentityPlan({
      importedProducts: [shortName, longName],
      existingProducts: [existingShortName, existingLongName],
    });

    expect(plan.logicalPlan.groups[0].currentProducts).toHaveLength(2);
    expect(plan.logicalPlan.groups[0].repairRequired).toBe(false);
  });

  it("blocks when every deterministic collision slug belongs to another source", () => {
    const men = makeProduct({ sourceProductId: "1914518" });
    const women = makeProduct({
      sourceProductId: "1914525",
      boardLine: "women",
      sizes: [146, 149, 152],
    });
    const occupiedLineSlug = makeProduct({
      slug: "yes-airmaster-3d-women",
      sourceProductId: "9990001",
      boardLine: "women",
    });
    const occupiedSourceSlug = makeProduct({
      slug: "yes-airmaster-3d-traektoria-1914525",
      sourceProductId: "9990002",
      boardLine: "women",
    });
    delete occupiedLineSlug.importMeta;
    delete occupiedSourceSlug.importMeta;
    const plan = buildSourceIdentityPlan({
      importedProducts: [men, women],
      existingProducts: [occupiedLineSlug, occupiedSourceSlug],
    });

    expect(plan.logicalPlan.blockingIssues).toHaveLength(1);
    expect(plan.logicalPlan.blockingIssues[0]).toMatch(/Unable to derive/u);
  });
});

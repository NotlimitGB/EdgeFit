import { describe, expect, it, vi } from "vitest";
import {
  importTraektoriaProducts,
  revalidateTraektoriaProducts,
  resolveTraektoriaBoardLineMetadata,
  resolveTraektoriaSourceMetadata,
  TRAEKTORIA_SOURCE_METADATA_CORRECTIONS,
} from "./traektoria.mjs";
import { normalizeSourceIdentityText } from "./source-identity.mjs";

const EXTRA_IDS = ["1890639", "1890653"];
const GUARDED_MEN_SOURCES = [
  ["1890654", "Stratos"],
  ["1890652", "Tweaker"],
];

describe("Traektoria trusted board-line corrections", () => {
  it.each(["1890654", "1890652"])(
    "rejects wrong identity for correction source %s",
    (sourceProductId) => {
      expect(resolveTraektoriaSourceMetadata({
        sourceProductId,
        brand: "Wrong",
        modelName: "Wrong",
        rawGender: "unisex",
      })).toMatchObject({
        status: "conflict",
        category: "source_metadata_conflict",
        correctionApplied: false,
      });
    },
  );

  it.each([
    ["other-women", "women", "women"],
    ["other-men", "men", "men"],
    ["other-unisex", "unisex", "unisex"],
  ])("preserves raw metadata when %s has no correction", (sourceId, raw, expected) => {
    expect(resolveTraektoriaBoardLineMetadata(sourceId, raw)).toMatchObject({
      status: "resolved",
      boardLine: expected,
      evidence: "known",
      correctionApplied: false,
    });
  });

  it.each(GUARDED_MEN_SOURCES)(
    "corrects trusted men source %s while the merchant reports unisex",
    (sourceProductId, modelName) => {
      expect(
        resolveTraektoriaSourceMetadata({
          sourceProductId, brand: "Jones", modelName, rawGender: "unisex",
        }),
      ).toMatchObject({
        status: "resolved",
        boardLine: "men",
        evidence: "known",
        correctionApplied: true,
      });
      expect(resolveTraektoriaSourceMetadata({
        sourceProductId, brand: "Jones", modelName, rawGender: "men",
      })).toMatchObject({
        status: "resolved",
        boardLine: "men",
        evidence: "known",
        correctionApplied: false,
      });
    },
  );

  describe.each(GUARDED_MEN_SOURCES)("identity guard for %s / %s", (sourceProductId, modelName) => {
    it.each([
      ["wrong brand", { brand: "Wrong" }],
      ["wrong model", { modelName: "Wrong" }],
      ["missing brand", { brand: undefined }],
      ["missing model", { modelName: undefined }],
      ["missing identity", { brand: undefined, modelName: undefined }],
      ["empty brand", { brand: " " }],
      ["empty model", { modelName: " " }],
      ["empty identity", { brand: "", modelName: "" }],
    ])("fails closed for %s", (_case, identity) => {
      expect(resolveTraektoriaSourceMetadata({
        sourceProductId, brand: "Jones", modelName, rawGender: "unisex", ...identity,
      })).toMatchObject({
        status: "conflict",
        category: "source_metadata_conflict",
        correctionApplied: false,
      });
    });

    it.each(["women", "", undefined, "unknown", "youth"])(
      "rejects incompatible merchant audience %j with correct identity",
      (rawGender) => {
        expect(resolveTraektoriaSourceMetadata({
          sourceProductId, brand: "Jones", modelName, rawGender,
        })).toMatchObject({
          status: "conflict",
          category: "source_metadata_conflict",
          correctionApplied: false,
        });
      },
    );

    it("uses the existing identity normalization", () => {
      expect(resolveTraektoriaSourceMetadata({
        sourceProductId,
        brand: "  JONES  ",
        modelName: ` ${modelName.toUpperCase()} `,
        rawGender: "унисекс",
      })).toMatchObject({ status: "resolved", boardLine: "men", correctionApplied: true });
    });
  });

  it.each(Object.keys(TRAEKTORIA_SOURCE_METADATA_CORRECTIONS))(
    "refuses identity-sensitive correction %s through the identity-free wrapper",
    (sourceProductId) => {
      for (const rawGender of ["unisex", "men", "", "unknown"]) {
        expect(resolveTraektoriaBoardLineMetadata(sourceProductId, rawGender)).toMatchObject({
          status: "conflict",
          category: "source_metadata_conflict",
          correctionApplied: false,
        });
      }
    },
  );

  it.each(Object.entries(TRAEKTORIA_SOURCE_METADATA_CORRECTIONS))(
    "requires a complete normalized correction identity for %s",
    (_sourceProductId, correction) => {
      for (const field of ["expectedBrand", "expectedModel"]) {
        expect(correction[field]).toEqual(expect.any(String));
        expect(correction[field].trim().length).toBeGreaterThan(0);
        expect(correction[field]).toBe(normalizeSourceIdentityText(correction[field]));
      }
    },
  );

  it("leaves the audited Jones women sources unchanged", () => {
    expect(resolveTraektoriaBoardLineMetadata("1890645", "women")).toMatchObject({
      boardLine: "women",
      correctionApplied: false,
    });
    expect(resolveTraektoriaBoardLineMetadata("1890637", "women")).toMatchObject({
      boardLine: "women",
      correctionApplied: false,
    });
  });

  it.each(["", "unknown", "unisex", "men"])(
    "applies the exact Frontier 2.0 metadata correction for merchant line %j",
    (rawGender) => {
      expect(
        resolveTraektoriaSourceMetadata({
          sourceProductId: "1890649",
          brand: "Jones",
          modelName: "Frontier 2.0",
          rawGender,
        }),
      ).toMatchObject({
        status: "resolved",
        boardLine: "men",
        evidence: "known",
        camberProfile: "hybrid-camber",
        flex: 5,
        shapeType: "directional",
      });
    },
  );

  it.each([
    ["wrong brand", "Other", "Frontier 2.0", "unisex"],
    ["wrong model", "Jones", "Frontier", "unisex"],
    ["conflicting board line", "Jones", "Frontier 2.0", "women"],
    ["protected youth line", "Jones", "Frontier 2.0", "youth"],
  ])(
    "fails the Frontier 2.0 correction closed for %s",
    (_case, brand, modelName, rawGender) => {
      expect(
        resolveTraektoriaSourceMetadata({
          sourceProductId: "1890649",
          brand,
          modelName,
          rawGender,
        }),
      ).toMatchObject({
        status: "conflict",
        category: "source_metadata_conflict",
        correctionApplied: false,
      });
    },
  );

  it("does not apply Frontier 2.0 metadata to another source ID", () => {
    expect(
      resolveTraektoriaSourceMetadata({
        sourceProductId: "1890648",
        brand: "Jones",
        modelName: "Frontier 2.0",
        rawGender: "unisex",
      }),
    ).toMatchObject({
      status: "resolved",
      boardLine: "unisex",
      correctionApplied: false,
      camberProfile: null,
      flex: null,
      shapeType: null,
    });
  });
});

const COLUMN_TABLE = `
  <table>
    <tr><th>Ростовка</th><th>154</th><th>158</th></tr>
    <tr><td>Ширина талии</td><td>25.2</td><td>25.6</td></tr>
    <tr><td>Вес райдера</td><td>55-80</td><td>65-90</td></tr>
  </table>
`;

const ROW_TABLE = `
  <table>
    <tr><th>Ростовка, см.</th><th>Эффективная длина канта, см.</th><th>Ширина талии, см.</th><th>Вес райдера, кг.</th></tr>
    <tr><td>164</td><td>123.5</td><td>26.9</td><td>70-100</td></tr>
    <tr><td>168</td><td>126.0</td><td>27.2</td><td>75-105</td></tr>
  </table>
`;

function makeProductPayload({
  brand = "Test",
  modelName = "Test Board",
  table = COLUMN_TABLE,
  thingType = "сноуборд",
  gender = "унисекс",
  skuList,
  filterOptions = [],
  descriptions = {},
} = {}) {
  return {
    data: {
      MAIN: {
        content: {
          model: {
            brand: { name: brand },
            props: {
              name: `${brand} ${modelName}`,
              model_name: modelName,
              thing_type: thingType,
              gender,
            },
            photo_list: [],
            sku_list:
              skuList === undefined ? [
                {
                  sizes: [
                    { size_title: "154", is_available: true, retail_price: 10 },
                    { size_title: "158", is_available: true, retail_price: 10 },
                    { size_title: "164", is_available: true, retail_price: 10 },
                    { size_title: "168", is_available: true, retail_price: 10 },
                  ],
                },
              ] : skuList,
          },
          filter_options: filterOptions,
          descriptions,
          selected_sku: {},
          grid_size_html: table,
        },
      },
    },
  };
}

function getRequestedProductId(url) {
  return String(url).match(/\/slim\/pages\/product\/(\d+)\//u)?.[1] ?? null;
}

function createImporterFetch(
  payloads,
  { failures = new Set(), listingIds = [] } = {},
) {
  return vi.fn(async (url) => {
    if (String(url).includes("/slim/pages/section/")) {
      return {
        data: {
          MAIN: {
            content: {
              navigation: { data: { page_count: 1 } },
              products: listingIds.map((id) => ({
                url: `/product/${id}_test-board/`,
              })),
            },
          },
        },
      };
    }

    const sourceProductId = getRequestedProductId(url);
    if (failures.has(sourceProductId)) {
      throw new Error("network failure");
    }

    return payloads[sourceProductId];
  });
}

async function importExtras(payloads, options = {}) {
  return importTraektoriaProducts({
    fetchJson: createImporterFetch(payloads, options),
    checkedAt: "2026-08-12",
    logger: { log: vi.fn() },
    limit: options.limit ?? null,
  });
}

function makeExistingProduct(sourceProductId, slug = `board-${sourceProductId}`) {
  return {
    slug,
    affiliateUrl: `https://www.traektoria.ru/product/${sourceProductId}_${slug}/`,
  };
}

describe("Traektoria corrected Product identity", () => {
  it("emits the complete guarded Jones Frontier 2.0 metadata target", async () => {
    const result = await importExtras(
      {
        [EXTRA_IDS[0]]: makeProductPayload(),
        [EXTRA_IDS[1]]: makeProductPayload(),
        "1890649": makeProductPayload({
          brand: "Jones",
          modelName: "Frontier 2.0",
          gender: "unisex",
        }),
      },
      { listingIds: ["1890649"] },
    );
    const corrected = result.products.find(
      (product) => product.importMeta.sourceProductId === "1890649",
    );

    expect(corrected).toMatchObject({
      slug: "jones-frontier-2-0",
      brand: "Jones",
      modelName: "Frontier 2.0",
      boardLine: "men",
      camberProfile: "hybrid-camber",
      flex: 5,
      shapeType: "directional",
      importMeta: {
        sourceProductId: "1890649",
        boardLineEvidence: "known",
      },
      truthV2: {
        boardLine: "men",
        flex: 5,
        shapeType: "directional",
        camberProfile: "hybrid-camber",
      },
    });
    expect(result.diagnostics).toMatchObject({
      unsafeFailureCount: 0,
      staleSafe: true,
    });
  });

  it.each(GUARDED_MEN_SOURCES.flatMap(([sourceProductId, modelName]) =>
    ["unisex", "men"].map((gender) => [sourceProductId, modelName, gender]),
  ))("emits guarded %s / Jones %s truth for merchant line %s", async (sourceProductId, modelName, gender) => {
    const result = await importExtras(
      {
        [EXTRA_IDS[0]]: makeProductPayload(),
        [EXTRA_IDS[1]]: makeProductPayload(),
        [sourceProductId]: makeProductPayload({ brand: "Jones", modelName, gender }),
      },
      { listingIds: [sourceProductId] },
    );
    const corrected = result.products.find(
      (product) => product.importMeta.sourceProductId === sourceProductId,
    );

    expect(corrected).toMatchObject({
      boardLine: "men",
      importMeta: {
        sourceProductId,
        boardLineEvidence: "known",
      },
      truthV2: {
        boardLine: "men",
        attributeEvidence: {
          boardLine: gender === "unisex"
            ? { provenance: "manual", method: "manual-override" }
            : { provenance: "merchant", method: "explicit" },
        },
      },
    });
    expect(result.diagnostics).toMatchObject({
      unsafeFailureCount: 0,
      staleSafe: true,
    });
  });

  it("turns contradictory trusted metadata into an unsafe failure", async () => {
    const result = await importExtras(
      {
        [EXTRA_IDS[0]]: makeProductPayload(),
        [EXTRA_IDS[1]]: makeProductPayload(),
        "1890652": makeProductPayload({
          brand: "Jones",
          modelName: "Tweaker",
          gender: "women",
        }),
      },
      { listingIds: ["1890652"] },
    );

    expect(
      result.products.some(
        (product) => product.importMeta.sourceProductId === "1890652",
      ),
    ).toBe(false);
    expect(result.diagnostics.failuresByCategory.source_metadata_conflict).toBe(1);
    expect(result.diagnostics).toMatchObject({
      unsafeFailureCount: 1,
      staleSafe: false,
      importComplete: false,
    });
  });
});

describe("Traektoria size-table parsing", () => {
  it("preserves column-oriented tables and supports semantic row-oriented tables", async () => {
    const result = await importExtras({
      [EXTRA_IDS[0]]: makeProductPayload({ modelName: "Column" }),
      [EXTRA_IDS[1]]: makeProductPayload({ modelName: "Row", table: ROW_TABLE }),
    });

    expect(result.products).toHaveLength(2);
    expect(result.products[0].sizes.map((size) => [size.sizeCm, size.waistWidthMm]))
      .toEqual([
        [154, 252],
        [158, 256],
      ]);
    expect(result.products[1].sizes.map((size) => [size.sizeCm, size.waistWidthMm]))
      .toEqual([
        [164, 269],
        [168, 272],
      ]);
    expect(result.products.flatMap((product) => product.sizes).every(
      (size) => size.truthV2.waistWidthMm === size.waistWidthMm,
    )).toBe(true);
    expect(result.diagnostics).toMatchObject({
      resolvedCount: 2,
      importComplete: true,
      staleSafe: true,
      complete: true,
    });
  });

  it("attaches multi-value style, direct skill and normalized flex truth", async () => {
    const result = await importExtras({
      [EXTRA_IDS[0]]: makeProductPayload({
        modelName: "Truth Board",
        gender: "Девочки",
        filterOptions: [
          { code: "RIDING_STYLE", value: "All Mountain / Freestyle" },
          { code: "LEVEL", value: "Продвинутый Эксперт" },
          { code: "FLEX", value: "Жёсткие" },
          { code: "SHAPE", value: "Directional Twin" },
        ],
      }),
      [EXTRA_IDS[1]]: makeProductPayload(),
    });
    const product = result.products.find((item) => item.modelName === "Truth Board");
    expect(product.truthV2).toMatchObject({
      ridingStyles: ["all-mountain", "park"],
      skillApplicability: { min: "intermediate", max: "advanced" },
      flex: 8,
      boardLine: "women",
      shapeType: "directional-twin",
    });
  });

  it("emits a safe observation for a trustworthy missing table", async () => {
    const result = await importExtras({
      [EXTRA_IDS[0]]: makeProductPayload({ table: "" }),
      [EXTRA_IDS[1]]: makeProductPayload(),
    });

    expect(result.products).toHaveLength(1);
    expect(result.sourceObservations).toEqual([
      {
        storeCode: "traektoria",
        sourceProductId: EXTRA_IDS[0],
        status: "safe_unimportable",
        reason: "size_table_missing",
        availability: "available",
      },
    ]);
    expect(result.diagnostics).toMatchObject({
      safeUnimportableCount: 1,
      unsafeFailureCount: 0,
      importComplete: false,
      staleSafe: true,
      complete: false,
    });
  });

  it.each([
    ["malformed table", "<table><tr><td>unknown</td></tr></table>"],
    [
      "implausible geometry",
      "<table><tr><th>Ростовка</th><th>154</th></tr><tr><td>Ширина талии</td><td>5</td></tr></table>",
    ],
  ])("fails closed for %s", async (_name, table) => {
    const result = await importExtras({
      [EXTRA_IDS[0]]: makeProductPayload({ table }),
      [EXTRA_IDS[1]]: makeProductPayload(),
    });

    expect(result.diagnostics.failuresByCategory.size_table_parse_failure).toBe(1);
    expect(result.diagnostics).toMatchObject({
      unsafeFailureCount: 1,
      importComplete: false,
      staleSafe: false,
    });
  });
});

describe("Traektoria diagnostics", () => {
  it("fails closed on Product fetch and unknown SKU availability", async () => {
    const fetched = await importExtras(
      {
        [EXTRA_IDS[1]]: makeProductPayload(),
      },
      { failures: new Set([EXTRA_IDS[0]]) },
    );
    expect(fetched.diagnostics.failuresByCategory.product_fetch_failure).toBe(1);
    expect(fetched.diagnostics.staleSafe).toBe(false);

    const unknownAvailability = await importExtras({
      [EXTRA_IDS[0]]: makeProductPayload({ skuList: null }),
      [EXTRA_IDS[1]]: makeProductPayload(),
    });
    expect(
      unknownAvailability.diagnostics.failuresByCategory.availability_parse_failure,
    ).toBe(1);
    expect(unknownAvailability.diagnostics.staleSafe).toBe(false);
  });

  it("marks an intentional limit incomplete and stale-unsafe", async () => {
    const result = await importExtras(
      {
        [EXTRA_IDS[0]]: makeProductPayload(),
        [EXTRA_IDS[1]]: makeProductPayload(),
      },
      { limit: 1 },
    );

    expect(result.diagnostics).toMatchObject({
      discoveredCount: 2,
      attemptedCount: 1,
      processedCount: 1,
      limited: true,
      importComplete: false,
      staleSafe: false,
      complete: false,
    });
  });
});

describe("Traektoria direct revalidation", () => {
  it("classifies available, unavailable, not-found, and unknown outcomes", async () => {
    const products = ["1", "2", "3", "4", "5", "6"].map((id) =>
      makeExistingProduct(id),
    );
    const fetchJson = vi.fn(async (url) => {
      const id = getRequestedProductId(url);
      if (id === "3") throw new Error("HTTP 404");
      if (id === "4") throw new Error("CATALOG_HTTP_TIMEOUT");
      if (id === "5") return { data: { MAIN: { content: {} } } };
      if (id === "6") return makeProductPayload({ skuList: null });
      return makeProductPayload({
        skuList:
          id === "2"
            ? [{ sizes: [{ size_title: "154", is_available: false }] }]
            : undefined,
      });
    });

    const result = await revalidateTraektoriaProducts({ products, fetchJson });

    expect(result.outcomes).toEqual([
      { slug: "board-1", status: "available" },
      { slug: "board-2", status: "unavailable" },
      { slug: "board-3", status: "unavailable" },
      { slug: "board-4", status: "unknown" },
      { slug: "board-5", status: "unknown" },
      { slug: "board-6", status: "unknown" },
    ]);
    expect(result.diagnostics).toMatchObject({
      checkedCount: 6,
      availableCount: 1,
      unavailableCount: 2,
      unknownCount: 3,
      complete: false,
    });
  });

  it("treats an unexpected type as unknown", async () => {
    const result = await revalidateTraektoriaProducts({
      products: [makeExistingProduct("7")],
      fetchJson: async () => makeProductPayload({ thingType: "крепления" }),
    });

    expect(result.outcomes).toEqual([
      { slug: "board-7", status: "unknown" },
    ]);
    expect(result.diagnostics.failuresByCategory.unexpected_type).toBe(1);
  });
});

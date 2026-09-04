import { strToU8, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import {
  importTrialSportProducts,
  revalidateTrialSportProducts,
  resolveTrialSportBoardLineMetadata,
  resolveTrialSportSizeMetadataCorrection,
  resolveTrialSpecGroupMatch,
  TRIAL_SPORT_FAILURE_CATEGORIES,
  TRIAL_SPORT_SOURCE_METADATA_CORRECTIONS,
} from "./trial-sport.mjs";
import { CatalogHttpTimeoutError } from "./catalog-http.mjs";
import { buildSourceIdentityPlan } from "./source-identity.mjs";
import { normalizeBoardKey, parseSeasonLabel } from "./common.mjs";

const sectionUrl =
  "https://trial-sport.ru/gds.php?s=51526&c1=1070639&c2=1078224&gpp=100";
const productUrl = "https://trial-sport.ru/goods/51526/1001.html";
const specUrl = "https://trial-sport.ru/svdownload.php?svid=7";

function buildListing(...ids) {
  return ids
    .map(
      (id) =>
        `<div class="available"><a href="/goods/51526/${id}.html">Product</a></div>`,
    )
    .join("");
}

function buildProductPage({
  availability = "available",
  brand = "TEST",
  description = "",
  audience = [],
  entries,
  id = "1001",
  modelName = "Model",
} = {}) {
  const pageEntries =
    entries ??
    [
      {
        size: "156",
        nalim: availability === "available",
        stores: [],
        im_cols_avail: availability === "available" ? 1 : 0,
        im_cols_reserved: 0,
      },
    ];
  const availabilityScript =
    availability === "malformed"
      ? "<script>const icspJS = notJson;</script>"
      : `<script>const icspJS = ${JSON.stringify(pageEntries)};</script>`;
  const descriptionMarkup = `<div class="card-info__blocks">
    <div class="card-info__block" data-block="block1">
      ${description ? `Сноуборд ${brand} ${modelName} - ${`${description} `.repeat(8)}` : ""}
      <table><tr><td>Бренд:</td><td><a onclick="showBrand();">${brand}</a></td></tr>
        ${audience.map(value => `<tr><td>Пол:</td><td>${value}</td></tr>`).join("")}
      </table>
    </div></div>`;

  return `
    <a href="/gds.php?brand=test"><span>${brand}</span></a>
    <h1>Сноуборд ${brand} ${modelName} 2025</h1>
    ${descriptionMarkup}
    ${availabilityScript}
    <a href="/svdownload.php?svid=7">Specs</a>
    <script>window.productId = ${id};</script>
  `;
}

function buildSpecWorkbook({
  modelName = "Model",
  shape = "Directional",
  purpose = "All Mountain",
  flex = "5",
  sizes = [{ sizeLabel: "156", waistWidthCm: "25.0" }],
} = {}) {
  const sizeRows = sizes
    .map(
      (size, index) => `
        <row r="${index + 3}">
          <c r="D${index + 3}"><v>${size.sizeLabel}</v></c>
          <c r="H${index + 3}"><v>${size.waistWidthCm}</v></c>
        </row>`,
    )
    .join("");
  const sheet = `
    <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <sheetData>
        <row r="1"><c r="A1"><v>Header</v></c></row>
        <row r="2">
          <c r="A2"><v>${modelName}</v></c>
          <c r="B2"><v>${shape}</v></c>
          <c r="C2"><v>${purpose}</v></c>
          <c r="K2"><v>${flex}</v></c>
        </row>
        ${sizeRows}
      </sheetData>
    </worksheet>
  `;

  return Buffer.from(
    zipSync({
      "xl/worksheets/sheet1.xml": strToU8(sheet),
    }),
  );
}

function makeSpecMap(...modelNames) {
  return new Map(
    modelNames.map((modelName) => [
      normalizeBoardKey(modelName),
      { modelName, sizes: [] },
    ]),
  );
}

function makeTrialEntry(size, isAvailable) {
  return {
    size: String(size),
    nalim: isAvailable,
    stores: [],
    im_cols_avail: isAvailable ? 1 : 0,
    im_cols_reserved: 0,
  };
}

function createFetchText({
  listingIds = ["1001"],
  audience = [],
  productFailure = false,
  availability = "available",
  productPageTransform = (page) => page,
} = {}) {
  return vi.fn(async (url) => {
    if (url === sectionUrl) {
      return buildListing(...listingIds);
    }

    if (/\/goods\/51526\/\d+\.html$/u.test(url)) {
      if (productFailure && url === productUrl) {
        throw new Error("HTTP 503");
      }

      const id = url.match(/\/(\d+)\.html$/u)?.[1] ?? "";
      return productPageTransform(
        buildProductPage({
          availability,
          audience,
          id,
        }),
      );
    }

    throw new Error(`Unexpected test URL: ${url}`);
  });
}

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

function buildStructuredProductPage({
  description = `LIVE_DESCRIPTION_MARKER ${"универсальная женская модель. ".repeat(5)}`,
  audience = ["для женщин"],
  duplicate = true,
  ...options
} = {}) {
  const block = `
    <div class="card-info__block" data-block="block1">
      <div class="video-mobile-content">${description}<br><br>
        <div class="video_icon_title">VIDEO_EXCLUDED</div>
      </div>
      <table><tr><td>Бренд:</td><td><a onclick="showBrand();">Brand</a></td></tr>
        ${audience.map(value => `<tr><td>Пол:</td><td>${value}</td></tr>`).join("")}
      </table>
    </div>`;
  return buildProductPage({ ...options, description: "" }).replace(
    "</h1>",
    `</h1>${"<!-- intermediate markup -->".repeat(300)}
      <nav>FILTER_EXCLUDED для мужчин унисекс</nav>
      <div class="card-info__blocks">${block}
        <div class="card-info__block" data-block="block4">BRAND_EXCLUDED</div>
      </div>${duplicate ? `<div class="card-info__blocks">${block}</div>` : ""}`,
  );
}

async function importStructuredPage(options = {}) {
  const { transform = page => page, ...pageOptions } = options;
  return importTrialSportProducts({
    fetchText: createFetchText({
      listingIds: [options.id ?? "1001"],
      productPageTransform: () => transform(buildStructuredProductPage(pageOptions)),
    }),
    fetchArrayBuffer: async () => buildSpecWorkbook({ modelName: options.modelName ?? "Model" }),
    checkedAt: "2026-09-04T06:42:15.849Z",
    concurrency: 1,
    logger: silentLogger,
  });
}

const cardFlexField = "card-info__block[block1].table.Жесткость";

async function importFlexPage({ workbook = "", cards = [], label = "Жесткость:", transform = page => page } = {}) {
  let cardIndex = 0;
  const page = buildStructuredProductPage().replaceAll("<td>Пол:</td>", () => {
    const value = cards[cardIndex++];
    return value == null ? "<td>Пол:</td>"
      : `<td>${label}</td><td>${value}</td></tr><tr><td>Пол:</td>`;
  });
  return importTrialSportProducts({
    fetchText: createFetchText({ productPageTransform: () => transform(page) }),
    fetchArrayBuffer: async () => buildSpecWorkbook({ flex: workbook }),
    checkedAt: "2026-09-04T06:42:15.849Z", concurrency: 1, logger: silentLogger,
  });
}

describe("Trial structured flex fusion", () => {
  it.each([
    ["", ["4"], 4, "known", cardFlexField],
    ["5", [], 5, "known", "workbook.flex"],
    ["4", ["4"], 4, "known", "workbook.flex"],
    ["5", ["4"], null, "ambiguous", `workbook.flex|${cardFlexField}`],
    ["", ["4-5"], null, "ambiguous", cardFlexField],
    ["5", ["4-5"], null, "ambiguous", `workbook.flex|${cardFlexField}`],
    ["4-5", [], null, "ambiguous", "workbook.flex"],
    ["4-5", ["4"], null, "ambiguous", `workbook.flex|${cardFlexField}`],
    ["4-5", ["5-6"], null, "ambiguous", `workbook.flex|${cardFlexField}`],
    ["не указано", ["4-5"], null, "ambiguous", cardFlexField],
    ["4-5", ["не указано"], null, "ambiguous", "workbook.flex"],
    ["", ["не указано"], null, "unknown", "workbook.flex"],
    ["", [""], null, "unknown", "workbook.flex"],
    ["", [], null, "unknown", "workbook.flex"],
    ["nonsense", ["не указано"], null, "unknown", "workbook.flex"],
    ["5", ["не указано"], 5, "known", "workbook.flex"],
    ["nonsense", ["4"], 4, "known", cardFlexField],
    ["", ["4", "4"], 4, "known", cardFlexField],
    ["", ["4", "5"], null, "ambiguous", cardFlexField],
    ["", ["4", "не указано"], null, "ambiguous", cardFlexField],
    ["", ["4", ""], null, "ambiguous", cardFlexField],
    ["", [null, "4"], 4, "known", cardFlexField],
    ["", ["", "не указано"], null, "unknown", "workbook.flex"],
    ["4", ["4", "5"], null, "ambiguous", `workbook.flex|${cardFlexField}`],
  ])("combines workbook %j and responsive card %j", async (workbook, cards, value, state, sourceField) => {
    const result = await importFlexPage({ workbook, cards });
    expect(result.products).toHaveLength(1);
    expect(result.diagnostics.unsafeFailureCount).toBe(0);
    expect(result.products[0].truthV2.flex).toBe(value);
    expect(result.products[0].truthV2.attributeEvidence.flex).toEqual({
      state, provenance: "merchant", method: state === "known" ? "explicit" : null,
      sourceName: "Триал-Спорт", sourceUrl: productUrl,
      observedAt: "2026-09-04T06:42:15.849Z", sourceField,
      sourceScaleMax: state === "known" ? 10 : null, normalizationRule: null,
    });
  });

  it.each([
    ["средняя", "5", "normalized", "flex-text-v1"],
    ["5", "средняя", "explicit", null],
  ])("retains first equal card evidence for %s / %s", async (first, second, method, normalizationRule) => {
    const result = await importFlexPage({ cards: [first, second] });
    expect(result.products[0].truthV2.flex).toBe(5);
    expect(result.products[0].truthV2.attributeEvidence.flex).toMatchObject({ method, normalizationRule, sourceScaleMax: 10 });
  });

  it.each(["Жесткость", "Жесткость:", "Жёсткость:", "  Жесткость :  ", "<span>Жёсткость</span>:"])(
    "accepts orthographic label %s and inline decimal evidence", async label => {
      const result = await importFlexPage({ cards: ["<span>7,6</span>"], label });
      expect(result.products[0].truthV2.flex).toBe(7.6);
      expect(result.products[0].truthV2.attributeEvidence.flex).toMatchObject({ sourceField: cardFlexField, method: "explicit", sourceScaleMax: 10 });
    },
  );

  it("does not accept semantic label aliases", async () => {
    const result = await importFlexPage({ cards: ["4"], label: "Flex:" });
    expect(result.products[0].truthV2.flex).toBeNull();
  });

  it("ignores flex in prose, global tables, filters, brand, video, scripts and comments", async () => {
    const row = "<tr><td>Жесткость:</td><td>9</td></tr>";
    const table = `<table><tr><td>Бренд:</td><td><a onclick="showBrand();">Brand</a></td></tr>${row}</table>`;
    const block = `<div class="card-info__block" data-block="block1">${table}</div>`;
    const result = await importFlexPage({
      cards: ["4"],
      transform: page => `<nav>${table}</nav><title>Жесткость: 9</title><script>const fake='${block}';</script><!-- ${block} -->${page}`
        .replaceAll("VIDEO_EXCLUDED", table)
        .replaceAll("BRAND_EXCLUDED", table)
        .replaceAll("LIVE_DESCRIPTION_MARKER", "LIVE_DESCRIPTION_MARKER Жесткость: 9")
        .replaceAll("</h1>", `</h1><table>${row}</table>`),
    });
    expect(result.products[0].truthV2.flex).toBe(4);
  });

  it("requires the brand/showBrand anchor and exactly two cells", async () => {
    const result = await importFlexPage({ cards: ["4"], transform: page => page
      .replaceAll('onclick="showBrand();"', 'onclick="other();"') });
    expect(result.products[0].truthV2.flex).toBeNull();
    const malformed = await importFlexPage({ cards: ["4</td><td>5"] });
    expect(malformed.products[0].truthV2.flex).toBeNull();
  });
});

describe("Trial live structure regression", () => {
  it("recovers HYPE structured flex without changing legacy flex", async () => {
    const result = await importTrialSportProducts({
      fetchText: createFetchText({
        listingIds: ["3131351"],
        productPageTransform: () => buildStructuredProductPage({
          brand: "Rome", modelName: "HYPE", id: "3131351",
        }).replaceAll("<td>Пол:</td>", "<td>Жесткость:</td><td>4</td></tr><tr><td>Пол:</td>"),
      }),
      fetchArrayBuffer: async () => buildSpecWorkbook({ modelName: "HYPE", flex: "" }),
      checkedAt: "2026-09-04T06:42:15.849Z", concurrency: 1, logger: silentLogger,
    });
    expect(result.products).toHaveLength(1);
    const product = result.products[0];
    expect(product.truthV2.flex).toBe(4);
    expect(product.truthV2.attributeEvidence.flex).toEqual({
      state: "known", provenance: "merchant", method: "explicit",
      sourceName: "Триал-Спорт", sourceUrl: "https://trial-sport.ru/goods/51526/3131351.html",
      observedAt: "2026-09-04T06:42:15.849Z",
      sourceField: "card-info__block[block1].table.Жесткость",
      sourceScaleMax: 10, normalizationRule: null,
    });
    expect(product.flex).toBe(5);
    expect(product.truthV2.boardLine).toBe("women");
    expect(product.descriptionFull).toContain("LIVE_DESCRIPTION_MARKER");
    expect(product.descriptionFull).not.toMatch(/BRAND_EXCLUDED|FILTER_EXCLUDED|VIDEO_EXCLUDED/u);
    expect(product.sizes[0].truthV2).toMatchObject({ waistWidthMm: 250, widthType: "regular" });
  });
  it("extracts a late description once without brand, filters or video text", async () => {
    const result = await importStructuredPage();
    expect(result.products).toHaveLength(1);
    expect(result.products[0].descriptionFull.match(/LIVE_DESCRIPTION_MARKER/gu)).toHaveLength(1);
    expect(result.products[0].descriptionFull).not.toMatch(/BRAND_EXCLUDED|FILTER_EXCLUDED|VIDEO_EXCLUDED/u);
  });

  it("recovers Rome HYPE structured women truth without a manual correction", async () => {
    const result = await importStructuredPage({ brand: "Rome", modelName: "HYPE" });
    expect(result.products).toHaveLength(1);
    expect(result.products[0].truthV2).toMatchObject({
      boardLine: "women",
      attributeEvidence: { boardLine: {
        state: "known", provenance: "merchant", method: "normalized",
        normalizationRule: "board-line-v1", sourceField: "card-info__block[block1].table.Пол",
      } },
    });
    expect(result.products[0].importMeta.sourceMetadataCorrectionApplied).toBe(false);
    expect(result.products[0].descriptionFull).toContain("LIVE_DESCRIPTION_MARKER");
  });

  it.each([
    [["для женщин"], "women", "known"],
    [["для мужчин"], "men", "known"],
    [["унисекс"], "unisex", "known"],
    [[], null, "unknown"],
    [[""], null, "unknown"],
    [["для детей"], null, "unknown"],
    [["не указано"], null, "unknown"],
    [["для мужчин и женщин"], null, "ambiguous"],
    [["для мужчин", "для женщин"], null, "ambiguous"],
    [["для женщин", "для женщин"], "women", "known"],
    [["для женщин", "не указано"], null, "ambiguous"],
  ])("conservatively resolves product gender rows %j", async (audience, boardLine, state) => {
    const result = await importStructuredPage({ audience });
    expect(result.products[0].truthV2).toMatchObject({
      boardLine,
      attributeEvidence: { boardLine: { state, provenance: "merchant" } },
    });
    expect(result.products[0].boardLine).toBe(boardLine ?? "unisex");
    if (state === "known") {
      expect(result.products[0].truthV2.attributeEvidence.boardLine).toMatchObject({
        method: "normalized", normalizationRule: "board-line-v1",
        sourceField: "card-info__block[block1].table.Пол",
        sourceName: "Триал-Спорт", sourceUrl: productUrl,
        observedAt: "2026-09-04T06:42:15.849Z",
      });
    }
  });

  it.each([
    "универсальная женская модель",
    "мужская модель",
    "подходит мужчинам и женщинам",
  ])("does not use description-only audience %s as truth", async description => {
    const result = await importStructuredPage({ description: `${description} `.repeat(8), audience: [] });
    expect(result.products[0].descriptionFull).toContain(description);
    expect(result.products[0].truthV2).toMatchObject({
      boardLine: null, attributeEvidence: { boardLine: { state: "unknown" } },
    });
  });

  it("keeps identical structured truth when description audience changes", async () => {
    const outputs = [];
    for (const description of ["универсальная женская модель", "универсальная доска", "мужская команда использует эту доску"]) {
      const result = await importStructuredPage({ description: `${description} `.repeat(8) });
      outputs.push(result.products[0].truthV2);
    }
    expect(outputs[0].boardLine).toBe("women");
    expect(outputs[1]).toEqual(outputs[0]);
    expect(outputs[2]).toEqual(outputs[0]);
  });

  it("ignores global filters, unrelated tables, brand blocks and scripted markup", async () => {
    const table = '<table><tr><td>Бренд:</td><td><a onclick="showBrand();">Brand</a></td></tr><tr><td>Пол:</td><td>для мужчин</td></tr></table>';
    const fakeBlock = `<div class="card-info__block" data-block="block1">${table}</div>`;
    const result = await importStructuredPage({
      audience: [],
      transform: page => `<nav>${table}</nav><script>const decoy = '${fakeBlock}';</script><!-- ${fakeBlock} -->${page}<div class="card-info__block" data-block="block4">${table}</div>`,
    });
    expect(result.products[0].truthV2.boardLine).toBeNull();
    const unrelated = await importStructuredPage({
      audience: [],
      transform: page => page.replace('VIDEO_EXCLUDED', '<table><tr><td>Пол:</td><td>для женщин</td></tr></table>'),
    });
    expect(unrelated.products[0].truthV2.boardLine).toBeNull();
  });

  it("supports attribute order, extra classes, inline markup and entities", async () => {
    const result = await importStructuredPage({
      audience: ["<span>для&nbsp;женщин</span>"],
      transform: page => page.replaceAll('class="card-info__block" data-block="block1"', "data-block='block1' class='extra card-info__block'"),
    });
    expect(result.products[0].truthV2.boardLine).toBe("women");
    expect(result.products[0].descriptionFull).toContain("LIVE_DESCRIPTION_MARKER");
  });

  it("stops description at the characteristic table even without video", async () => {
    const result = await importStructuredPage({
      transform: page => page.replaceAll('<div class="video_icon_title">VIDEO_EXCLUDED</div>', ''),
    });
    expect(result.products[0].descriptionFull).toContain("LIVE_DESCRIPTION_MARKER");
    expect(result.products[0].descriptionFull).not.toMatch(/Бренд:|Пол:|BRAND_EXCLUDED/u);
  });

  it("allows genuinely empty descriptions without swallowing neighbouring sections", async () => {
    const result = await importStructuredPage({ description: "" });
    expect(result.products[0].descriptionFull).not.toMatch(/BRAND_EXCLUDED|FILTER_EXCLUDED|VIDEO_EXCLUDED|Бренд:|Пол:/u);
    expect(result.products[0].truthV2.boardLine).toBe("women");
  });

  it("rejects contradictory desktop/mobile gender instead of preferring a copy", async () => {
    const result = await importStructuredPage({
      transform: page => page.replace('<td>для женщин</td>', '<td>для мужчин</td>'),
    });
    expect(result.products[0].truthV2).toMatchObject({
      boardLine: null, attributeEvidence: { boardLine: { state: "ambiguous" } },
    });
  });

  describe.each(Object.entries(TRIAL_SPORT_SOURCE_METADATA_CORRECTIONS))("structured correction %s", (id, correction) => {
    const identity = { id, brand: correction.expectedBrand, modelName: correction.expectedModel };
    it("overrides only the confirmed live unisex value with manual provenance", async () => {
      expect(correction.expectedBoardLine).toBe("unisex");
      const result = await importStructuredPage({ ...identity, audience: ["унисекс"] });
      expect(result.products[0]).toMatchObject({
        boardLine: "men",
        importMeta: { sourceMetadataCorrectionApplied: true },
        truthV2: { boardLine: "men", attributeEvidence: { boardLine: {
          state: "known", provenance: "manual", method: "manual-override",
          sourceField: "authorized_board_line_correction",
        } } },
      });
    });

    it("keeps direct men evidence merchant-attributed", async () => {
      const result = await importStructuredPage({ ...identity, audience: ["для мужчин"] });
      expect(result.products[0]).toMatchObject({
        importMeta: { sourceMetadataCorrectionApplied: false },
        truthV2: { boardLine: "men", attributeEvidence: { boardLine: {
          state: "known", provenance: "merchant", method: "normalized",
          sourceField: "card-info__block[block1].table.Пол",
        } } },
      });
    });

    it.each([
      { brand: "Wrong" }, { modelName: "Wrong" },
      { audience: [] }, { audience: [""] }, { audience: ["для женщин"] },
      { audience: ["для детей"] }, { audience: ["для мужчин", "для женщин"] },
    ])("fails closed for identity/audience drift %j", async patch => {
      const result = await importStructuredPage({ ...identity, audience: ["унисекс"], ...patch });
      expect(result.products).toEqual([]);
      expect(result.diagnostics.failuresByCategory.source_metadata_conflict).toBe(1);
    });
  });
});

describe("Trial Sport source diagnostics", () => {
  it("matches Trial specification groups only across compatible protected variants", () => {
    expect(
      resolveTrialSpecGroupMatch(makeSpecMap("Example Wide"), "Example Wide"),
    ).toMatchObject({ matchKind: "exact", matchedModelName: "Example Wide" });
    expect(
      resolveTrialSpecGroupMatch(makeSpecMap("Example"), "Example Wide"),
    ).toMatchObject({ matchKind: "none", group: null });
    expect(
      resolveTrialSpecGroupMatch(makeSpecMap("Example Wide"), "Example"),
    ).toMatchObject({ matchKind: "none", group: null });
    expect(
      resolveTrialSpecGroupMatch(makeSpecMap("Example Board"), "Example"),
    ).toMatchObject({ matchKind: "safe-partial", matchedModelName: "Example Board" });
    expect(
      resolveTrialSpecGroupMatch(
        makeSpecMap("Example Board", "Example Series"),
        "Example",
      ),
    ).toMatchObject({ matchKind: "ambiguous", group: null, candidateCount: 2 });
  });

  it.each([
    "Example Mid Wide",
    "Example Women",
    "Example WMNS",
    "Example Kids",
    "Example Pro",
    "Example Plus",
    "Example Limited",
    "Example LTD",
    "Example Carbon",
    "Example Raw",
    "Example Split",
  ])("does not cross a protected Trial variant boundary for %s", (modelName) => {
    expect(resolveTrialSpecGroupMatch(makeSpecMap("Example"), modelName)).toMatchObject({
      matchKind: "none",
      group: null,
    });
    expect(resolveTrialSpecGroupMatch(makeSpecMap(modelName), "Example")).toMatchObject({
      matchKind: "none",
      group: null,
    });
  });

  it("does not treat a plus separator inside a youth package as a Plus variant", () => {
    expect(
      resolveTrialSpecGroupMatch(
        makeSpecMap("Ripper Kids"),
        "Ripper Kids + Charger Mini White",
      ),
    ).toMatchObject({
      matchKind: "safe-partial",
      matchedModelName: "Ripper Kids",
    });
  });

  it("guards the Nitro Team Wide geometry correction by source identity", () => {
    expect(
      resolveTrialSportSizeMetadataCorrection("3132335", {
        brand: "Nitro",
        modelName: "Team Wide",
      }),
    ).toMatchObject({ status: "resolved", correction: { expectedBrand: "Nitro" } });
    expect(
      resolveTrialSportSizeMetadataCorrection("3132335", {
        brand: "Other",
        modelName: "Team Wide",
      }),
    ).toMatchObject({ status: "conflict", category: "source_metadata_conflict" });
    expect(
      resolveTrialSportSizeMetadataCorrection("3132335", {
        brand: "Nitro",
        modelName: "Team",
      }),
    ).toMatchObject({ status: "conflict", category: "source_metadata_conflict" });
    expect(
      resolveTrialSportSizeMetadataCorrection("3132334", {
        brand: "Nitro",
        modelName: "Team Wide",
      }),
    ).toEqual({ status: "resolved", correction: null });
  });

  it("uses guarded authoritative geometry only for discovered Nitro Team Wide sizes", async () => {
    const result = await importTrialSportProducts({
      fetchText: createFetchText({
        listingIds: ["3132335"],
        productPageTransform: () =>
          buildProductPage({
            brand: "Nitro",
            entries: [makeTrialEntry(157, true), makeTrialEntry(165, false)],
            id: "3132335",
            audience: ["унисекс"],
            modelName: "Team Wide",
          }),
      }),
      fetchArrayBuffer: vi.fn(async () =>
        buildSpecWorkbook({
          modelName: "Team",
          sizes: [
            { sizeLabel: "157", waistWidthCm: "25.2" },
            { sizeLabel: "159", waistWidthCm: "25.4" },
            { sizeLabel: "162", waistWidthCm: "25.6" },
          ],
        }),
      ),
      checkedAt: "2026-08-20",
      logger: silentLogger,
    });

    expect(result.diagnostics).toMatchObject({
      resolvedCount: 1,
      staleSafe: true,
      unsafeFailureCount: 0,
    });
    expect(result.products[0]).toMatchObject({
      modelName: "Team Wide",
      sizes: [
        {
          sizeCm: 157,
          sizeLabel: "157",
          waistWidthMm: 264,
          widthType: "wide",
          isAvailable: true,
        },
        {
          sizeCm: 165,
          sizeLabel: "165",
          waistWidthMm: 272,
          widthType: "wide",
          isAvailable: false,
        },
      ],
      importMeta: {
        sourceProductId: "3132335",
        trialSpecMatchKind: "none",
        trialSpecMatchedModelName: null,
        trialSizeMetadataCorrectionApplied: true,
        variantMarker: "wide",
      },
    });
    expect(result.products[0].sizes.map((size) => size.sizeCm)).toEqual([157, 165]);
  });

  it("keeps regular Nitro Team workbook geometry unchanged", async () => {
    const result = await importTrialSportProducts({
      fetchText: createFetchText({
        listingIds: ["3131513"],
        productPageTransform: () =>
          buildProductPage({
            brand: "Nitro",
            entries: [
              makeTrialEntry(157, false),
              makeTrialEntry(159, true),
              makeTrialEntry(162, false),
            ],
            id: "3131513",
            audience: ["унисекс"],
            modelName: "Team",
          }),
      }),
      fetchArrayBuffer: vi.fn(async () =>
        buildSpecWorkbook({
          modelName: "Team",
          sizes: [
            { sizeLabel: "157", waistWidthCm: "25.2" },
            { sizeLabel: "159", waistWidthCm: "25.4" },
            { sizeLabel: "162", waistWidthCm: "25.6" },
          ],
        }),
      ),
      checkedAt: "2026-08-20",
      logger: silentLogger,
    });

    expect(result.products[0].sizes.map(({ sizeCm, waistWidthMm }) => ({
      sizeCm,
      waistWidthMm,
    }))).toEqual([
      { sizeCm: 157, waistWidthMm: 252 },
      { sizeCm: 159, waistWidthMm: 254 },
      { sizeCm: 162, waistWidthMm: 256 },
    ]);
    expect(result.products[0].importMeta).toMatchObject({
      sourceProductId: "3131513",
      trialSpecMatchKind: "exact",
      trialSizeMetadataCorrectionApplied: false,
    });
    expect(result.products[0].sizes.every((size) => size.truthV2.waistWidthMm === size.waistWidthMm)).toBe(true);
  });

  it("does not promote nearest or generic legacy waist estimates into truth-v2", async () => {
    const result = await importTrialSportProducts({
      fetchText: createFetchText({
        productPageTransform: () => buildProductPage({ entries: [makeTrialEntry(159, true)] }),
      }),
      fetchArrayBuffer: vi.fn(async () => buildSpecWorkbook({
        sizes: [{ sizeLabel: "156", waistWidthCm: "25.0" }],
      })),
      checkedAt: "2026-08-20",
      logger: silentLogger,
    });

    expect(result.products[0].sizes[0]).toMatchObject({
      sizeCm: 159,
      waistWidthMm: 250,
      truthV2: { waistWidthMm: null, widthType: null },
    });
  });

  it("adds decimal and multi-style truth without changing legacy normalization", async () => {
    const result = await importTrialSportProducts({
      fetchText: createFetchText(),
      fetchArrayBuffer: vi.fn(async () => buildSpecWorkbook({
        purpose: "All Mountain / Freestyle",
        flex: "7.6",
      })),
      checkedAt: "2026-08-20",
      logger: silentLogger,
    });
    expect(result.products[0]).toMatchObject({
      ridingStyle: "all-mountain",
      flex: 8,
      skillLevel: "advanced",
      truthV2: {
        ridingStyles: ["all-mountain", "park"],
        flex: 7.6,
        skillApplicability: null,
      },
    });
  });

  it.each([
    ["женская команда бренда", "unisex"],
    ["мужской стиль катания", "unisex"],
    ["подходит мужчинам и женщинам", "unisex"],
  ])(
    "does not promote Trial marketing prose %j into board-line truth",
    async (description, legacyBoardLine) => {
      const result = await importTrialSportProducts({
        fetchText: createFetchText({
          productPageTransform: () => buildProductPage({ description }),
        }),
        fetchArrayBuffer: vi.fn(async () => buildSpecWorkbook()),
        checkedAt: "2026-08-20",
        logger: silentLogger,
      });

      expect(result.products[0]).toMatchObject({
        boardLine: legacyBoardLine,
        importMeta: { boardLineEvidence: "missing" },
        truthV2: {
          boardLine: null,
          attributeEvidence: {
            boardLine: {
              state: "unknown",
              provenance: "merchant",
              method: null,
              sourceField: "card-info__block[block1].table.Пол",
            },
          },
        },
      });
      expect(result.products[0].truthV2.attributeEvidence.boardLine).not.toHaveProperty("reason");
    },
  );

  it("preserves direct merchant provenance when structured audience already matches", async () => {
    const result = await importTrialSportProducts({
      fetchText: createFetchText({
        listingIds: ["3131268"],
        productPageTransform: () =>
          buildProductPage({
            brand: "Bataleon",
            description: "мужская модель",
            id: "3131268",
            audience: ["для мужчин"],
            modelName: "Evil Twin",
          }),
      }),
      fetchArrayBuffer: vi.fn(async () =>
        buildSpecWorkbook({ modelName: "Evil Twin" })),
      checkedAt: "2026-08-20",
      logger: silentLogger,
    });

    expect(result.products[0]).toMatchObject({
      boardLine: "men",
      importMeta: {
        boardLineEvidence: "known",
        sourceMetadataCorrectionApplied: false,
      },
      truthV2: {
        boardLine: "men",
        attributeEvidence: {
          boardLine: {
            state: "known",
            provenance: "merchant",
            method: "normalized",
            sourceField: "card-info__block[block1].table.Пол",
          },
        },
      },
    });
  });

  it("normalizes merchant winter-season evidence without changing default year parsing", () => {
    expect(parseSeasonLabel("Nidecker Escape FW26", { asWinterSeason: true })).toBe(
      "2025/2026",
    );
    expect(parseSeasonLabel("Nidecker Escape FW22", { asWinterSeason: true })).toBe(
      "2021/2022",
    );
    expect(parseSeasonLabel("Nitro Team 2026", { asWinterSeason: true })).toBe(
      "2025/2026",
    );
    expect(parseSeasonLabel("Nitro Team 2026")).toBe("2026");
  });

  it("applies reviewed Trial board-line evidence and fails closed on source drift", () => {
    expect(
      resolveTrialSportBoardLineMetadata("3131268", "унисекс", {
        brand: "BATALEON",
        modelName: "EVIL TWIN",
      }),
    ).toMatchObject({
      status: "resolved",
      boardLine: "men",
      evidence: "known",
      correctionApplied: true,
    });
    expect(
      resolveTrialSportBoardLineMetadata("3131268", "для женщин", {
        brand: "Bataleon",
        modelName: "Evil Twin",
      }),
    ).toMatchObject({ status: "conflict", category: "source_metadata_conflict" });
    expect(
      resolveTrialSportBoardLineMetadata("3131268", "унисекс", {
        brand: "Other",
        modelName: "Evil Twin",
      }),
    ).toMatchObject({ status: "conflict", category: "source_metadata_conflict" });
  });

  it("applies the exact Nitro Team corrections and fails closed for Team Wide identity drift", () => {
    expect(
      resolveTrialSportBoardLineMetadata("3131513", "унисекс", {
        brand: "NITRO",
        modelName: "TEAM",
      }),
    ).toMatchObject({
      status: "resolved",
      boardLine: "men",
      evidence: "known",
      correctionApplied: true,
    });
    expect(
      resolveTrialSportBoardLineMetadata("3132335", "унисекс", {
        brand: "NITRO",
        modelName: "TEAM WIDE",
      }),
    ).toMatchObject({
      status: "resolved",
      boardLine: "men",
      evidence: "known",
      correctionApplied: true,
    });

    for (const identity of [
      { brand: "Other", modelName: "Team Wide" },
      { brand: "Nitro", modelName: "Team" },
    ]) {
      expect(
        resolveTrialSportBoardLineMetadata("3132335", "унисекс", identity),
      ).toMatchObject({
        status: "conflict",
        category: "source_metadata_conflict",
        correctionApplied: false,
      });
    }

    expect(
      resolveTrialSportBoardLineMetadata("3132334", "", {
        brand: "Nitro",
        modelName: "Team Wide",
      }),
    ).toMatchObject({
      status: "resolved",
      correctionApplied: false,
    });
    expect(
      resolveTrialSportBoardLineMetadata("3132335", "для женщин", {
        brand: "Nitro",
        modelName: "Team Wide",
      }),
    ).toMatchObject({
      status: "conflict",
      category: "source_metadata_conflict",
      correctionApplied: false,
    });
  });

  it("attaches trusted line evidence to an exact reviewed Trial Product", async () => {
    const result = await importTrialSportProducts({
      fetchText: createFetchText({
        listingIds: ["3131268"],
        audience: ["унисекс"],
        productPageTransform: (page) =>
          page.replaceAll("TEST", "Bataleon").replace("Model", "Evil Twin"),
      }),
      fetchArrayBuffer: vi.fn(async () =>
        buildSpecWorkbook({ modelName: "Evil Twin" }),
      ),
      checkedAt: "2026-08-14",
      logger: silentLogger,
    });

    expect(result.diagnostics.staleSafe).toBe(true);
    expect(result.products).toHaveLength(1);
    expect(result.products[0]).toMatchObject({
      boardLine: "men",
      importMeta: {
        boardLineEvidence: "known",
        sourceMetadataCorrectionApplied: true,
      },
    });
  });

  it("attaches trusted men evidence to the exact Nitro Team Wide source Product", async () => {
    const result = await importTrialSportProducts({
      fetchText: createFetchText({
        listingIds: ["3132335"],
        audience: ["унисекс"],
        productPageTransform: (page) =>
          page.replaceAll("TEST", "Nitro").replace("Model", "Team Wide"),
      }),
      fetchArrayBuffer: vi.fn(async () =>
        buildSpecWorkbook({ modelName: "Team Wide" }),
      ),
      checkedAt: "2026-08-20",
      logger: silentLogger,
    });

    expect(result.diagnostics.staleSafe).toBe(true);
    expect(result.products).toHaveLength(1);
    expect(result.products[0]).toMatchObject({
      boardLine: "men",
      importMeta: {
        sourceProductId: "3132335",
        boardLineEvidence: "known",
        sourceMetadataCorrectionApplied: true,
      },
    });
  });

  it("marks a fully resolved snapshot complete", async () => {
    const result = await importTrialSportProducts({
      fetchText: createFetchText(),
      fetchArrayBuffer: vi.fn(async (url) => {
        expect(url).toBe(specUrl);
        return buildSpecWorkbook();
      }),
      checkedAt: "2026-08-12",
      logger: silentLogger,
    });

    expect(result.products).toHaveLength(1);
    expect(result.products[0]).toMatchObject({
      ridingStyle: "all-mountain",
      skillLevel: "intermediate",
      flex: 5,
      boardLine: "unisex",
      truthV2: {
        ridingStyles: ["all-mountain"],
        skillApplicability: null,
        flex: 5,
        boardLine: null,
        shapeType: "directional",
      },
    });
    expect(result.sourceObservations).toEqual([]);
    expect(result.diagnostics).toMatchObject({
      discoveredCount: 1,
      attemptedCount: 1,
      resolvedCount: 1,
      unavailableCount: 0,
      skippedCount: 0,
      failedCount: 0,
      safeUnimportableCount: 0,
      unsafeFailureCount: 0,
      limited: false,
      importComplete: true,
      staleSafe: true,
      complete: true,
    });
  });

  it("records a product transport failure structurally", async () => {
    const result = await importTrialSportProducts({
      fetchText: createFetchText({ productFailure: true }),
      fetchArrayBuffer: vi.fn(),
      checkedAt: "2026-08-12",
      logger: silentLogger,
    });

    expect(result.diagnostics.complete).toBe(false);
    expect(result.diagnostics.importComplete).toBe(false);
    expect(result.diagnostics.staleSafe).toBe(false);
    expect(result.diagnostics.failedCount).toBe(1);
    expect(
      result.diagnostics.failuresByCategory[
        TRIAL_SPORT_FAILURE_CATEGORIES.productFetch
      ],
    ).toBe(1);
  });

  it("records a spec retrieval failure structurally", async () => {
    const result = await importTrialSportProducts({
      fetchText: createFetchText(),
      fetchArrayBuffer: vi.fn(async () => {
        throw new Error("HTTP 503");
      }),
      checkedAt: "2026-08-12",
      logger: silentLogger,
    });

    expect(result.diagnostics.complete).toBe(false);
    expect(result.diagnostics.staleSafe).toBe(false);
    expect(
      result.diagnostics.failuresByCategory[
        TRIAL_SPORT_FAILURE_CATEGORIES.specFetch
      ],
    ).toBe(1);
  });

  it("does not treat malformed availability as unavailable", async () => {
    const result = await importTrialSportProducts({
      fetchText: createFetchText({ availability: "malformed" }),
      fetchArrayBuffer: vi.fn(),
      checkedAt: "2026-08-12",
      logger: silentLogger,
    });

    expect(result.diagnostics.unavailableCount).toBe(0);
    expect(result.diagnostics.complete).toBe(false);
    expect(result.diagnostics.staleSafe).toBe(false);
    expect(
      result.diagnostics.failuresByCategory[
        TRIAL_SPORT_FAILURE_CATEGORIES.availabilityParse
      ],
    ).toBe(1);
  });

  it("treats valid zero availability as complete source evidence", async () => {
    const result = await importTrialSportProducts({
      fetchText: createFetchText({ availability: "unavailable" }),
      fetchArrayBuffer: vi.fn(),
      checkedAt: "2026-08-12",
      logger: silentLogger,
    });

    expect(result.products).toHaveLength(0);
    expect(result.diagnostics).toMatchObject({
      unavailableCount: 1,
      failedCount: 0,
      importComplete: true,
      staleSafe: true,
      complete: true,
    });
  });

  it("marks an intentionally limited snapshot incomplete", async () => {
    const result = await importTrialSportProducts({
      fetchText: createFetchText({ listingIds: ["1001", "1002"] }),
      fetchArrayBuffer: vi.fn(async () => buildSpecWorkbook()),
      checkedAt: "2026-08-12",
      limit: 1,
      logger: silentLogger,
    });

    expect(result.diagnostics).toMatchObject({
      discoveredCount: 2,
      attemptedCount: 1,
      limited: true,
      importComplete: false,
      staleSafe: false,
      complete: false,
    });
  });

  it("observes a live Product with no spec link without emitting a Product", async () => {
    const result = await importTrialSportProducts({
      fetchText: createFetchText({
        productPageTransform: (page) =>
          page.replace('<a href="/svdownload.php?svid=7">Specs</a>', ""),
      }),
      fetchArrayBuffer: vi.fn(),
      checkedAt: "2026-08-12",
      logger: silentLogger,
    });

    expect(result.products).toEqual([]);
    expect(result.sourceObservations).toEqual([
      {
        storeCode: "trial-sport",
        sourceProductId: "1001",
        availability: "available",
        status: "safe_unimportable",
        reason: "spec_missing",
      },
    ]);
    expect(result.diagnostics).toMatchObject({
      failedCount: 1,
      safeUnimportableCount: 1,
      unsafeFailureCount: 0,
      safeUnimportableByReason: { specMissing: 1, specGroupMissing: 0 },
      importComplete: false,
      staleSafe: true,
      complete: false,
    });
  });

  it("does not mark missing-spec evidence safe without a parsed Product identity", async () => {
    const result = await importTrialSportProducts({
      fetchText: createFetchText({
        productPageTransform: (page) =>
          page
            .replace('<a href="/svdownload.php?svid=7">Specs</a>', "")
            .replace(
              '<a href="/gds.php?brand=test"><span>TEST</span></a>',
              "",
            ),
      }),
      fetchArrayBuffer: vi.fn(),
      checkedAt: "2026-08-12",
      logger: silentLogger,
    });

    expect(result.sourceObservations).toEqual([]);
    expect(result.diagnostics).toMatchObject({
      safeUnimportableCount: 0,
      unsafeFailureCount: 1,
      importComplete: false,
      staleSafe: false,
    });
  });

  it("observes a live Product missing from a valid workbook group", async () => {
    const result = await importTrialSportProducts({
      fetchText: createFetchText(),
      fetchArrayBuffer: vi.fn(async () =>
        buildSpecWorkbook({ modelName: "Alpha" }),
      ),
      checkedAt: "2026-08-12",
      logger: silentLogger,
    });

    expect(result.products).toEqual([]);
    expect(result.sourceObservations[0]).toMatchObject({
      sourceProductId: "1001",
      reason: "spec_group_missing",
    });
    expect(result.diagnostics).toMatchObject({
      safeUnimportableCount: 1,
      unsafeFailureCount: 0,
      safeUnimportableByReason: { specMissing: 0, specGroupMissing: 1 },
      importComplete: false,
      staleSafe: true,
    });

    const identityPlan = buildSourceIdentityPlan({
      importedProducts: result.products,
      existingProducts: new Map(),
      officialSpecs: new Map(),
    });
    expect(identityPlan.resolvedProducts).toEqual([]);
  });

  it("keeps malformed workbooks and unknown Product parsing stale-unsafe", async () => {
    const specParseResult = await importTrialSportProducts({
      fetchText: createFetchText(),
      fetchArrayBuffer: vi.fn(async () => Buffer.from("not-a-workbook")),
      checkedAt: "2026-08-12",
      logger: silentLogger,
    });
    expect(specParseResult.diagnostics.staleSafe).toBe(false);
    expect(
      specParseResult.diagnostics.failuresByCategory[
        TRIAL_SPORT_FAILURE_CATEGORIES.specParse
      ],
    ).toBe(1);

    const productParseResult = await importTrialSportProducts({
      fetchText: createFetchText({
        productPageTransform: (page) =>
          page.replace(
            '<a href="/gds.php?brand=test"><span>TEST</span></a>',
            "",
          ),
      }),
      fetchArrayBuffer: vi.fn(async () => buildSpecWorkbook()),
      checkedAt: "2026-08-12",
      logger: silentLogger,
    });
    expect(productParseResult.sourceObservations).toEqual([]);
    expect(productParseResult.diagnostics.staleSafe).toBe(false);
    expect(
      productParseResult.diagnostics.failuresByCategory[
        TRIAL_SPORT_FAILURE_CATEGORIES.productParse
      ],
    ).toBe(1);
  });

  it("emits discovery, periodic and reconciled final progress", async () => {
    const progress = [];
    const result = await importTrialSportProducts({
      fetchText: createFetchText({ listingIds: ["1001", "1002"] }),
      fetchArrayBuffer: vi.fn(async () => buildSpecWorkbook()),
      checkedAt: "2026-08-12",
      logger: silentLogger,
      progressInterval: 1,
      onProgress: (snapshot) => progress.push(snapshot),
    });

    expect(progress[0]).toMatchObject({ phase: "discovery", discoveredCount: 2, processedCount: 0 });
    expect(progress.some((snapshot) => snapshot.phase === "processing" && snapshot.remainingCount === 2)).toBe(true);
    expect(progress.some((snapshot) => snapshot.phase === "processing")).toBe(true);
    expect(progress.at(-1)).toMatchObject({
      phase: "complete",
      discoveredCount: result.diagnostics.discoveredCount,
      attemptedCount: result.diagnostics.attemptedCount,
      processedCount: result.diagnostics.attemptedCount,
      resolvedCount: result.diagnostics.resolvedCount,
      unavailableCount: result.diagnostics.unavailableCount,
      failedCount: result.diagnostics.failedCount,
      safeUnimportableCount: result.diagnostics.safeUnimportableCount,
      unsafeFailureCount: result.diagnostics.unsafeFailureCount,
      safeUnimportableByReason: result.diagnostics.safeUnimportableByReason,
      skippedCount: result.diagnostics.skippedCount,
      remainingCount: 0,
      failuresByCategory: result.diagnostics.failuresByCategory,
      limited: result.diagnostics.limited,
      importComplete: result.diagnostics.importComplete,
      staleSafe: result.diagnostics.staleSafe,
      complete: result.diagnostics.complete,
    });
  });

  it("classifies timed-out Product and spec requests structurally", async () => {
    const productFetch = createFetchText();
    productFetch.mockImplementationOnce(async () => buildListing("1001"));
    productFetch.mockImplementationOnce(async () => { throw new CatalogHttpTimeoutError(); });
    const productResult = await importTrialSportProducts({ fetchText: productFetch, fetchArrayBuffer: vi.fn(), checkedAt: "2026-08-12", logger: silentLogger });
    expect(productResult.diagnostics.failuresByCategory[TRIAL_SPORT_FAILURE_CATEGORIES.productFetch]).toBe(1);

    const specResult = await importTrialSportProducts({
      fetchText: createFetchText(),
      fetchArrayBuffer: vi.fn(async () => { throw new CatalogHttpTimeoutError(); }),
      checkedAt: "2026-08-12",
      logger: silentLogger,
    });
    expect(specResult.diagnostics.failuresByCategory[TRIAL_SPORT_FAILURE_CATEGORIES.specFetch]).toBe(1);
  });
});

describe("Trial Sport stale candidate revalidation", () => {
  it("distinguishes live, unavailable, not-found and unknown outcomes", async () => {
    const products = ["live", "unavailable", "not-found", "gone", "unknown"].map(
      (slug, index) => ({
        slug,
        affiliateUrl: `https://trial-sport.ru/goods/51526/${2000 + index}.html`,
      }),
    );
    const fetchText = vi.fn(async (url) => {
      if (url.includes("2000")) return buildProductPage({ availability: "available" });
      if (url.includes("2001")) return buildProductPage({ availability: "unavailable" });
      if (url.includes("2002")) throw new Error("HTTP 404");
      if (url.includes("2003")) throw new Error("HTTP 410");
      return buildProductPage({ availability: "malformed" });
    });

    const result = await revalidateTrialSportProducts({ products, fetchText });

    expect(result.outcomes).toEqual([
      { slug: "gone", status: "unavailable" },
      { slug: "live", status: "available" },
      { slug: "not-found", status: "unavailable" },
      { slug: "unavailable", status: "unavailable" },
      { slug: "unknown", status: "unknown" },
    ]);
    expect(result.diagnostics).toMatchObject({
      checkedCount: 5,
      availableCount: 1,
      unavailableCount: 3,
      unknownCount: 1,
      complete: false,
    });
  });
});

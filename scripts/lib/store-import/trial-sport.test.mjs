import { strToU8, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import {
  importTrialSportProducts,
  revalidateTrialSportProducts,
  TRIAL_SPORT_FAILURE_CATEGORIES,
} from "./trial-sport.mjs";
import { CatalogHttpTimeoutError } from "./catalog-http.mjs";

const sectionUrl =
  "https://trial-sport.ru/gds.php?s=51526&c1=1070639&c2=1078224&gpp=100";
const productUrl = "https://trial-sport.ru/goods/51526/1001.html";
const secondProductUrl = "https://trial-sport.ru/goods/51526/1002.html";
const specUrl = "https://trial-sport.ru/svdownload.php?svid=7";

function buildListing(...ids) {
  return ids
    .map(
      (id) =>
        `<div class="available"><a href="/goods/51526/${id}.html">Product</a></div>`,
    )
    .join("");
}

function buildProductPage({ availability = "available", id = "1001" } = {}) {
  const availabilityScript =
    availability === "malformed"
      ? "<script>const icspJS = notJson;</script>"
      : `<script>const icspJS = ${JSON.stringify([
          {
            size: "156",
            nalim: availability === "available",
            stores: [],
            im_cols_avail: availability === "available" ? 1 : 0,
            im_cols_reserved: 0,
          },
        ])};</script>`;

  return `
    <a href="/gds.php?brand=test"><span>TEST</span></a>
    <h1>Сноуборд TEST Model 2025</h1>
    ${availabilityScript}
    <a href="/svdownload.php?svid=7">Specs</a>
    <script>window.productId = ${id};</script>
  `;
}

function buildSpecWorkbook() {
  const sheet = `
    <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <sheetData>
        <row r="1"><c r="A1"><v>Header</v></c></row>
        <row r="2">
          <c r="A2"><v>Model</v></c>
          <c r="B2"><v>Directional</v></c>
          <c r="C2"><v>All Mountain</v></c>
          <c r="K2"><v>5</v></c>
        </row>
        <row r="3">
          <c r="D3"><v>156</v></c>
          <c r="H3"><v>25.0</v></c>
        </row>
      </sheetData>
    </worksheet>
  `;

  return Buffer.from(
    zipSync({
      "xl/worksheets/sheet1.xml": strToU8(sheet),
    }),
  );
}

function createFetchText({
  listingIds = ["1001"],
  productFailure = false,
  availability = "available",
} = {}) {
  return vi.fn(async (url) => {
    if (url === sectionUrl) {
      return buildListing(...listingIds);
    }

    if (url === productUrl || url === secondProductUrl) {
      if (productFailure && url === productUrl) {
        throw new Error("HTTP 503");
      }

      return buildProductPage({
        availability,
        id: url === productUrl ? "1001" : "1002",
      });
    }

    throw new Error(`Unexpected test URL: ${url}`);
  });
}

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe("Trial Sport source diagnostics", () => {
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
    expect(result.diagnostics).toMatchObject({
      discoveredCount: 1,
      attemptedCount: 1,
      resolvedCount: 1,
      unavailableCount: 0,
      skippedCount: 0,
      failedCount: 0,
      limited: false,
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
      complete: false,
    });
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
      skippedCount: result.diagnostics.skippedCount,
      remainingCount: 0,
      failuresByCategory: result.diagnostics.failuresByCategory,
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

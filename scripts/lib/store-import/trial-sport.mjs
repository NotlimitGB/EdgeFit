import { strFromU8, unzipSync } from "fflate";
import {
  buildDescriptions,
  buildNotIdealFor,
  buildScenarios,
  classifyWidthType,
  decodeHtml,
  isPlausibleWaistWidthMm,
  mapRidingStyle,
  mapShapeType,
  mapSkillLevel,
  normalizeBoardKey,
  normalizeSizeKey,
  normalizeWaistWidthMm,
  normalizeWhitespace,
  parseFlexNumber,
  parseSeasonLabel,
  parseSizeCm,
  slugifyBoard,
  stripHtml,
  toAbsoluteUrl,
} from "./common.mjs";
import {
  getBoardLineEvidence,
  getExplicitVariantMarker,
  getStoreIdentityFromUrl,
} from "./source-identity.mjs";

const TRIAL_BASE_URL = "https://trial-sport.ru";
const TRIAL_SECTION_URL =
  `${TRIAL_BASE_URL}/gds.php?s=51526&c1=1070639&c2=1078224&gpp=100`;

export const TRIAL_SPORT_SOURCE_METADATA_CORRECTIONS = Object.freeze({
  "3131268": Object.freeze({
    expectedBrand: "Bataleon",
    expectedModel: "Evil Twin",
    correctedBoardLine: "men",
    reason: "Verified Bataleon Evil Twin 2025/2026 men identity.",
  }),
  "3131513": Object.freeze({
    expectedBrand: "Nitro",
    expectedModel: "Team",
    correctedBoardLine: "men",
    reason: "Verified Nitro Team 2025/2026 men identity.",
  }),
  "3132335": Object.freeze({
    expectedBrand: "Nitro",
    expectedModel: "Team Wide",
    correctedBoardLine: "men",
    reason: "Verified Nitro Team Wide 2025/2026 men identity.",
  }),
  "3137774": Object.freeze({
    expectedBrand: "Ride",
    expectedModel: "Warpig",
    correctedBoardLine: "men",
    reason: "Verified RIDE Warpig 2025/2026 men identity.",
  }),
});

export function resolveTrialSportBoardLineMetadata(
  sourceProductId,
  descriptionText,
  { brand, modelName } = {},
) {
  const raw = getBoardLineEvidence(descriptionText);
  const correction =
    TRIAL_SPORT_SOURCE_METADATA_CORRECTIONS[String(sourceProductId ?? "")] ??
    null;

  if (!correction) {
    return {
      status: "resolved",
      boardLine: raw.boardLine,
      evidence: raw.evidence,
      correctionApplied: false,
      reason: null,
    };
  }

  if (
    normalizeBoardKey(brand) !== normalizeBoardKey(correction.expectedBrand) ||
    normalizeBoardKey(modelName) !== normalizeBoardKey(correction.expectedModel)
  ) {
    return {
      status: "conflict",
      category: "source_metadata_conflict",
      correctionApplied: false,
      reason: correction.reason,
    };
  }

  if (raw.evidence === "known" && raw.boardLine !== correction.correctedBoardLine) {
    return {
      status: "conflict",
      category: "source_metadata_conflict",
      correctionApplied: false,
      reason: correction.reason,
    };
  }

  return {
    status: "resolved",
    boardLine: correction.correctedBoardLine,
    evidence: "known",
    correctionApplied: raw.evidence !== "known",
    reason: correction.reason,
  };
}

function isReliableTrialSize(sizeCm, waistWidthMm) {
  return isPlausibleWaistWidthMm(sizeCm, waistWidthMm);
}

function isWideTrialModel(modelName) {
  return /\bwide\b|\bw\b/iu.test(String(modelName ?? ""));
}

function isMidWideTrialModel(modelName) {
  return /mid[-\s]?wide/iu.test(String(modelName ?? ""));
}

function isKidsTrialModel(modelName) {
  return /kids?|junior|mini|youth|yuniorsk|yunior/iu.test(String(modelName ?? ""));
}

function isReliableTrialPageSize(sizeCm, modelName) {
  if (!Number.isFinite(sizeCm)) {
    return false;
  }

  if (sizeCm >= 100) {
    return true;
  }

  return isKidsTrialModel(modelName) && sizeCm >= 70;
}

function estimateTrialWaistWidthMm(sizeCm, specSizes, modelName) {
  const exactSpecSize = specSizes.find((size) => size.sizeCm === sizeCm);
  if (exactSpecSize?.waistWidthMm) {
    return exactSpecSize.waistWidthMm;
  }

  const closestSpecSize = specSizes
    .filter((size) => Number.isFinite(size.sizeCm) && Number.isFinite(size.waistWidthMm))
    .sort(
      (left, right) =>
        Math.abs(left.sizeCm - sizeCm) - Math.abs(right.sizeCm - sizeCm),
    )[0];

  if (isWideTrialModel(modelName)) {
    return Math.max(264, closestSpecSize?.waistWidthMm ?? 264);
  }

  if (isMidWideTrialModel(modelName)) {
    return Math.max(257, closestSpecSize?.waistWidthMm ?? 257);
  }

  return closestSpecSize?.waistWidthMm ?? 250;
}

function decodeXml(value) {
  return String(value ?? "")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&apos;/giu, "'")
    .replace(/&amp;/giu, "&");
}

function parseSharedStrings(sharedStringsXml) {
  return Array.from(
    sharedStringsXml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/giu),
    (match) =>
      decodeXml(
        Array.from(match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/giu), (textMatch) =>
          textMatch[1],
        ).join(""),
      ),
  );
}

function parseWorksheetRows(sheetXml, sharedStrings) {
  return Array.from(
    sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/giu),
    (rowMatch) => {
      const row = {};

      for (const cellMatch of rowMatch[1].matchAll(
        /<c[^>]*r="([A-Z]+)\d+"(?:[^>]*t="([^"]+)")?[^>]*>([\s\S]*?)<\/c>/giu,
      )) {
        const column = cellMatch[1];
        const type = cellMatch[2] ?? "";
        const cellBody = cellMatch[3];
        const valueMatch = cellBody.match(/<v[^>]*>([\s\S]*?)<\/v>/iu);
        const rawValue = valueMatch ? decodeXml(valueMatch[1]) : "";

        row[column] =
          type === "s" && rawValue !== ""
            ? sharedStrings[Number.parseInt(rawValue, 10)] ?? ""
            : rawValue;
      }

      return row;
    },
  );
}

function buildTrialSpecMap(workbookBytes) {
  const zip = unzipSync(new Uint8Array(workbookBytes));
  const sharedStringsXml = zip["xl/sharedStrings.xml"]
    ? strFromU8(zip["xl/sharedStrings.xml"])
    : "";
  const sheetXml = zip["xl/worksheets/sheet1.xml"]
    ? strFromU8(zip["xl/worksheets/sheet1.xml"])
    : "";

  if (!sheetXml) {
    return new Map();
  }

  const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];
  const rows = parseWorksheetRows(sheetXml, sharedStrings);
  const specMap = new Map();
  let currentGroup = null;

  for (const row of rows.slice(1)) {
    const modelName = normalizeWhitespace(row.A);
    const shape = normalizeWhitespace(row.B);
    const purpose = normalizeWhitespace(row.C);

    if (modelName && (shape || purpose || normalizeWhitespace(row.K))) {
      currentGroup = {
        modelName,
        shape,
        purpose,
        flex: parseFlexNumber(row.K),
        sizes: [],
      };

      specMap.set(normalizeBoardKey(currentGroup.modelName), currentGroup);
    }

    const sizeLabel = normalizeWhitespace(row.D || row.A);

    if (
      !currentGroup ||
      !sizeLabel ||
      (sizeLabel === currentGroup.modelName && !normalizeWhitespace(row.D))
    ) {
      continue;
    }

    const sizeCm = parseSizeCm(sizeLabel);
    const waistWidthMm = normalizeWaistWidthMm(row.H);

    if (!isReliableTrialSize(sizeCm, waistWidthMm)) {
      continue;
    }

    currentGroup.sizes.push({
      sizeCm,
      sizeLabel,
      waistWidthMm,
      recommendedWeightMin: 0,
      recommendedWeightMax: null,
      widthType: classifyWidthType(waistWidthMm),
    });
  }

  return specMap;
}

function findTrialSpecGroup(specMap, modelName) {
  const normalizedModel = normalizeBoardKey(modelName);

  if (specMap.has(normalizedModel)) {
    return specMap.get(normalizedModel);
  }

  const entries = Array.from(specMap.entries());
  const partialMatch = entries.find(([key]) =>
    key.includes(normalizedModel) || normalizedModel.includes(key),
  );

  return partialMatch?.[1] ?? null;
}

function extractTrialProductUrls(htmlText) {
  const availableProductUrls = Array.from(
    new Set(
      Array.from(
        htmlText.matchAll(
          /class="available"[\s\S]*?<a href="(\/goods\/51526\/\d+\.html)"/giu,
        ),
        (match) => toAbsoluteUrl(TRIAL_BASE_URL, match[1]),
      ),
    ),
  );

  if (availableProductUrls.length > 0) {
    return availableProductUrls;
  }

  return Array.from(
    new Set(
      Array.from(
        htmlText.matchAll(/\/goods\/51526\/\d+\.html/giu),
        (match) => toAbsoluteUrl(TRIAL_BASE_URL, match[0]),
      ),
    ),
  );
}

function extractTrialPageCount(htmlText) {
  const pages = Array.from(
    htmlText.matchAll(/&pg=(\d+)/giu),
    (match) => Number.parseInt(match[1], 10),
  ).filter(Number.isFinite);

  return pages.length > 0 ? Math.max(...pages) : 1;
}

function extractTrialJsonArrayResult(htmlText, variableName) {
  const pattern = new RegExp(
    `(?:const|let|var)\\s+${variableName}\\s*=\\s*(\\[[\\s\\S]*?\\])\\s*;?\\s*<\\/script>`,
    "u",
  );
  const match = htmlText.match(pattern);
  if (!match) {
    return { ok: false, value: [] };
  }

  try {
    const value = JSON.parse(match[1]);
    return Array.isArray(value)
      ? { ok: true, value }
      : { ok: false, value: [] };
  } catch {
    return { ok: false, value: [] };
  }
}

function extractTrialDescription(htmlText, brand) {
  const productHeading = `Сноуборд ${brand}`;
  const index = htmlText.indexOf(productHeading);
  if (index === -1) {
    return "";
  }

  const snippet = htmlText.slice(index, index + 5000);
  const paragraphMatch = snippet.match(
    new RegExp(
      `Сноуборд\\s+${brand.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}[^-]{0,120}-\\s*([\\s\\S]{120,2200}?)<a href="javascript:void\\(0\\)" onclick="showBrand\\(\\);"`,
      "iu",
    ),
  );

  return paragraphMatch ? stripHtml(paragraphMatch[1]) : "";
}

function extractTrialBrand(htmlText) {
  const matches = Array.from(
    htmlText.matchAll(/<a href="\/gds\.php[^"]*brand=[^"]*"><span>([^<]+)<\/span><\/a>/giu),
    (match) => stripHtml(match[1]),
  );

  return matches.at(-1) ?? "";
}

function extractTrialModelName(htmlText, brand) {
  const h1Match = htmlText.match(/<h1[^>]*>\s*([^<]+)\s*<\/h1>/iu);
  const h1Text = stripHtml(h1Match?.[1] ?? "");
  if (!h1Text) {
    return "";
  }

  return normalizeWhitespace(
    h1Text
      .replace(/^Сноуборд\s+/iu, "")
      .replace(new RegExp(`^${brand}\\s+`, "iu"), "")
      .replace(/\s+20\d{2}(?:\/20\d{2})?$/u, ""),
  );
}

function extractTrialSeasonLabel(htmlText) {
  const h1Match = htmlText.match(/<h1[^>]*>\s*([^<]+)\s*<\/h1>/iu);
  const titleMatch = htmlText.match(/<title>([^<]+)<\/title>/iu);
  return (
    parseSeasonLabel(stripHtml(h1Match?.[1] ?? ""), {
      asWinterSeason: true,
    }) ??
    parseSeasonLabel(stripHtml(titleMatch?.[1] ?? ""), {
      asWinterSeason: true,
    }) ??
    null
  );
}

function extractTrialPrice(htmlText) {
  const jsonMatch = htmlText.match(/"price":\s*(\d+)/u);
  if (jsonMatch) {
    return Number.parseInt(jsonMatch[1], 10);
  }

  const priceMatch = htmlText.match(/<div class="price(?:\s+price_disc)?">([\d&thinsp;\s]+)&#8381;<\/div>/iu);
  if (priceMatch) {
    return Number.parseInt(priceMatch[1].replace(/[^\d]/gu, ""), 10);
  }

  return 0;
}

function extractTrialImageUrls(htmlText) {
  return Array.from(
    new Set(
      Array.from(htmlText.matchAll(/"big":\s*"([^"]+)"/gu), (match) =>
        toAbsoluteUrl(
          TRIAL_BASE_URL,
          decodeHtml(match[1].replace(/\\\//gu, "/")),
        ),
      )
        .map((url) => String(url ?? "").trim())
        .filter(Boolean),
    ),
  );
}

function extractTrialSpecUrl(htmlText) {
  const match = htmlText.match(/\/svdownload\.php\?svid=\d+/u);
  return match ? toAbsoluteUrl(TRIAL_BASE_URL, match[0]) : "";
}

function isTrialEntryAvailable(entry) {
  if (!entry) {
    return false;
  }

  if (entry.nalim === true) {
    return true;
  }

  if (typeof entry.nal === "string" && entry.nal.toLowerCase() === "store") {
    return true;
  }

  if (Number(entry.im_cols_avail ?? 0) - Number(entry.im_cols_reserved ?? 0) > 0) {
    return true;
  }

  if (Array.isArray(entry.stores) && entry.stores.length > 0) {
    return true;
  }

  return false;
}

function buildTrialPageSizes(specGroup, icspEntries, modelName) {
  const availableEntries = icspEntries.filter(isTrialEntryAvailable);
  const normalizedAvailableSizeKeys = new Set(
    availableEntries
      .map((entry) => normalizeWhitespace(entry.size || entry.sizecolor || ""))
      .filter(Boolean)
      .map((sizeLabel) => normalizeSizeKey(sizeLabel)),
  );
  const specSizes = specGroup?.sizes ?? [];
  const specSizeByKey = new Map(
    specSizes.map((size) => [normalizeSizeKey(size.sizeLabel), size]),
  );
  const pageSizeByKey = new Map();

  for (const entry of icspEntries) {
    const sizeLabel = normalizeWhitespace(entry.size || entry.sizecolor || "");
    const sizeCm = parseSizeCm(sizeLabel);

    if (!sizeLabel || !isReliableTrialPageSize(sizeCm, modelName)) {
      continue;
    }

    const key = normalizeSizeKey(sizeLabel);
    const specSize = specSizeByKey.get(key);
    const waistWidthMm =
      specSize?.waistWidthMm ?? estimateTrialWaistWidthMm(sizeCm, specSizes, modelName);

    pageSizeByKey.set(key, {
      ...specSize,
      sizeCm,
      sizeLabel,
      waistWidthMm,
      recommendedWeightMin: specSize?.recommendedWeightMin ?? 0,
      recommendedWeightMax: specSize?.recommendedWeightMax ?? null,
      widthType: classifyWidthType(waistWidthMm),
      isAvailable: normalizedAvailableSizeKeys.has(key),
    });
  }

  return Array.from(pageSizeByKey.values()).sort(
    (left, right) => left.sizeCm - right.sizeCm,
  );
}

function mergeTrialSizes(specGroup, icspEntries, modelName) {
  const pageSizes = buildTrialPageSizes(specGroup, icspEntries, modelName);

  if (pageSizes.length > 0) {
    return pageSizes;
  }

  return (specGroup?.sizes ?? [])
    .map((size) => ({
      ...size,
      isAvailable: true,
    }))
    .sort((left, right) => left.sizeCm - right.sizeCm);
}

function buildTrialProduct(
  productUrl,
  htmlText,
  specMap,
  icspEntries,
  checkedAt,
  specMissing = false,
) {
  const brand = extractTrialBrand(htmlText);
  const modelName = extractTrialModelName(htmlText, brand);
  const sourceProductId = getStoreIdentityFromUrl(productUrl).sourceProductId;

  if (!brand || !modelName || !sourceProductId) {
    return { status: "unsafe_failure", reason: "product_parse_failure" };
  }

  if (specMissing) {
    return {
      status: "safe_unimportable",
      observation: {
        storeCode: "trial-sport",
        sourceProductId,
        availability: "available",
        status: "safe_unimportable",
        reason: "spec_missing",
      },
    };
  }

  const specGroup = findTrialSpecGroup(specMap, modelName);
  if (!specGroup) {
    return {
      status: "safe_unimportable",
      observation: {
        storeCode: "trial-sport",
        sourceProductId,
        availability: "available",
        status: "safe_unimportable",
        reason: "spec_group_missing",
      },
    };
  }

  const availableEntries = icspEntries.filter(isTrialEntryAvailable);
  const sizes = mergeTrialSizes(specGroup, icspEntries, modelName);

  if (sizes.length === 0 || availableEntries.length === 0) {
    return { status: "unsafe_failure", reason: "product_parse_failure" };
  }

  const flex = specGroup.flex || 5;
  const ridingStyle = mapRidingStyle(specGroup.purpose);
  const shapeType = mapShapeType(specGroup.shape);
  const descriptionText = extractTrialDescription(htmlText, brand);
  const imageUrls = extractTrialImageUrls(htmlText);
  const seasonLabel = extractTrialSeasonLabel(htmlText);
  const boardLineIdentity = resolveTrialSportBoardLineMetadata(
    sourceProductId,
    descriptionText,
    { brand, modelName },
  );
  if (boardLineIdentity.status === "conflict") {
    return {
      status: "unsafe_failure",
      category: TRIAL_SPORT_FAILURE_CATEGORIES.sourceMetadataConflict,
      reason: "source_metadata_conflict",
    };
  }
  const boardLine = boardLineIdentity.boardLine;
  const skillLevel = mapSkillLevel({
    levelText: "",
    flex,
  });
  const product = {
    slug: slugifyBoard(`${brand} ${modelName}`),
    brand,
    modelName,
    seasonLabel,
    descriptionShort: "",
    descriptionFull: "",
    ridingStyle,
    skillLevel,
    flex,
    priceFrom: extractTrialPrice(htmlText),
    imageUrl: imageUrls[0] || "",
    galleryImages: imageUrls.slice(1),
    affiliateUrl: productUrl,
    isActive: true,
    boardLine,
    shapeType,
    dataStatus: "draft",
    sourceName: "Триал-Спорт",
    sourceUrl: productUrl,
    sourceCheckedAt: checkedAt,
    scenarios: [],
    notIdealFor: [],
    sizes,
    importMeta: {
      storeCode: "trial-sport",
      sourceProductId,
      baseSlug: slugifyBoard(`${brand} ${modelName}`),
      boardLineEvidence: boardLineIdentity.evidence,
      sourceMetadataCorrectionApplied: boardLineIdentity.correctionApplied,
      variantMarker: getExplicitVariantMarker(modelName),
      storeName: "Триал-Спорт",
    },
  };

  const descriptions = buildDescriptions(product);

  return {
    status: "resolved",
    product: {
      ...product,
      descriptionShort: descriptions.descriptionShort,
      descriptionFull:
        descriptionText && descriptionText.length > 80
          ? normalizeWhitespace(`${descriptions.descriptionFull} ${descriptionText}`)
          : descriptions.descriptionFull,
      scenarios: buildScenarios(product),
      notIdealFor: buildNotIdealFor(product),
    },
  };
}

export const TRIAL_SPORT_FAILURE_CATEGORIES = Object.freeze({
  productFetch: "product_fetch_failure",
  safeUnimportableSpecMissing: "safe_unimportable_spec_missing",
  safeUnimportableSpecGroupMissing: "safe_unimportable_spec_group_missing",
  specFetch: "spec_fetch_failure",
  specParse: "spec_parse_failure",
  productParse: "product_parse_failure",
  availabilityParse: "availability_parse_failure",
  sourceMetadataConflict: "source_metadata_conflict",
  other: "other_failure",
});

function createTrialFailureCounts() {
  return Object.fromEntries(
    Object.values(TRIAL_SPORT_FAILURE_CATEGORIES).map((category) => [category, 0]),
  );
}

const SAFE_UNIMPORTABLE_FAILURE_CATEGORIES = new Set([
  TRIAL_SPORT_FAILURE_CATEGORIES.safeUnimportableSpecMissing,
  TRIAL_SPORT_FAILURE_CATEGORIES.safeUnimportableSpecGroupMissing,
]);

function getSafeUnimportableBreakdown(failuresByCategory) {
  return {
    specMissing:
      failuresByCategory[
        TRIAL_SPORT_FAILURE_CATEGORIES.safeUnimportableSpecMissing
      ] ?? 0,
    specGroupMissing:
      failuresByCategory[
        TRIAL_SPORT_FAILURE_CATEGORIES.safeUnimportableSpecGroupMissing
      ] ?? 0,
  };
}

function getUnsafeFailureCount(failuresByCategory) {
  return Object.entries(failuresByCategory).reduce(
    (total, [category, count]) =>
      SAFE_UNIMPORTABLE_FAILURE_CATEGORIES.has(category) ? total : total + count,
    0,
  );
}

function getTrialAvailability(htmlText) {
  const parsed = extractTrialJsonArrayResult(htmlText, "icspJS");
  if (!parsed.ok) {
    return { status: "unknown", entries: [] };
  }

  return {
    status: parsed.value.some(isTrialEntryAvailable) ? "available" : "unavailable",
    entries: parsed.value,
  };
}

function isTrialNotFoundError(error) {
  return error instanceof Error && /\bHTTP\s+(?:404|410)\b/u.test(error.message);
}

export async function revalidateTrialSportProducts({
  products,
  fetchText,
  concurrency = 5,
}) {
  const queue = Array.isArray(products) ? products : [];
  const outcomes = [];
  const failuresByCategory = createTrialFailureCounts();
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length) {
      const currentIndex = cursor;
      cursor += 1;
      const product = queue[currentIndex];
      const slug = String(product?.slug ?? "").trim();
      const productUrl = String(product?.affiliateUrl ?? "").trim();

      if (!slug || !productUrl) {
        failuresByCategory[TRIAL_SPORT_FAILURE_CATEGORIES.other] += 1;
        outcomes.push({ slug, status: "unknown" });
        continue;
      }

      let htmlText;
      try {
        htmlText = await fetchText(productUrl);
      } catch (error) {
        if (isTrialNotFoundError(error)) {
          outcomes.push({ slug, status: "unavailable" });
          continue;
        }

        failuresByCategory[TRIAL_SPORT_FAILURE_CATEGORIES.productFetch] += 1;
        outcomes.push({ slug, status: "unknown" });
        continue;
      }

      const availability = getTrialAvailability(htmlText);
      if (availability.status === "unknown") {
        failuresByCategory[TRIAL_SPORT_FAILURE_CATEGORIES.availabilityParse] += 1;
        outcomes.push({ slug, status: "unknown" });
        continue;
      }

      outcomes.push({ slug, status: availability.status });
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.max(1, Math.min(concurrency, queue.length || 1)) },
      () => worker(),
    ),
  );

  const unknownCount = outcomes.filter((outcome) => outcome.status === "unknown").length;

  return {
    outcomes: outcomes.sort((left, right) => left.slug.localeCompare(right.slug, "en")),
    diagnostics: {
      checkedCount: queue.length,
      availableCount: outcomes.filter((outcome) => outcome.status === "available").length,
      unavailableCount: outcomes.filter((outcome) => outcome.status === "unavailable").length,
      unknownCount,
      failuresByCategory,
      complete: unknownCount === 0,
    },
  };
}

export async function importTrialSportProducts({
  fetchArrayBuffer,
  fetchText,
  concurrency = 12,
  limit = null,
  logger = console,
  checkedAt,
  onProgress = null,
  progressInterval = 25,
}) {
  function reportProgress(snapshot) {
    if (typeof onProgress !== "function") {
      return;
    }

    try {
      onProgress(snapshot);
    } catch {
      // Progress reporting must never change importer behavior.
    }
  }

  const firstPageHtml = await fetchText(TRIAL_SECTION_URL);
  const maxPage = extractTrialPageCount(firstPageHtml);
  const listingUrls = Array.from({ length: maxPage }, (_, index) =>
    `${TRIAL_SECTION_URL}&pg=${index + 1}`,
  );

  const productUrls = new Set(extractTrialProductUrls(firstPageHtml));
  reportProgress({
    phase: "discovery",
    discoveredCount: productUrls.size,
    attemptedCount: 0,
    processedCount: 0,
    resolvedCount: 0,
    unavailableCount: 0,
    failedCount: 0,
    safeUnimportableCount: 0,
    unsafeFailureCount: 0,
    safeUnimportableByReason: { specMissing: 0, specGroupMissing: 0 },
    skippedCount: 0,
    remainingCount: 0,
    failuresByCategory: createTrialFailureCounts(),
    limited: false,
    importComplete: false,
    staleSafe: false,
    complete: false,
  });

  for (const listingUrl of listingUrls.slice(1)) {
    const html = await fetchText(listingUrl);
    for (const productUrl of extractTrialProductUrls(html)) {
      productUrls.add(productUrl);
    }

    reportProgress({
      phase: "discovery",
      discoveredCount: productUrls.size,
      attemptedCount: 0,
      processedCount: 0,
      resolvedCount: 0,
      unavailableCount: 0,
      failedCount: 0,
      safeUnimportableCount: 0,
      unsafeFailureCount: 0,
      safeUnimportableByReason: { specMissing: 0, specGroupMissing: 0 },
      skippedCount: 0,
      remainingCount: 0,
      failuresByCategory: createTrialFailureCounts(),
      limited: false,
      importComplete: false,
      staleSafe: false,
      complete: false,
    });
  }

  const workbookCache = new Map();
  const discoveredUrls = Array.from(productUrls).sort((left, right) =>
    left.localeCompare(right, "ru"),
  );
  const hasLimit = Number.isFinite(limit) && limit > 0;
  const queue = discoveredUrls.slice(0, hasLimit ? limit : undefined);
  const results = [];
  const sourceObservations = [];
  const warnings = [];
  const failuresByCategory = createTrialFailureCounts();
  let unavailableCount = 0;
  let processedCount = 0;
  let cursor = 0;
  const normalizedProgressInterval = Math.max(
    1,
    Math.floor(progressInterval),
  );

  function emitProgress(phase) {
    const failedCount = Object.values(failuresByCategory).reduce(
      (total, count) => total + count,
      0,
    );
    const skippedCount =
      processedCount - results.length - unavailableCount - failedCount;
    const safeUnimportableCount = sourceObservations.length;
    const unsafeFailureCount = getUnsafeFailureCount(failuresByCategory);
    const limited = hasLimit && queue.length < discoveredUrls.length;
    const processingComplete = processedCount === queue.length;
    const importComplete =
      processingComplete && !limited && failedCount === 0 && skippedCount === 0;
    const staleSafe =
      processingComplete && !limited && unsafeFailureCount === 0 && skippedCount === 0;
    const snapshot = {
      phase,
      discoveredCount: discoveredUrls.length,
      attemptedCount: queue.length,
      processedCount,
      resolvedCount: results.length,
      unavailableCount,
      failedCount,
      safeUnimportableCount,
      unsafeFailureCount,
      safeUnimportableByReason: getSafeUnimportableBreakdown(failuresByCategory),
      skippedCount,
      remainingCount: Math.max(0, queue.length - processedCount),
      failuresByCategory: { ...failuresByCategory },
      limited,
      importComplete,
      staleSafe,
      complete: importComplete,
    };

    reportProgress(snapshot);
  }

  function recordFailure(category, warning) {
    failuresByCategory[category] += 1;
    warnings.push(
      SAFE_UNIMPORTABLE_FAILURE_CATEGORIES.has(category)
        ? `Trial Sport: ${category}`
        : warning,
    );
  }

  function recordProductOutcome(outcome, productUrl) {
    if (outcome.status === "resolved") {
      results.push(outcome.product);
      return;
    }

    if (outcome.status === "safe_unimportable") {
      sourceObservations.push(outcome.observation);
      const category =
        outcome.observation.reason === "spec_missing"
          ? TRIAL_SPORT_FAILURE_CATEGORIES.safeUnimportableSpecMissing
          : TRIAL_SPORT_FAILURE_CATEGORIES.safeUnimportableSpecGroupMissing;
      recordFailure(
        category,
        `Trial Sport: safely observed but not importable (${outcome.observation.reason}) ${productUrl}`,
      );
      return;
    }

    recordFailure(
      outcome.category ?? TRIAL_SPORT_FAILURE_CATEGORIES.productParse,
      `Trial Sport: unable to build Product for ${productUrl}`,
    );
  }

  async function worker() {
    while (cursor < queue.length) {
      const currentIndex = cursor;
      cursor += 1;

      const productUrl = queue[currentIndex];

      try {
        let htmlText;
        try {
          htmlText = await fetchText(productUrl);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "неизвестная ошибка";
          recordFailure(
            TRIAL_SPORT_FAILURE_CATEGORIES.productFetch,
            `Триал-Спорт: ошибка загрузки ${productUrl}: ${message}`,
          );
          continue;
        }

        const availability = getTrialAvailability(htmlText);
        if (availability.status === "unknown") {
          recordFailure(
            TRIAL_SPORT_FAILURE_CATEGORIES.availabilityParse,
            `Триал-Спорт: не удалось определить наличие для ${productUrl}`,
          );
          continue;
        }

        if (availability.status === "unavailable") {
          unavailableCount += 1;
          continue;
        }

        const specUrl = extractTrialSpecUrl(htmlText);
        if (!specUrl) {
          const outcome = buildTrialProduct(
            productUrl,
            htmlText,
            null,
            availability.entries,
            checkedAt,
            true,
          );
          if (outcome.status !== "safe_unimportable") {
            recordProductOutcome(outcome, productUrl);
            continue;
          }
          sourceObservations.push(outcome.observation);
          recordFailure(
            TRIAL_SPORT_FAILURE_CATEGORIES.safeUnimportableSpecMissing,
            `Триал-Спорт: нет файла характеристик у ${productUrl}`,
          );
          continue;
        }

        let specResultPromise = workbookCache.get(specUrl);
        if (!specResultPromise) {
          specResultPromise = (async () => {
            let workbookBytes;
            try {
              workbookBytes = await fetchArrayBuffer(specUrl);
            } catch (error) {
              return {
                ok: false,
                category: TRIAL_SPORT_FAILURE_CATEGORIES.specFetch,
                error,
              };
            }

            try {
              const specMap = buildTrialSpecMap(workbookBytes);
              return specMap.size > 0
                ? { ok: true, specMap }
                : {
                    ok: false,
                    category: TRIAL_SPORT_FAILURE_CATEGORIES.specParse,
                  };
            } catch (error) {
              return {
                ok: false,
                category: TRIAL_SPORT_FAILURE_CATEGORIES.specParse,
                error,
              };
            }
          })();
          workbookCache.set(specUrl, specResultPromise);
        }

        const specResult = await specResultPromise;
        if (!specResult.ok) {
          recordFailure(
            specResult.category,
            `Триал-Спорт: ошибка файла характеристик у ${productUrl}`,
          );
          continue;
        }

        try {
          const outcome = buildTrialProduct(
            productUrl,
            htmlText,
            specResult.specMap,
            availability.entries,
            checkedAt,
          );
          if (outcome.status === "resolved") {
            results.push(outcome.product);
          } else {
            if (outcome.status === "safe_unimportable") {
              sourceObservations.push(outcome.observation);
            }
            recordFailure(
              outcome.status === "safe_unimportable"
                ? TRIAL_SPORT_FAILURE_CATEGORIES.safeUnimportableSpecGroupMissing
                : outcome.category ?? TRIAL_SPORT_FAILURE_CATEGORIES.productParse,
              `Триал-Спорт: не удалось собрать карточку для ${productUrl}`,
            );
          }
        } catch {
          recordFailure(
            TRIAL_SPORT_FAILURE_CATEGORIES.other,
            `Триал-Спорт: неизвестная ошибка обработки ${productUrl}`,
          );
        }
      } finally {
        processedCount += 1;
        if (processedCount % normalizedProgressInterval === 0) {
          emitProgress("processing");
        }
      }
    }
  }

  emitProgress("processing");
  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  logger.log(
    `Триал-Спорт: найдено URL товаров ${discoveredUrls.length}, импортировано ${results.length}.`,
  );

  const failedCount = Object.values(failuresByCategory).reduce(
    (total, count) => total + count,
    0,
  );
  const skippedCount = queue.length - results.length - unavailableCount - failedCount;
  const safeUnimportableCount = sourceObservations.length;
  const unsafeFailureCount = getUnsafeFailureCount(failuresByCategory);
  const limited = hasLimit && queue.length < discoveredUrls.length;
  const importComplete = !limited && failedCount === 0 && skippedCount === 0;
  const staleSafe = !limited && unsafeFailureCount === 0 && skippedCount === 0;
  const diagnostics = {
    discoveredCount: discoveredUrls.length,
    attemptedCount: queue.length,
    resolvedCount: results.length,
    unavailableCount,
    skippedCount,
    failedCount,
    safeUnimportableCount,
    unsafeFailureCount,
    safeUnimportableByReason: getSafeUnimportableBreakdown(failuresByCategory),
    failuresByCategory,
    limited,
    importComplete,
    staleSafe,
    complete: importComplete,
  };

  emitProgress("complete");

  return {
    products: results,
    sourceObservations,
    warnings,
    diagnostics,
  };
}

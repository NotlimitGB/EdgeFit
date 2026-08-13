import {
  buildDescriptions,
  buildNotIdealFor,
  buildScenarios,
  classifyWidthType,
  isPlausibleWaistWidthMm,
  mapRidingStyle,
  mapShapeType,
  mapSkillLevel,
  normalizeWaistWidthMm,
  normalizeWhitespace,
  parseFlexNumber,
  parseSeasonLabel,
  parseSizeCm,
  parseWeightRange,
  slugifyBoard,
  stripHtml,
  toAbsoluteUrl,
} from "./common.mjs";
import {
  getBoardLineEvidence,
  getExplicitVariantMarker,
  getStoreIdentityFromUrl,
} from "./source-identity.mjs";

const TRAEKTORIA_BASE_URL = "https://www.traektoria.ru";
const TRAEKTORIA_SECTION_API_URL =
  `${TRAEKTORIA_BASE_URL}/slim/pages/section/snowboard/boards/?SITE_ID=lid`;
const EXTRA_PRODUCT_URLS = [
  `${TRAEKTORIA_BASE_URL}/product/1890639_snoubord-jones-dream-weaver/`,
  `${TRAEKTORIA_BASE_URL}/product/1890653_snoubord-jones-mountain-twin/`,
];

export const TRAEKTORIA_SOURCE_METADATA_CORRECTIONS = Object.freeze({
  "1890654": Object.freeze({
    expectedBoardLine: "unisex",
    correctedBoardLine: "men",
    reason:
      "Verified Jones Stratos men identity; merchant labels this source as unisex.",
  }),
  "1890652": Object.freeze({
    expectedBoardLine: "unisex",
    correctedBoardLine: "men",
    reason:
      "Verified Jones Tweaker men identity; merchant labels this source as unisex.",
  }),
});

export function resolveTraektoriaBoardLineMetadata(
  sourceProductId,
  rawGender,
) {
  const raw = getBoardLineEvidence(rawGender);
  const correction =
    TRAEKTORIA_SOURCE_METADATA_CORRECTIONS[String(sourceProductId ?? "")] ??
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
    raw.evidence !== "known" ||
    (raw.boardLine !== correction.expectedBoardLine &&
      raw.boardLine !== correction.correctedBoardLine)
  ) {
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
    correctionApplied: raw.boardLine === correction.expectedBoardLine,
    reason: correction.reason,
  };
}

function extractProductId(productUrl) {
  const match = productUrl.match(/\/product\/(\d+)_/u);
  return match?.[1] ?? null;
}

const SIZE_LABEL_MARKERS = [
  "\u0440\u043e\u0441\u0442\u043e\u0432",
  "\u0440\u0430\u0437\u043c\u0435\u0440",
  "\u0434\u043b\u0438\u043d\u0430 \u0434\u043e\u0441\u043a",
];
const WAIST_LABEL = "\u0448\u0438\u0440\u0438\u043d\u0430 \u0442\u0430\u043b\u0438\u0438";
const RIDER_WEIGHT_LABEL = "\u0432\u0435\u0441 \u0440\u0430\u0439\u0434\u0435\u0440\u0430";
const SNOWBOARD_TYPE = "\u0441\u043d\u043e\u0443\u0431\u043e\u0440\u0434";

function normalizeTableLabel(value) {
  return normalizeWhitespace(value).toLowerCase();
}

function isSizeLabel(value) {
  const normalized = normalizeTableLabel(value);
  return SIZE_LABEL_MARKERS.some((marker) => normalized.includes(marker));
}

function isWaistLabel(value) {
  return normalizeTableLabel(value).includes(WAIST_LABEL);
}

function isRiderWeightLabel(value) {
  return normalizeTableLabel(value).includes(RIDER_WEIGHT_LABEL);
}

function getTraektoriaSizeTableRows(gridSizeHtml) {
  return Array.from(
    String(gridSizeHtml ?? "").matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/giu),
    (match) =>
      Array.from(
        match[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/giu),
        (cellMatch) => stripHtml(cellMatch[1]),
      ),
  ).filter((cells) => cells.length > 0);
}

function toTraektoriaSize({ sizeLabel, waistValue, riderWeightValue }) {
  const normalizedSizeLabel = normalizeWhitespace(sizeLabel);
  const sizeCm = parseSizeCm(normalizedSizeLabel);
  const waistWidthMm = normalizeWaistWidthMm(waistValue);
  const weightRange = riderWeightValue
    ? parseWeightRange(riderWeightValue)
    : { min: 0, max: null };

  if (!isPlausibleWaistWidthMm(sizeCm, waistWidthMm)) {
    return null;
  }

  return {
    sizeCm,
    sizeLabel: normalizedSizeLabel,
    waistWidthMm,
    recommendedWeightMin: weightRange.min,
    recommendedWeightMax: weightRange.max,
    widthType: classifyWidthType(waistWidthMm),
  };
}

function parseColumnOrientedSizeTable(rows) {
  const header = rows[0].slice(1);
  const waistRow = rows.slice(1).find((row) => isWaistLabel(row[0]));
  const riderWeightRow = rows.slice(1).find((row) =>
    isRiderWeightLabel(row[0]),
  );
  const parseableHeaderCount = header.filter((label) =>
    Number.isFinite(parseSizeCm(label)),
  ).length;

  if (parseableHeaderCount === 0 || !waistRow) {
    return null;
  }

  return header
    .map((sizeLabel, index) =>
      toTraektoriaSize({
        sizeLabel,
        waistValue: waistRow[index + 1],
        riderWeightValue: riderWeightRow?.[index + 1],
      }),
    )
    .filter(Boolean);
}

function parseRowOrientedSizeTable(rows) {
  const header = rows[0];
  const waistIndex = header.findIndex(isWaistLabel);
  const riderWeightIndex = header.findIndex(isRiderWeightLabel);

  if (!isSizeLabel(header[0]) || waistIndex < 1) {
    return null;
  }

  return rows
    .slice(1)
    .map((row) =>
      toTraektoriaSize({
        sizeLabel: row[0],
        waistValue: row[waistIndex],
        riderWeightValue:
          riderWeightIndex >= 1 ? row[riderWeightIndex] : undefined,
      }),
    )
    .filter(Boolean);
}

function parseTraektoriaSizeTable(gridSizeHtml) {
  const tableHtml = String(gridSizeHtml ?? "");
  if (!tableHtml.trim()) {
    return { status: "missing", orientation: null, sizes: [] };
  }

  const rows = getTraektoriaSizeTableRows(tableHtml);
  if (rows.length < 2) {
    return { status: "invalid", orientation: null, sizes: [] };
  }

  const rowOrientedSizes = parseRowOrientedSizeTable(rows);
  const columnOrientedSizes = rowOrientedSizes
    ? null
    : parseColumnOrientedSizeTable(rows);
  const orientation = rowOrientedSizes
    ? "row"
    : columnOrientedSizes
      ? "column"
      : null;
  const sizes = (rowOrientedSizes ?? columnOrientedSizes ?? []).sort(
    (left, right) => left.sizeCm - right.sizeCm,
  );

  return {
    status: orientation && sizes.length > 0 ? "parsed" : "invalid",
    orientation,
    sizes,
  };
}

function getTraektoriaFilterMap(filterOptions) {
  return new Map(
    (Array.isArray(filterOptions) ? filterOptions : []).map((option) => [
      option.code,
      stripHtml(option.value),
    ]),
  );
}

function getFlexFromTraektoriaProduct(model, descriptions, filterMap) {
  const numericFlexMatch = String(descriptions?.features ?? "").match(
    /Жесткость:\s*([0-9]+(?:[.,][0-9]+)?)\s*из\s*10/iu,
  );

  if (numericFlexMatch) {
    return parseFlexNumber(numericFlexMatch[1]);
  }

  return parseFlexNumber(filterMap.get("FLEX"));
}

function extractTraektoriaImageUrls(model) {
  const urls = Array.from(
    new Set(
      (Array.isArray(model?.photo_list) ? model.photo_list : [])
        .map((photo) =>
          toAbsoluteUrl(
            TRAEKTORIA_BASE_URL,
            photo?.url_resize || photo?.url || "",
          ),
        )
        .map((url) => String(url ?? "").trim())
        .filter(Boolean),
    ),
  );

  return urls;
}

function isTraektoriaSkuAvailable(sku) {
  return (
    sku?.is_available === true ||
    (Number.isFinite(sku?.quantity) && Number(sku.quantity) > 0) ||
    (Array.isArray(sku?.shops_available) && sku.shops_available.length > 0) ||
    (Array.isArray(sku?.stores_available) && sku.stores_available.length > 0)
  );
}

function getTraektoriaAvailability(model) {
  if (!Array.isArray(model?.sku_list)) {
    return { status: "unknown", availableSkus: [] };
  }

  const allSkus = [];
  for (const skuGroup of model.sku_list) {
    if (!skuGroup || !Array.isArray(skuGroup.sizes)) {
      return { status: "unknown", availableSkus: [] };
    }

    if (skuGroup.sizes.some((sku) => !sku || typeof sku !== "object")) {
      return { status: "unknown", availableSkus: [] };
    }

    allSkus.push(...skuGroup.sizes);
  }

  const availableSkus = allSkus.filter(isTraektoriaSkuAvailable);
  return {
    status: availableSkus.length > 0 ? "available" : "unavailable",
    availableSkus,
  };
}

function mapTraektoriaSizesAvailability(sizes, availableSkus) {
  const availableLabels = new Set(
    availableSkus
      .map((sku) => normalizeWhitespace(sku?.size_title || sku?.color_title || ""))
      .filter(Boolean),
  );

  return sizes.map((size) => ({
    ...size,
    isAvailable: availableLabels.has(normalizeWhitespace(size.sizeLabel)),
  }));
}

function buildTraektoriaProduct(
  productUrl,
  productPayload,
  checkedAt,
  boardLineIdentity,
) {
  const content = productPayload?.data?.MAIN?.content;
  const model = content?.model;
  const props = model?.props;

  if (!content || !model || !props) {
    return null;
  }

  if (normalizeWhitespace(props.thing_type).toLowerCase() !== "сноуборд") {
    return null;
  }

  const filterMap = getTraektoriaFilterMap(content.filter_options);
  const availability = getTraektoriaAvailability(model);
  const availableSkus = availability.availableSkus;
  const sizeTable = parseTraektoriaSizeTable(content.grid_size_html);
  const sizes = mapTraektoriaSizesAvailability(
    sizeTable.sizes,
    availableSkus,
  );

  if (sizes.length === 0) {
    return null;
  }

  const brand = normalizeWhitespace(model.brand?.name || props.name.split(" ")[0]);
  const modelName = normalizeWhitespace(props.model_name || props.name.replace(brand, ""));
  const seasonLabel =
    parseSeasonLabel(props.name) ??
    parseSeasonLabel(props.model_name) ??
    null;
  const slug = slugifyBoard(`${brand} ${modelName}`);
  const shapeType = mapShapeType(filterMap.get("SHAPE"));
  const flex = getFlexFromTraektoriaProduct(model, content.descriptions, filterMap);
  const ridingStyle = mapRidingStyle(filterMap.get("RIDING_STYLE"));
  const boardLine = boardLineIdentity.boardLine;
  const skillLevel = mapSkillLevel({
    levelText: filterMap.get("LEVEL"),
    flex,
  });
  const selectedSku = content.selected_sku ?? {};
  const skuPrices = availableSkus
    .map((sku) => sku.retail_price || sku.base_price)
    .filter((price) => Number.isFinite(price) && price > 0);
  const priceFrom =
    skuPrices.length > 0
      ? Math.min(...skuPrices)
      : selectedSku.retail_price || selectedSku.base_price || 0;
  const hasAvailableSizes = sizes.some((size) => size.isAvailable);

  const imageUrls = extractTraektoriaImageUrls(model);

  const product = {
    slug,
    brand,
    modelName,
    seasonLabel,
    descriptionShort: "",
    descriptionFull: "",
    ridingStyle,
    skillLevel,
    flex,
    priceFrom,
    imageUrl: imageUrls[0] || "",
    galleryImages: imageUrls.slice(1),
    affiliateUrl: productUrl,
    isActive: hasAvailableSizes,
    boardLine,
    shapeType,
    dataStatus: "draft",
    sourceName: "Траектория",
    sourceUrl: productUrl,
    sourceCheckedAt: checkedAt,
    scenarios: [],
    notIdealFor: [],
    sizes,
    importMeta: {
      storeCode: "traektoria",
      sourceProductId: extractProductId(productUrl),
      baseSlug: slug,
      boardLineEvidence: boardLineIdentity.evidence,
      variantMarker: getExplicitVariantMarker(modelName),
      storeName: "Траектория",
    },
  };

  const descriptions = buildDescriptions(product);

  return {
    ...product,
    descriptionShort: descriptions.descriptionShort,
    descriptionFull: descriptions.descriptionFull,
    scenarios: buildScenarios(product),
    notIdealFor: buildNotIdealFor(product),
  };
}

export const TRAEKTORIA_FAILURE_CATEGORIES = Object.freeze({
  productFetch: "product_fetch_failure",
  missingPayload: "missing_payload",
  unexpectedType: "unexpected_type",
  sizeTableParse: "size_table_parse_failure",
  identity: "identity_failure",
  availabilityParse: "availability_parse_failure",
  sourceMetadataConflict: "source_metadata_conflict",
  other: "other_failure",
});

function createTraektoriaFailureCounts() {
  return Object.fromEntries(
    Object.values(TRAEKTORIA_FAILURE_CATEGORIES).map((category) => [category, 0]),
  );
}

function getTraektoriaIdentity(model, props) {
  const productName = normalizeWhitespace(props?.name);
  const brand = normalizeWhitespace(model?.brand?.name || productName.split(" ")[0]);
  const modelName = normalizeWhitespace(
    props?.model_name || (brand ? productName.replace(brand, "") : ""),
  );

  return brand && modelName ? { brand, modelName } : null;
}

function buildTraektoriaProductOutcome(productUrl, productPayload, checkedAt) {
  const sourceProductId = extractProductId(productUrl);
  if (!sourceProductId) {
    return {
      status: "unsafe_failure",
      category: TRAEKTORIA_FAILURE_CATEGORIES.identity,
    };
  }

  const content = productPayload?.data?.MAIN?.content;
  const model = content?.model;
  const props = model?.props;
  if (!content || !model || !props) {
    return {
      status: "unsafe_failure",
      category: TRAEKTORIA_FAILURE_CATEGORIES.missingPayload,
    };
  }

  if (normalizeWhitespace(props.thing_type).toLowerCase() !== SNOWBOARD_TYPE) {
    return {
      status: "unsafe_failure",
      category: TRAEKTORIA_FAILURE_CATEGORIES.unexpectedType,
    };
  }

  if (!getTraektoriaIdentity(model, props)) {
    return {
      status: "unsafe_failure",
      category: TRAEKTORIA_FAILURE_CATEGORIES.identity,
    };
  }

  const boardLineIdentity = resolveTraektoriaBoardLineMetadata(
    sourceProductId,
    props.gender,
  );
  if (boardLineIdentity.status === "conflict") {
    return {
      status: "unsafe_failure",
      category: TRAEKTORIA_FAILURE_CATEGORIES.sourceMetadataConflict,
    };
  }

  const availability = getTraektoriaAvailability(model);
  if (availability.status === "unknown") {
    return {
      status: "unsafe_failure",
      category: TRAEKTORIA_FAILURE_CATEGORIES.availabilityParse,
    };
  }

  const sizeTable = parseTraektoriaSizeTable(content.grid_size_html);
  if (sizeTable.status === "missing") {
    return {
      status: "safe_unimportable",
      observation: {
        storeCode: "traektoria",
        sourceProductId,
        status: "safe_unimportable",
        reason: "size_table_missing",
        availability: availability.status,
      },
    };
  }

  if (sizeTable.status !== "parsed") {
    return {
      status: "unsafe_failure",
      category: TRAEKTORIA_FAILURE_CATEGORIES.sizeTableParse,
    };
  }

  try {
    const product = buildTraektoriaProduct(
      productUrl,
      productPayload,
      checkedAt,
      boardLineIdentity,
    );
    return product
      ? { status: "resolved", product }
      : {
          status: "unsafe_failure",
          category: TRAEKTORIA_FAILURE_CATEGORIES.other,
        };
  } catch {
    return {
      status: "unsafe_failure",
      category: TRAEKTORIA_FAILURE_CATEGORIES.other,
    };
  }
}

function isTraektoriaNotFoundError(error) {
  return error instanceof Error && /\bHTTP\s+(?:404|410)\b/u.test(error.message);
}

export async function revalidateTraektoriaProducts({
  products,
  fetchJson,
  concurrency = 5,
}) {
  const queue = Array.isArray(products) ? products : [];
  const outcomes = [];
  const failuresByCategory = createTraektoriaFailureCounts();
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length) {
      const currentIndex = cursor;
      cursor += 1;
      const product = queue[currentIndex];
      const slug = String(product?.slug ?? "").trim();
      const sourceProductId = getStoreIdentityFromUrl(
        product?.affiliateUrl,
      ).sourceProductId;

      if (!slug || !sourceProductId) {
        failuresByCategory[TRAEKTORIA_FAILURE_CATEGORIES.identity] += 1;
        outcomes.push({ slug, status: "unknown" });
        continue;
      }

      let payload;
      try {
        payload = await fetchJson(
          `${TRAEKTORIA_BASE_URL}/slim/pages/product/${sourceProductId}/?SITE_ID=lid`,
        );
      } catch (error) {
        if (isTraektoriaNotFoundError(error)) {
          outcomes.push({ slug, status: "unavailable" });
          continue;
        }

        failuresByCategory[TRAEKTORIA_FAILURE_CATEGORIES.productFetch] += 1;
        outcomes.push({ slug, status: "unknown" });
        continue;
      }

      const content = payload?.data?.MAIN?.content;
      const model = content?.model;
      const props = model?.props;
      if (!content || !model || !props) {
        failuresByCategory[TRAEKTORIA_FAILURE_CATEGORIES.missingPayload] += 1;
        outcomes.push({ slug, status: "unknown" });
        continue;
      }

      if (normalizeWhitespace(props.thing_type).toLowerCase() !== SNOWBOARD_TYPE) {
        failuresByCategory[TRAEKTORIA_FAILURE_CATEGORIES.unexpectedType] += 1;
        outcomes.push({ slug, status: "unknown" });
        continue;
      }

      if (!getTraektoriaIdentity(model, props)) {
        failuresByCategory[TRAEKTORIA_FAILURE_CATEGORIES.identity] += 1;
        outcomes.push({ slug, status: "unknown" });
        continue;
      }

      const availability = getTraektoriaAvailability(model);
      if (availability.status === "unknown") {
        failuresByCategory[TRAEKTORIA_FAILURE_CATEGORIES.availabilityParse] += 1;
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

export async function importTraektoriaProducts({
  fetchJson,
  concurrency = 8,
  limit = null,
  logger = console,
  checkedAt,
}) {
  const firstPagePayload = await fetchJson(TRAEKTORIA_SECTION_API_URL);
  const firstPageContent = firstPagePayload?.data?.MAIN?.content;
  const firstPageProducts = firstPageContent?.products;
  const pageCount = Number(firstPageContent?.navigation?.data?.page_count ?? 1);
  if (
    !firstPageContent ||
    !Array.isArray(firstPageProducts) ||
    !Number.isInteger(pageCount) ||
    pageCount < 1
  ) {
    throw new Error("INCOMPLETE_TRAEKTORIA_SOURCE");
  }

  const productUrls = new Set(
    firstPageProducts
      .map((product) => product.url)
      .filter(Boolean)
      .map((url) => toAbsoluteUrl(TRAEKTORIA_BASE_URL, url.split("?")[0])),
  );
  if (firstPageProducts.some((product) => !product?.url)) {
    throw new Error("INCOMPLETE_TRAEKTORIA_SOURCE");
  }

  for (const productUrl of EXTRA_PRODUCT_URLS) {
    productUrls.add(productUrl);
  }

  for (let page = 2; page <= pageCount; page += 1) {
    const pagePayload = await fetchJson(
      `${TRAEKTORIA_SECTION_API_URL}&PAGEN_1=${page}`,
    );
    const pageProducts = pagePayload?.data?.MAIN?.content?.products;
    if (!Array.isArray(pageProducts)) {
      throw new Error("INCOMPLETE_TRAEKTORIA_SOURCE");
    }

    if (pageProducts.some((product) => !product?.url)) {
      throw new Error("INCOMPLETE_TRAEKTORIA_SOURCE");
    }

    for (const product of pageProducts) {
      if (product?.url) {
        productUrls.add(
          toAbsoluteUrl(TRAEKTORIA_BASE_URL, String(product.url).split("?")[0]),
        );
      }
    }
  }

  const discoveredUrls = Array.from(productUrls).sort((left, right) =>
    left.localeCompare(right, "ru"),
  );
  const hasLimit = Number.isFinite(limit) && limit > 0;
  const queue = discoveredUrls.slice(0, hasLimit ? limit : undefined);
  const results = [];
  const sourceObservations = [];
  const warnings = [];
  const failuresByCategory = createTraektoriaFailureCounts();
  let processedCount = 0;
  let cursor = 0;

  function recordUnsafeFailure(category) {
    failuresByCategory[category] += 1;
    warnings.push(`Traektoria: ${category}`);
  }

  function recordOutcome(outcome) {
    if (outcome.status === "resolved") {
      results.push(outcome.product);
      return;
    }

    if (outcome.status === "safe_unimportable") {
      sourceObservations.push(outcome.observation);
      warnings.push("Traektoria: safe_unimportable_size_table_missing");
      return;
    }

    recordUnsafeFailure(outcome.category);
  }

  async function worker() {
    while (cursor < queue.length) {
      const currentIndex = cursor;
      cursor += 1;

      const productUrl = queue[currentIndex];
      const productId = extractProductId(productUrl);

      if (!productId) {
        recordUnsafeFailure(TRAEKTORIA_FAILURE_CATEGORIES.identity);
        processedCount += 1;
        continue;
      }

      try {
        const payload = await fetchJson(
          `${TRAEKTORIA_BASE_URL}/slim/pages/product/${productId}/?SITE_ID=lid`,
        );
        recordOutcome(
          buildTraektoriaProductOutcome(productUrl, payload, checkedAt),
        );
      } catch {
        recordUnsafeFailure(TRAEKTORIA_FAILURE_CATEGORIES.productFetch);
      } finally {
        processedCount += 1;
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  const unsafeFailureCount = Object.values(failuresByCategory).reduce(
    (total, count) => total + count,
    0,
  );
  const safeUnimportableCount = sourceObservations.length;
  const limited = hasLimit && queue.length < discoveredUrls.length;
  const processingComplete = processedCount === queue.length;
  const importComplete =
    processingComplete &&
    !limited &&
    safeUnimportableCount === 0 &&
    unsafeFailureCount === 0;
  const staleSafe =
    processingComplete && !limited && unsafeFailureCount === 0;
  const diagnostics = {
    discoveredCount: discoveredUrls.length,
    attemptedCount: queue.length,
    processedCount,
    resolvedCount: results.length,
    safeUnimportableCount,
    unsafeFailureCount,
    safeUnimportableByReason: {
      sizeTableMissing: sourceObservations.filter(
        (observation) => observation.reason === "size_table_missing",
      ).length,
    },
    failuresByCategory,
    limited,
    importComplete,
    staleSafe,
    complete: importComplete,
  };

  logger.log(
    `Траектория: найдено URL товаров ${discoveredUrls.length}, импортировано ${results.length}.`,
  );

  return {
    products: results,
    sourceObservations,
    warnings,
    diagnostics,
  };
}

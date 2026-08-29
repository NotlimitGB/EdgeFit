const cyrillicMap = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

const widthThresholds = {
  midWide: 257,
  wide: 264,
};

function transliterate(value) {
  return Array.from(String(value ?? ""))
    .map((character) => {
      const lowerCharacter = character.toLowerCase();
      return cyrillicMap[lowerCharacter] ?? character;
    })
    .join("");
}

export function normalizeWhitespace(value) {
  return String(value ?? "")
    .replace(/\u00a0/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function decodeHtml(value) {
  return normalizeWhitespace(
    String(value ?? "")
      .replace(/&nbsp;/giu, " ")
      .replace(/&amp;/giu, "&")
      .replace(/&quot;/giu, '"')
      .replace(/&#039;/giu, "'")
      .replace(/&lt;/giu, "<")
      .replace(/&gt;/giu, ">"),
  );
}

export function stripHtml(value) {
  return decodeHtml(String(value ?? "").replace(/<[^>]+>/gu, " "));
}

export function slugifyBoard(value) {
  const normalized = transliterate(String(value ?? ""))
    .toLowerCase()
    .replace(/\b(?:fw|ss)\d{2}\b/gu, " ")
    .replace(/\b20\d{2}(?:\/20\d{2})?\b/gu, " ")
    .replace(/\b(?:snowboard|snoubord|сноуборд)\b/gu, " ")
    .replace(/['’]/gu, "")
    .replace(/&/gu, " and ")
    .replace(/\+/gu, " plus ")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/-{2,}/gu, "-");

  return normalized;
}

export function normalizeBoardKey(value) {
  return slugifyBoard(value).replace(/-/gu, "");
}

function normalizeSeasonYear(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (parsed >= 2000 && parsed <= 2100) {
    return parsed;
  }

  if (parsed >= 20 && parsed <= 40) {
    return 2000 + parsed;
  }

  return null;
}

export function parseSeasonLabel(value, { asWinterSeason = false } = {}) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return null;
  }

  const fullRangeMatch = normalized.match(/\b(20\d{2})\s*[/-]\s*(20\d{2})\b/u);
  if (fullRangeMatch) {
    return `${fullRangeMatch[1]}/${fullRangeMatch[2]}`;
  }

  const mixedRangeMatch = normalized.match(/\b(20\d{2})\s*[/-]\s*(\d{2})\b/u);
  if (mixedRangeMatch) {
    const endYear = normalizeSeasonYear(mixedRangeMatch[2]);
    if (endYear) {
      return `${mixedRangeMatch[1]}/${endYear}`;
    }
  }

  const shortRangeMatch = normalized.match(/\b(\d{2})\s*[/-]\s*(\d{2})\b/u);
  if (shortRangeMatch) {
    const startYear = normalizeSeasonYear(shortRangeMatch[1]);
    const endYear = normalizeSeasonYear(shortRangeMatch[2]);
    if (startYear && endYear && endYear >= startYear) {
      return `${startYear}/${endYear}`;
    }
  }

  const winterMatch = normalized.match(/\bFW\s*['’]?\s*(\d{2}|20\d{2})\b/iu);
  if (winterMatch) {
    const endYear = normalizeSeasonYear(winterMatch[1]);
    if (endYear) {
      return `${endYear - 1}/${endYear}`;
    }
  }

  const yearMatch = normalized.match(/\b(20\d{2})\b/u);
  if (yearMatch) {
    const year = Number.parseInt(yearMatch[1], 10);
    return asWinterSeason ? `${year - 1}/${year}` : yearMatch[1];
  }

  return null;
}

export function normalizeSeasonIdentity(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return null;
  }

  const canonicalRangeMatch = normalized.match(
    /^(20\d{2})\s+(20\d{2})$/u,
  );
  if (canonicalRangeMatch) {
    return `${canonicalRangeMatch[1]}/${canonicalRangeMatch[2]}`;
  }

  return parseSeasonLabel(normalized, { asWinterSeason: true }) ?? normalized;
}

export function getSeasonRank(seasonLabel) {
  const normalized = normalizeWhitespace(seasonLabel);
  if (!normalized) {
    return null;
  }

  const rangeMatch = normalized.match(/\b(20\d{2})\/(20\d{2})\b/u);
  if (rangeMatch) {
    return Number.parseInt(rangeMatch[2], 10) * 10000 + Number.parseInt(rangeMatch[1], 10);
  }

  const yearMatch = normalized.match(/\b(20\d{2})\b/u);
  if (yearMatch) {
    return Number.parseInt(yearMatch[1], 10);
  }

  return null;
}

export function toAbsoluteUrl(baseUrl, maybeRelativeUrl) {
  if (!maybeRelativeUrl) {
    return "";
  }

  return new URL(maybeRelativeUrl, baseUrl).toString();
}

export function parseInteger(value) {
  if (value == null) {
    return null;
  }

  const digits = String(value).replace(/[^\d-]/gu, "");
  if (!digits) {
    return null;
  }

  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseFloatNumber(value) {
  if (value == null) {
    return null;
  }

  const normalized = String(value)
    .replace(",", ".")
    .replace(/[^\d.+-]/gu, "");

  if (!normalized) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeWaistWidthMm(value) {
  const parsed = parseFloatNumber(value);
  if (parsed == null) {
    return null;
  }

  if (parsed >= 1000 && parsed <= 4000) {
    return Math.round(parsed / 10);
  }

  if (parsed > 0 && parsed < 100) {
    return Math.round(parsed * 10);
  }

  return Math.round(parsed);
}

export function isPlausibleWaistWidthMm(sizeCm, waistWidthMm) {
  if (!Number.isFinite(sizeCm) || !Number.isFinite(waistWidthMm)) {
    return false;
  }

  if (sizeCm >= 140) {
    return waistWidthMm >= 200 && waistWidthMm <= 340;
  }

  if (sizeCm >= 100) {
    return waistWidthMm >= 170 && waistWidthMm <= 340;
  }

  return waistWidthMm >= 120 && waistWidthMm <= 240;
}

export function parseFlexNumber(value) {
  const directNumber = parseFloatNumber(value);
  if (directNumber != null) {
    return Math.max(1, Math.min(10, Math.round(directNumber)));
  }

  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized) {
    return 5;
  }

  if (normalized.includes("мяг")) {
    return 3;
  }

  if (normalized.includes("сред")) {
    return 5;
  }

  if (normalized.includes("жест")) {
    return 8;
  }

  return 5;
}

export function resolveFlex(value) {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized) {
    return { value: null, evidence: "missing" };
  }

  if (/^[+-]?\d+(?:[.,]\d+)?$/u.test(normalized)) {
    const numericValue = Number.parseFloat(normalized.replace(",", "."));
    return numericValue >= 1 && numericValue <= 10
      ? { value: Math.round(numericValue), evidence: "known" }
      : { value: null, evidence: "unrecognized" };
  }

  const textualValues = [
    normalized.includes("мяг") ? 3 : null,
    normalized.includes("сред") ? 5 : null,
    normalized.includes("жест") ? 8 : null,
  ].filter((candidate) => candidate != null);

  if (textualValues.length === 1) {
    return { value: textualValues[0], evidence: "known" };
  }

  return {
    value: null,
    evidence: textualValues.length > 1 ? "ambiguous" : "unrecognized",
  };
}

export function classifyWidthType(waistWidthMm) {
  if (waistWidthMm >= widthThresholds.wide) {
    return "wide";
  }

  if (waistWidthMm >= widthThresholds.midWide) {
    return "mid-wide";
  }

  return "regular";
}

export function mapBoardLineFromText(value) {
  const normalized = normalizeWhitespace(value).toLowerCase();

  if (normalized.includes("жен")) {
    return "women";
  }

  if (normalized.includes("муж")) {
    return "men";
  }

  return "unisex";
}

export function mapShapeType(value) {
  const normalized = normalizeWhitespace(value)
    .toLowerCase()
    .replace(/\s+/gu, " ");

  if (!normalized) {
    return null;
  }

  if (normalized.includes("asym")) {
    return "asym-twin";
  }

  if (
    normalized.includes("directional twin") ||
    normalized.includes("направлен") && normalized.includes("твин")
  ) {
    return "directional-twin";
  }

  if (
    normalized.includes("tapered directional") ||
    (normalized.includes("directional") && normalized.includes("taper"))
  ) {
    return "tapered-directional";
  }

  if (normalized.includes("true twin") || normalized === "twin") {
    return "twin";
  }

  if (normalized.includes("directional") || normalized.includes("направлен")) {
    return "directional";
  }

  if (normalized.includes("twin") || normalized.includes("твин")) {
    return "twin";
  }

  return null;
}

export function mapRidingStyle(value) {
  const normalized = normalizeWhitespace(value).toLowerCase();

  if (!normalized) {
    return "all-mountain";
  }

  const hasFreeride =
    normalized.includes("freeride") || normalized.includes("фрирайд");
  const hasPark =
    normalized.includes("park") ||
    normalized.includes("фристайл") ||
    normalized.includes("freestyle");
  const hasAllMountain =
    normalized.includes("all mountain") ||
    normalized.includes("all-mountain") ||
    normalized.includes("универс");

  if (hasFreeride && !hasPark && !hasAllMountain) {
    return "freeride";
  }

  if (hasPark && !hasFreeride && !hasAllMountain) {
    return "park";
  }

  return "all-mountain";
}

export function resolveRidingStyle(value) {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized) {
    return { value: null, evidence: "missing" };
  }

  const matches = [
    {
      value: "freeride",
      matched:
        normalized.includes("freeride") || normalized.includes("фрирайд"),
    },
    {
      value: "park",
      matched:
        normalized.includes("park") ||
        normalized.includes("фристайл") ||
        normalized.includes("freestyle"),
    },
    {
      value: "all-mountain",
      matched:
        normalized.includes("all mountain") ||
        normalized.includes("all-mountain") ||
        normalized.includes("универс"),
    },
  ].filter((candidate) => candidate.matched);

  if (matches.length === 1) {
    return { value: matches[0].value, evidence: "known" };
  }

  return {
    value: null,
    evidence: matches.length > 1 ? "ambiguous" : "unrecognized",
  };
}

export function mapSkillLevel({ levelText, flex }) {
  const normalized = normalizeWhitespace(levelText).toLowerCase();

  if (normalized.includes("начина")) {
    return "beginner";
  }

  if (normalized.includes("эксперт")) {
    return "advanced";
  }

  if (normalized.includes("продвин")) {
    return "intermediate";
  }

  if (flex >= 8) {
    return "advanced";
  }

  if (flex <= 4) {
    return "beginner";
  }

  return "intermediate";
}

export function resolveSkillLevel({ levelText, flexResolution }) {
  const normalized = normalizeWhitespace(levelText).toLowerCase();
  const matches = [
    { value: "beginner", matched: normalized.includes("начина") },
    { value: "advanced", matched: normalized.includes("эксперт") },
    { value: "intermediate", matched: normalized.includes("продвин") },
  ].filter((candidate) => candidate.matched);

  if (matches.length === 1) {
    return { value: matches[0].value, evidence: "known" };
  }

  if (matches.length > 1) {
    return { value: null, evidence: "ambiguous" };
  }

  if (
    flexResolution?.evidence === "known" &&
    Number.isFinite(flexResolution.value)
  ) {
    const flex = flexResolution.value;
    return {
      value: flex >= 8 ? "advanced" : flex <= 4 ? "beginner" : "intermediate",
      evidence: "derived_from_known_flex",
    };
  }

  return {
    value: null,
    evidence: normalized ? "unrecognized" : "missing",
  };
}

const unresolvedAttributeOrder = [
  "riding_style",
  "board_line",
  "flex",
  "skill_level",
  "waist_width",
];

export function createAttributeTruthObservation({
  storeCode,
  sourceProductId,
  availability,
  unresolvedAttributes,
}) {
  const unresolvedSet = new Set(unresolvedAttributes);
  return {
    storeCode,
    sourceProductId,
    availability,
    status: "safe_unimportable",
    reason: "attribute_truth_unresolved",
    unresolvedAttributes: unresolvedAttributeOrder.filter((attribute) =>
      unresolvedSet.has(attribute),
    ),
  };
}

export function parseWeightRange(value) {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized) {
    return { min: 0, max: null };
  }

  const plusMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*[-–]?\s*(\d+(?:[.,]\d+)?)?\+/u);
  if (plusMatch) {
    const min = parseFloatNumber(plusMatch[1]);
    const max = parseFloatNumber(plusMatch[2]);
    return { min: Math.round(min ?? 0), max: max == null ? null : Math.round(max) };
  }

  const rangeMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)/u);
  if (rangeMatch) {
    return {
      min: Math.round(parseFloatNumber(rangeMatch[1]) ?? 0),
      max: Math.round(parseFloatNumber(rangeMatch[2]) ?? 0),
    };
  }

  const onlyNumber = parseFloatNumber(normalized);
  if (onlyNumber == null) {
    return { min: 0, max: null };
  }

  return {
    min: Math.round(onlyNumber),
    max: null,
  };
}

export function parseSizeCm(sizeLabel) {
  const match = normalizeWhitespace(sizeLabel).match(/(\d+(?:[.,]\d+)?)/u);
  if (!match) {
    return null;
  }

  return Number.parseFloat(match[1].replace(",", "."));
}

export function normalizeSizeKey(sizeLabel) {
  return normalizeWhitespace(sizeLabel)
    .toLowerCase()
    .replace(/см/gu, "cm")
    .replace(/\s+/gu, "")
    .replace(/cm$/gu, "");
}

export function summarizeSizeLabels(sizes) {
  const labels = sizes
    .map((size) => size.sizeLabel || String(size.sizeCm))
    .filter(Boolean);

  if (labels.length === 0) {
    return "размеры уточняются";
  }

  if (labels.length <= 4) {
    return labels.join(", ");
  }

  return `${labels[0]}–${labels.at(-1)}`;
}

export function getWaistRangeLabel(sizes) {
  if (sizes.length === 0) {
    return "талия уточняется";
  }

  const waists = sizes.map((size) => size.waistWidthMm).filter(Number.isFinite);
  const min = Math.min(...waists);
  const max = Math.max(...waists);

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return "талия уточняется";
  }

  return min === max ? `${min} мм` : `${min}-${max} мм`;
}

export function buildScenarios({ ridingStyle, boardLine, shapeType, sizes }) {
  const scenarios = [];

  if (ridingStyle === "park") {
    scenarios.push("тем, кто чаще катается в парке и любит более живую доску");
  } else if (ridingStyle === "freeride") {
    scenarios.push("тем, кто чаще ищет стабильность на скорости и в мягком снегу");
  } else {
    scenarios.push("тем, кто ищет одну доску для трассы, парка и обычного катания");
  }

  if (boardLine === "women") {
    scenarios.push("райдерам, которые ищут женскую линейку без лишней жесткости");
  }

  if (shapeType === "directional" || shapeType === "tapered-directional") {
    scenarios.push("тем, кому важнее уверенность в дуге, чем чисто парковое ощущение");
  }

  if (sizes.some((size) => size.widthType !== "regular")) {
    scenarios.push("райдерам с ботинком, для которого важен дополнительный запас по ширине");
  }

  return scenarios.slice(0, 3);
}

export function buildNotIdealFor({ ridingStyle, shapeType }) {
  const items = [];

  if (ridingStyle === "freeride") {
    items.push("тем, кто хочет в первую очередь джиббить и много кататься в свиче");
  }

  if (ridingStyle === "park") {
    items.push("тем, кто ищет максимально спокойный вариант для скорости и длинной дуги");
  }

  if (shapeType === "directional" || shapeType === "tapered-directional") {
    items.push("тем, кому нужен максимально симметричный характер доски");
  }

  if (items.length === 0) {
    items.push("тем, кто хочет брать модель без примерки и без проверки размеров");
  }

  return items.slice(0, 3);
}

const styleLabels = {
  "all-mountain": "универсальная",
  park: "парковая",
  freeride: "фрирайдная",
};

const boardLineLabels = {
  men: "мужская",
  women: "женская",
  unisex: "универсальная",
};

const shapeLabels = {
  twin: "твин",
  "asym-twin": "асимметричный твин",
  "directional-twin": "направленный твин",
  directional: "направленная",
  "tapered-directional": "направленная с тейпером",
};

export function buildDescriptions(product) {
  const sizeSummary = summarizeSizeLabels(product.sizes);
  const waistSummary = getWaistRangeLabel(product.sizes);
  const styleLabel = styleLabels[product.ridingStyle];
  const boardLineLabel = boardLineLabels[product.boardLine];
  const shapeLabel = product.shapeType ? shapeLabels[product.shapeType] : "форма уточняется";
  const flexLabel = product.flex ? `Жесткость около ${product.flex} из 10.` : "";

  return {
    descriptionShort: `${boardLineLabel} ${styleLabel} модель из каталога ${product.sourceName?.toLowerCase() || "магазина"} с размерами ${sizeSummary}.`,
    descriptionFull: `${product.brand} ${product.modelName} — ${boardLineLabel} ${styleLabel} доска. В карточке магазина указаны размеры ${sizeSummary}, талия ${waistSummary} и ${shapeLabel}. ${flexLabel}`.trim(),
  };
}

export function hasWeightData(size) {
  return size.recommendedWeightMin > 0 || size.recommendedWeightMax != null;
}

export function getProductCompletenessScore(product) {
  const sizes = Array.isArray(product.sizes) ? product.sizes : [];

  return (
    sizes.length * 10 +
    sizes.filter(hasWeightData).length * 8 +
    Number(Boolean(product.shapeType)) * 4 +
    Number(Boolean(product.flex)) * 3 +
    Number(product.isActive) * 3
  );
}

function getImportedIdentityMetadata(product) {
  const importMeta = product?.importMeta ?? {};

  return {
    storeCode: normalizeWhitespace(importMeta.storeCode) || null,
    sourceProductId: normalizeWhitespace(importMeta.sourceProductId) || null,
    boardLineEvidence:
      importMeta.boardLineEvidence === "known" ? "known" : "missing",
    variantMarker: normalizeWhitespace(importMeta.variantMarker) || null,
  };
}

function assertCompatibleImportedProducts(left, right) {
  const leftIdentity = getImportedIdentityMetadata(left);
  const rightIdentity = getImportedIdentityMetadata(right);
  const conflicts = [];

  if (
    leftIdentity.storeCode &&
    leftIdentity.storeCode === rightIdentity.storeCode &&
    leftIdentity.sourceProductId &&
    rightIdentity.sourceProductId &&
    leftIdentity.sourceProductId !== rightIdentity.sourceProductId
  ) {
    conflicts.push("same store has different merchant product IDs");
  }

  if (
    leftIdentity.boardLineEvidence === "known" &&
    rightIdentity.boardLineEvidence === "known" &&
    left.boardLine !== right.boardLine
  ) {
    conflicts.push(`known board lines differ (${left.boardLine}/${right.boardLine})`);
  } else if (
    leftIdentity.sourceProductId !== rightIdentity.sourceProductId &&
    (leftIdentity.boardLineEvidence !== "known" ||
      rightIdentity.boardLineEvidence !== "known")
  ) {
    conflicts.push("board-line evidence is missing for an ambiguous identity");
  }

  const leftSeason = normalizeWhitespace(left.seasonLabel);
  const rightSeason = normalizeWhitespace(right.seasonLabel);
  if (leftSeason && rightSeason && leftSeason !== rightSeason) {
    conflicts.push(`known seasons differ (${leftSeason}/${rightSeason})`);
  }

  if (leftIdentity.variantMarker !== rightIdentity.variantMarker) {
    conflicts.push(
      `explicit variants differ (${leftIdentity.variantMarker ?? "base"}/${rightIdentity.variantMarker ?? "base"})`,
    );
  }

  if (conflicts.length > 0) {
    throw new Error(
      `Refusing to merge incompatible source offers for ${left.slug || right.slug}: ${conflicts.join("; ")}.`,
    );
  }
}

function getCommerceOwner(products) {
  return [...products].sort((left, right) => {
    if (left.isActive !== right.isActive) {
      return Number(right.isActive) - Number(left.isActive);
    }

    const leftHasPrice = Number.isFinite(left.priceFrom) && left.priceFrom > 0;
    const rightHasPrice = Number.isFinite(right.priceFrom) && right.priceFrom > 0;
    if (leftHasPrice !== rightHasPrice) {
      return Number(rightHasPrice) - Number(leftHasPrice);
    }

    if (leftHasPrice && rightHasPrice && left.priceFrom !== right.priceFrom) {
      return left.priceFrom - right.priceFrom;
    }

    const completenessDifference =
      getProductCompletenessScore(right) - getProductCompletenessScore(left);
    if (completenessDifference !== 0) {
      return completenessDifference;
    }

    const leftIdentity = getImportedIdentityMetadata(left);
    const rightIdentity = getImportedIdentityMetadata(right);
    return [leftIdentity.storeCode, leftIdentity.sourceProductId]
      .join("|")
      .localeCompare(
        [rightIdentity.storeCode, rightIdentity.sourceProductId].join("|"),
        "en",
        { numeric: true },
      );
  })[0];
}

export function mergeImportedProducts(left, right) {
  assertCompatibleImportedProducts(left, right);

  const leftSeasonRank = getSeasonRank(left.seasonLabel);
  const rightSeasonRank = getSeasonRank(right.seasonLabel);
  const leftScore = getProductCompletenessScore(left);
  const rightScore = getProductCompletenessScore(right);
  const seasonsDiffer =
    leftSeasonRank != null &&
    rightSeasonRank != null &&
    leftSeasonRank !== rightSeasonRank;

  let base = rightScore > leftScore ? right : left;
  if (seasonsDiffer) {
    base = rightSeasonRank > leftSeasonRank ? right : left;
  }

  const secondary = base === left ? right : left;
  const commerceOwner = getCommerceOwner([left, right]);

  const baseMedia = [base.imageUrl, ...(base.galleryImages ?? [])]
    .map((image) => String(image ?? "").trim())
    .filter(Boolean);
  const secondaryMedia = seasonsDiffer
    ? []
    : [secondary.imageUrl, ...(secondary.galleryImages ?? [])]
        .map((image) => String(image ?? "").trim())
        .filter(Boolean);
  const mergedGalleryImages = Array.from(new Set([...baseMedia, ...secondaryMedia]));

  return {
    ...base,
    seasonLabel: base.seasonLabel?.trim() || secondary.seasonLabel?.trim() || null,
    sizes: Array.isArray(commerceOwner.sizes) ? commerceOwner.sizes : [],
    priceFrom: commerceOwner.priceFrom,
    affiliateUrl: commerceOwner.affiliateUrl,
    isActive: commerceOwner.isActive,
    importMeta: commerceOwner.importMeta,
    imageUrl: mergedGalleryImages[0] || base.imageUrl || secondary.imageUrl,
    galleryImages: mergedGalleryImages.slice(1),
  };
}

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
  return normalizeWhitespace(sizeLabel).toLowerCase().replace(/\s+/gu, "");
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

export function mergeImportedProducts(left, right) {
  const leftScore = getProductCompletenessScore(left);
  const rightScore = getProductCompletenessScore(right);
  const base = rightScore > leftScore ? right : left;
  const secondary = base === left ? right : left;

  const positivePrices = [left.priceFrom, right.priceFrom].filter(
    (price) => Number.isFinite(price) && price > 0,
  );

  const activeOffer =
    [left, right]
      .filter((product) => product.isActive)
      .sort((a, b) => (a.priceFrom || Number.MAX_SAFE_INTEGER) - (b.priceFrom || Number.MAX_SAFE_INTEGER))[0] ??
    base;

  return {
    ...base,
    priceFrom:
      positivePrices.length > 0 ? Math.min(...positivePrices) : base.priceFrom,
    affiliateUrl: activeOffer.affiliateUrl || base.affiliateUrl,
    isActive: left.isActive || right.isActive,
    imageUrl: base.imageUrl || secondary.imageUrl,
  };
}

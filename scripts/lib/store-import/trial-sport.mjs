import { strFromU8, unzipSync } from "fflate";
import {
  buildDescriptions,
  buildNotIdealFor,
  buildScenarios,
  classifyWidthType,
  decodeHtml,
  mapBoardLineFromText,
  mapRidingStyle,
  mapShapeType,
  mapSkillLevel,
  normalizeBoardKey,
  normalizeSizeKey,
  normalizeWhitespace,
  parseFloatNumber,
  parseFlexNumber,
  parseSeasonLabel,
  parseSizeCm,
  slugifyBoard,
  stripHtml,
  toAbsoluteUrl,
} from "./common.mjs";

const TRIAL_BASE_URL = "https://trial-sport.ru";
const TRIAL_SECTION_URL =
  `${TRIAL_BASE_URL}/gds.php?s=51526&c1=1070639&c2=1078224&gpp=100`;

function isReliableTrialSize(sizeCm, waistWidthMm) {
  if (!Number.isFinite(sizeCm) || !Number.isFinite(waistWidthMm)) {
    return false;
  }

  if (sizeCm >= 100) {
    return true;
  }

  return waistWidthMm < 235;
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
    const waistWidthMm = Math.round(parseFloatNumber(row.H) ?? Number.NaN);

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

function extractTrialJsonArray(htmlText, variableName) {
  const pattern = new RegExp(
    `(?:const|let|var)\\s+${variableName}\\s*=\\s*(\\[[\\s\\S]*?\\])\\s*;?\\s*<\\/script>`,
    "u",
  );
  const match = htmlText.match(pattern);
  if (!match) {
    return [];
  }

  try {
    return JSON.parse(match[1]);
  } catch {
    return [];
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
    parseSeasonLabel(stripHtml(h1Match?.[1] ?? "")) ??
    parseSeasonLabel(stripHtml(titleMatch?.[1] ?? "")) ??
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

function buildTrialProduct(productUrl, htmlText, specMap, checkedAt) {
  const brand = extractTrialBrand(htmlText);
  const modelName = extractTrialModelName(htmlText, brand);

  if (!brand || !modelName) {
    return null;
  }

  const specGroup = findTrialSpecGroup(specMap, modelName);
  if (!specGroup) {
    return null;
  }

  const icspEntries = extractTrialJsonArray(htmlText, "icspJS");
  const availableEntries = icspEntries.filter(isTrialEntryAvailable);
  const sizes = mergeTrialSizes(specGroup, icspEntries, modelName);

  if (sizes.length === 0 || availableEntries.length === 0) {
    return null;
  }

  const flex = specGroup.flex || 5;
  const ridingStyle = mapRidingStyle(specGroup.purpose);
  const shapeType = mapShapeType(specGroup.shape);
  const descriptionText = extractTrialDescription(htmlText, brand);
  const imageUrls = extractTrialImageUrls(htmlText);
  const seasonLabel = extractTrialSeasonLabel(htmlText);
  const boardLine = mapBoardLineFromText(descriptionText);
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
      storeName: "Триал-Спорт",
    },
  };

  const descriptions = buildDescriptions(product);

  return {
    ...product,
    descriptionShort: descriptions.descriptionShort,
    descriptionFull:
      descriptionText && descriptionText.length > 80
        ? normalizeWhitespace(`${descriptions.descriptionFull} ${descriptionText}`)
        : descriptions.descriptionFull,
    scenarios: buildScenarios(product),
    notIdealFor: buildNotIdealFor(product),
  };
}

export async function importTrialSportProducts({
  fetchArrayBuffer,
  fetchText,
  concurrency = 12,
  limit = null,
  logger = console,
  checkedAt,
}) {
  const firstPageHtml = await fetchText(TRIAL_SECTION_URL);
  const maxPage = extractTrialPageCount(firstPageHtml);
  const listingUrls = Array.from({ length: maxPage }, (_, index) =>
    `${TRIAL_SECTION_URL}&pg=${index + 1}`,
  );

  const productUrls = new Set(extractTrialProductUrls(firstPageHtml));

  for (const listingUrl of listingUrls.slice(1)) {
    const html = await fetchText(listingUrl);
    for (const productUrl of extractTrialProductUrls(html)) {
      productUrls.add(productUrl);
    }
  }

  const workbookCache = new Map();
  const queue = Array.from(productUrls).sort((left, right) =>
    left.localeCompare(right, "ru"),
  ).slice(
    0,
    Number.isFinite(limit) && limit > 0 ? limit : undefined,
  );
  const results = [];
  const warnings = [];
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length) {
      const currentIndex = cursor;
      cursor += 1;

      const productUrl = queue[currentIndex];

      try {
        const htmlText = await fetchText(productUrl);
        const specUrl = extractTrialSpecUrl(htmlText);

        if (!specUrl) {
          warnings.push(`Триал-Спорт: нет файла характеристик у ${productUrl}`);
          continue;
        }

        let specMapPromise = workbookCache.get(specUrl);
        if (!specMapPromise) {
          specMapPromise = (async () => {
            const workbookBytes = await fetchArrayBuffer(specUrl);
            return buildTrialSpecMap(workbookBytes);
          })();
          workbookCache.set(specUrl, specMapPromise);
        }

        const specMap = await specMapPromise;

        const product = buildTrialProduct(productUrl, htmlText, specMap, checkedAt);
        if (product) {
          results.push(product);
        } else {
          warnings.push(`Триал-Спорт: не удалось собрать карточку для ${productUrl}`);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "неизвестная ошибка";
        warnings.push(`Триал-Спорт: ошибка обработки ${productUrl}: ${message}`);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  logger.log(
    `Триал-Спорт: найдено URL товаров ${queue.length}, импортировано ${results.length}.`,
  );

  return {
    products: results,
    warnings,
  };
}

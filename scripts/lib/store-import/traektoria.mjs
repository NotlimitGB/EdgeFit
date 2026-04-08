import {
  buildDescriptions,
  buildNotIdealFor,
  buildScenarios,
  classifyWidthType,
  mapBoardLineFromText,
  mapRidingStyle,
  mapShapeType,
  mapSkillLevel,
  normalizeWhitespace,
  parseFlexNumber,
  parseSizeCm,
  parseWeightRange,
  slugifyBoard,
  stripHtml,
  toAbsoluteUrl,
} from "./common.mjs";

const TRAEKTORIA_BASE_URL = "https://www.traektoria.ru";
const TRAEKTORIA_SECTION_API_URL =
  `${TRAEKTORIA_BASE_URL}/slim/pages/section/snowboard/boards/?SITE_ID=lid`;

function extractProductId(productUrl) {
  const match = productUrl.match(/\/product\/(\d+)_/u);
  return match?.[1] ?? null;
}

function parseTraektoriaSizeTable(gridSizeHtml) {
  const tableHtml = String(gridSizeHtml ?? "");
  if (!tableHtml.trim()) {
    return [];
  }

  const rows = Array.from(
    tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/giu),
    (match) =>
      Array.from(
        match[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/giu),
        (cellMatch) => stripHtml(cellMatch[1]),
      ),
  ).filter((cells) => cells.length > 0);

  if (rows.length < 2) {
    return [];
  }

  const header = rows[0].slice(1);
  const sizesByLabel = new Map(
    header.map((sizeLabel) => [
      normalizeWhitespace(sizeLabel),
      {
        sizeLabel: normalizeWhitespace(sizeLabel),
        sizeCm: parseSizeCm(sizeLabel),
        waistWidthMm: null,
        recommendedWeightMin: 0,
        recommendedWeightMax: null,
      },
    ]),
  );

  for (const row of rows.slice(1)) {
    const rowLabel = normalizeWhitespace(row[0]).toLowerCase();
    const values = row.slice(1);

    header.forEach((sizeLabel, index) => {
      const item = sizesByLabel.get(normalizeWhitespace(sizeLabel));
      const value = values[index];

      if (!item || !value) {
        return;
      }

      if (rowLabel.includes("вес райдера")) {
        const weightRange = parseWeightRange(value);
        item.recommendedWeightMin = weightRange.min;
        item.recommendedWeightMax = weightRange.max;
      }

      if (rowLabel.includes("ширина талии")) {
        const waistWidth = Number.parseInt(value.replace(/[^\d]/gu, ""), 10);
        if (Number.isFinite(waistWidth)) {
          item.waistWidthMm = waistWidth;
        }
      }
    });
  }

  return Array.from(sizesByLabel.values())
    .filter((size) => Number.isFinite(size.sizeCm) && Number.isFinite(size.waistWidthMm))
    .map((size) => ({
      sizeCm: size.sizeCm,
      sizeLabel: size.sizeLabel,
      waistWidthMm: size.waistWidthMm,
      recommendedWeightMin: size.recommendedWeightMin,
      recommendedWeightMax: size.recommendedWeightMax,
      widthType: classifyWidthType(size.waistWidthMm),
    }))
    .sort((left, right) => left.sizeCm - right.sizeCm);
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

function buildTraektoriaProduct(productUrl, productPayload, checkedAt) {
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
  const sizes = parseTraektoriaSizeTable(content.grid_size_html);

  if (sizes.length === 0) {
    return null;
  }

  const brand = normalizeWhitespace(model.brand?.name || props.name.split(" ")[0]);
  const modelName = normalizeWhitespace(props.model_name || props.name.replace(brand, ""));
  const slug = slugifyBoard(`${brand} ${modelName}`);
  const shapeType = mapShapeType(filterMap.get("SHAPE"));
  const flex = getFlexFromTraektoriaProduct(model, content.descriptions, filterMap);
  const ridingStyle = mapRidingStyle(filterMap.get("RIDING_STYLE"));
  const boardLine = mapBoardLineFromText(props.gender);
  const skillLevel = mapSkillLevel({
    levelText: filterMap.get("LEVEL"),
    flex,
  });
  const selectedSku = content.selected_sku ?? {};
  const skuPrices = model.sku_list
    .flatMap((skuGroup) => skuGroup.sizes ?? [])
    .map((sku) => sku.retail_price || sku.base_price)
    .filter((price) => Number.isFinite(price) && price > 0);
  const priceFrom =
    skuPrices.length > 0
      ? Math.min(...skuPrices)
      : selectedSku.retail_price || selectedSku.base_price || 0;

  const imageUrl = toAbsoluteUrl(
    TRAEKTORIA_BASE_URL,
    model.photo_list?.[0]?.url_resize || model.photo_list?.[0]?.url || "",
  );

  const product = {
    slug,
    brand,
    modelName,
    descriptionShort: "",
    descriptionFull: "",
    ridingStyle,
    skillLevel,
    flex,
    priceFrom,
    imageUrl,
    affiliateUrl: productUrl,
    isActive: true,
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

export async function importTraektoriaProducts({
  fetchJson,
  concurrency = 8,
  limit = null,
  logger = console,
  checkedAt,
}) {
  const firstPagePayload = await fetchJson(TRAEKTORIA_SECTION_API_URL);
  const firstPageContent = firstPagePayload?.data?.MAIN?.content;
  const pageCount = Number(firstPageContent?.navigation?.data?.page_count ?? 1);
  const productUrls = new Set(
    (firstPageContent?.products ?? [])
      .map((product) => product.url)
      .filter(Boolean)
      .map((url) => toAbsoluteUrl(TRAEKTORIA_BASE_URL, url.split("?")[0])),
  );

  for (let page = 2; page <= pageCount; page += 1) {
    const pagePayload = await fetchJson(
      `${TRAEKTORIA_SECTION_API_URL}&PAGEN_1=${page}`,
    );
    const pageProducts = pagePayload?.data?.MAIN?.content?.products ?? [];

    for (const product of pageProducts) {
      if (product?.url) {
        productUrls.add(
          toAbsoluteUrl(TRAEKTORIA_BASE_URL, String(product.url).split("?")[0]),
        );
      }
    }
  }

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
      const productId = extractProductId(productUrl);

      if (!productId) {
        warnings.push(`Не удалось выделить id товара: ${productUrl}`);
        continue;
      }

      try {
        const payload = await fetchJson(
          `${TRAEKTORIA_BASE_URL}/slim/pages/product/${productId}/?SITE_ID=lid`,
        );

        const product = buildTraektoriaProduct(productUrl, payload, checkedAt);
        if (product) {
          results.push(product);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "неизвестная ошибка";
        warnings.push(`Траектория: не удалось обработать ${productUrl}: ${message}`);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  logger.log(`Траектория: найдено URL товаров ${queue.length}, импортировано ${results.length}.`);

  return {
    products: results,
    warnings,
  };
}

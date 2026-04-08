import { parse } from "csv-parse/sync";

const allowedRidingStyles = new Set(["all-mountain", "park", "freeride"]);
const allowedSkillLevels = new Set(["beginner", "intermediate", "advanced"]);
const allowedWidthTypes = new Set(["regular", "mid-wide", "wide"]);
const allowedBoardLines = new Set(["men", "women", "unisex"]);
const allowedShapeTypes = new Set([
  "twin",
  "asym-twin",
  "directional-twin",
  "directional",
  "tapered-directional",
]);
const allowedDataStatuses = new Set(["draft", "verified"]);

function normalizeText(value) {
  return String(value ?? "").trim();
}

function readRequiredText(value, fieldName, context) {
  const text = normalizeText(value);

  if (!text) {
    throw new Error(`Поле "${fieldName}" не должно быть пустым: ${context}`);
  }

  return text;
}

function detectDelimiter(text) {
  const firstLine = text
    .split(/\r?\n/u)
    .find((line) => line.trim().length > 0);

  if (!firstLine) {
    return ";";
  }

  const semicolonCount = (firstLine.match(/;/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;

  return semicolonCount >= commaCount ? ";" : ",";
}

function parseCsvText(text) {
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
    delimiter: detectDelimiter(text),
  });
}

function splitList(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

function toBoolean(value) {
  const normalizedValue = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "да"].includes(normalizedValue);
}

function readNumber(value, fieldName, context) {
  const numberValue = Number(String(value ?? "").replace(",", "."));

  if (!Number.isFinite(numberValue)) {
    throw new Error(`Поле "${fieldName}" должно быть числом: ${context}`);
  }

  return numberValue;
}

function readOptionalNumber(value, fieldName, context) {
  const text = normalizeText(value);

  if (!text) {
    return null;
  }

  return readNumber(text, fieldName, context);
}

function ensureValue(allowedValues, value, fieldName, context) {
  if (!allowedValues.has(value)) {
    throw new Error(`Недопустимое значение "${value}" в поле "${fieldName}": ${context}`);
  }
}

function readOptionalText(value) {
  const text = normalizeText(value);
  return text || null;
}

function readOptionalUrl(value, fieldName, context) {
  const text = readOptionalText(value);

  if (!text) {
    return null;
  }

  try {
    return new URL(text).toString();
  } catch {
    throw new Error(`Поле "${fieldName}" должно быть корректной ссылкой: ${context}`);
  }
}

function readOptionalDate(value, fieldName, context) {
  const text = readOptionalText(value);

  if (!text) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/u.test(text)) {
    throw new Error(`Поле "${fieldName}" должно быть в формате ГГГГ-ММ-ДД: ${context}`);
  }

  return text;
}

export function buildCatalogProducts(modelRows, sizeRows) {
  if (modelRows.length === 0) {
    throw new Error('Файл моделей пустой. Добавьте хотя бы одну строку с полем "slug".');
  }

  if (sizeRows.length === 0) {
    throw new Error('Файл размеров пустой. Добавьте хотя бы одну строку с полем "product_slug".');
  }

  const sizesBySlug = new Map();

  for (const row of sizeRows) {
    const slug = readRequiredText(row.product_slug, "product_slug", "файл размеров");
    const context = `модель ${slug}`;
    const widthType = readRequiredText(row.width_type, "width_type", context);

    ensureValue(allowedWidthTypes, widthType, "width_type", context);

    const size = {
      sizeCm: readNumber(row.size_cm, "size_cm", context),
      sizeLabel: readOptionalText(row.size_label),
      waistWidthMm: readNumber(row.waist_width_mm, "waist_width_mm", context),
      recommendedWeightMin: readNumber(
        row.recommended_weight_min,
        "recommended_weight_min",
        context,
      ),
      recommendedWeightMax: readOptionalNumber(
        row.recommended_weight_max,
        "recommended_weight_max",
        context,
      ),
      widthType,
    };

    const sizes = sizesBySlug.get(slug) ?? [];
    sizes.push(size);
    sizesBySlug.set(slug, sizes);
  }

  return modelRows.map((row) => {
    const slug = readRequiredText(row.slug, "slug", "файл моделей");
    const context = `модель ${slug}`;
    const ridingStyle = readRequiredText(row.riding_style, "riding_style", context);
    const skillLevel = readRequiredText(row.skill_level, "skill_level", context);
    const boardLine = readRequiredText(row.board_line, "board_line", context);
    const shapeType = readOptionalText(row.shape_type);

    ensureValue(allowedRidingStyles, ridingStyle, "riding_style", context);
    ensureValue(allowedSkillLevels, skillLevel, "skill_level", context);
    ensureValue(allowedBoardLines, boardLine, "board_line", context);
    if (shapeType) {
      ensureValue(allowedShapeTypes, shapeType, "shape_type", context);
    }

    const dataStatus = readOptionalText(row.data_status) ?? "draft";
    ensureValue(allowedDataStatuses, dataStatus, "data_status", context);

    const sourceName = readOptionalText(row.source_name);
    const sourceUrl = readOptionalUrl(row.source_url, "source_url", context);
    const sourceCheckedAt = readOptionalDate(
      row.source_checked_at,
      "source_checked_at",
      context,
    );

    if (dataStatus === "verified" && (!sourceName || !sourceUrl)) {
      throw new Error(
        `Для модели "${slug}" со статусом verified нужно указать source_name и source_url.`,
      );
    }

    const sizes = sizesBySlug.get(slug) ?? [];

    if (sizes.length === 0) {
      throw new Error(`Для модели "${slug}" не найдено ни одного размера в файле sizes.csv.`);
    }

    return {
      slug,
      brand: readRequiredText(row.brand, "brand", context),
      modelName: readRequiredText(row.model_name, "model_name", context),
      descriptionShort: readRequiredText(
        row.description_short,
        "description_short",
        context,
      ),
      descriptionFull: readRequiredText(
        row.description_full,
        "description_full",
        context,
      ),
      ridingStyle,
      skillLevel,
      flex: readNumber(row.flex, "flex", context),
      priceFrom: readNumber(row.price_from, "price_from", context),
      imageUrl: readRequiredText(row.image_url, "image_url", context),
      affiliateUrl: readRequiredText(row.affiliate_url, "affiliate_url", context),
      isActive: toBoolean(row.is_active),
      boardLine,
      shapeType,
      dataStatus,
      sourceName,
      sourceUrl,
      sourceCheckedAt,
      scenarios: splitList(row.scenarios),
      notIdealFor: splitList(row.not_ideal_for),
      sizes: sizes.sort((left, right) => {
        if (left.sizeCm !== right.sizeCm) {
          return left.sizeCm - right.sizeCm;
        }

        return String(left.sizeLabel ?? "").localeCompare(
          String(right.sizeLabel ?? ""),
          "ru",
        );
      }),
    };
  });
}

export function parseCatalogCsvTexts(modelsCsvText, sizesCsvText) {
  const modelRows = parseCsvText(modelsCsvText);
  const sizeRows = parseCsvText(sizesCsvText);

  return buildCatalogProducts(modelRows, sizeRows);
}

export function countCatalogSizes(products) {
  return products.reduce((total, product) => total + product.sizes.length, 0);
}

import postgres from "postgres";
import http from "node:http";
import https from "node:https";
import { upsertCatalogProducts } from "./lib/upsert-boards.mjs";
import {
  mergeImportedProducts,
  normalizeBoardKey,
  normalizeWhitespace,
} from "./lib/store-import/common.mjs";
import { importTraektoriaProducts } from "./lib/store-import/traektoria.mjs";
import { importTrialSportProducts } from "./lib/store-import/trial-sport.mjs";

const databaseUrl = process.env.DATABASE_URL;
const sslMode = process.env.DATABASE_SSL === "disable" ? false : "require";
const checkedAt = new Date().toISOString().slice(0, 10);
const sourceFilter = String(process.env.STORE_IMPORT_SOURCE ?? "all").trim().toLowerCase();
const importLimit = Number.parseInt(process.env.STORE_IMPORT_LIMIT ?? "", 10);

if (!databaseUrl) {
  console.error("Не задана переменная DATABASE_URL в .env.local");
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  ssl: sslMode,
  prepare: false,
  max: 1,
});

let productColumnSupport = null;

function normalizeGalleryImages(value) {
  const rawImages =
    typeof value === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : Array.isArray(value)
        ? value
        : [];

  return rawImages
    .map((image) => String(image ?? "").trim())
    .filter(Boolean);
}

function hasImportLimit() {
  return Number.isFinite(importLimit) && importLimit > 0;
}

function isPlaceholderAffiliateLink(url) {
  return /example\.(com|org|net)/iu.test(String(url ?? ""));
}

function isPreferredStoreLink(url) {
  try {
    const hostname = new URL(String(url ?? "")).hostname.toLowerCase();
    return [
      "trial-sport.ru",
      "www.trial-sport.ru",
      "traektoria.ru",
      "www.traektoria.ru",
    ].includes(hostname);
  } catch {
    return false;
  }
}

function buildTrialSportSearchLink(product) {
  const searchParams = new URLSearchParams({
    q: normalizeWhitespace(`${product.brand} ${product.modelName}`),
  });

  return `https://trial-sport.ru/search/?${searchParams.toString()}`;
}

function isLocalCatalogPlaceholderImage(url) {
  return String(url ?? "").trim().startsWith("/boards/");
}

function hasCuratedVerifiedMedia(product) {
  return [product.imageUrl, ...(product.galleryImages ?? [])]
    .map((image) => String(image ?? "").trim())
    .filter(Boolean)
    .some((image) => !isLocalCatalogPlaceholderImage(image));
}

function getComparableProductKey(brand, modelName) {
  const normalizedModelName = normalizeWhitespace(modelName)
    .replace(/\b2(?:[.\- ]?0)\b/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  return normalizeBoardKey(`${brand} ${normalizedModelName}`);
}

async function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function requestBuffer(url, headers, redirectDepth = 0) {
  const targetUrl = new URL(url);
  const transport = targetUrl.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.request(
      targetUrl,
      {
        method: "GET",
        headers,
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;

        if (
          statusCode >= 300 &&
          statusCode < 400 &&
          response.headers.location &&
          redirectDepth < 5
        ) {
          resolve(
            requestBuffer(
              new URL(response.headers.location, targetUrl).toString(),
              headers,
              redirectDepth + 1,
            ),
          );
          response.resume();
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`HTTP ${statusCode}`));
          response.resume();
          return;
        }

        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
      },
    );

    request.on("error", reject);
    request.end();
  });
}

async function fetchWithRetries(url, headers, parseBuffer) {
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const buffer = await requestBuffer(url, headers);
      return parseBuffer(buffer);
    } catch (error) {
      lastError = error;

      if (attempt < 3) {
        await wait(attempt * 700);
      }
    }
  }

  throw lastError;
}

async function fetchText(url) {
  return fetchWithRetries(
    url,
    {
      "user-agent": "EdgeFitBot/1.0 (+https://edgefit.local)",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    (buffer) => buffer.toString("utf8"),
  );
}

async function fetchJson(url) {
  return fetchWithRetries(
    url,
    {
      "user-agent": "EdgeFitBot/1.0 (+https://edgefit.local)",
      accept: "application/json,text/plain,*/*",
      "x-requested-with": "XMLHttpRequest",
    },
    (buffer) => JSON.parse(buffer.toString("utf8")),
  );
}

async function fetchArrayBuffer(url) {
  return fetchWithRetries(
    url,
    {
      "user-agent": "EdgeFitBot/1.0 (+https://edgefit.local)",
      accept: "*/*",
    },
    (buffer) => buffer,
  );
}

async function getProductColumnSupport() {
  if (productColumnSupport) {
    return productColumnSupport;
  }

  const rows = await sql`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and (
        (
          table_name = 'products'
          and column_name in ('season_label', 'gallery_images')
        )
        or (
          table_name = 'product_sizes'
          and column_name in ('size_label', 'is_available')
        )
      )
  `;

  const productColumns = new Set(
    rows
      .filter((row) => row.table_name === "products")
      .map((row) => row.column_name),
  );
  const sizeColumns = new Set(
    rows
      .filter((row) => row.table_name === "product_sizes")
      .map((row) => row.column_name),
  );

  productColumnSupport = {
    hasSeasonLabel: productColumns.has("season_label"),
    hasGalleryImages: productColumns.has("gallery_images"),
    hasSizeLabel: sizeColumns.has("size_label"),
    hasSizeAvailable: sizeColumns.has("is_available"),
  };

  return productColumnSupport;
}

async function loadExistingCatalog() {
  const { hasSeasonLabel, hasGalleryImages, hasSizeLabel, hasSizeAvailable } = await getProductColumnSupport();
  const seasonLabelSelect = hasSeasonLabel
    ? sql.unsafe("p.season_label")
    : sql.unsafe("null::text");
  const galleryImagesSelect = hasGalleryImages
    ? sql.unsafe("p.gallery_images")
    : sql.unsafe("'[]'::jsonb");
  const sizeLabelSelect = hasSizeLabel
    ? sql.unsafe("ps.size_label")
    : sql.unsafe("null::text");
  const sizeAvailableSelect = hasSizeAvailable
    ? sql.unsafe("ps.is_available")
    : sql.unsafe("true");

  const rows = await sql`
    select
      p.id::text as "id",
      p.slug as "slug",
      p.brand as "brand",
      p.model_name as "modelName",
      ${seasonLabelSelect} as "seasonLabel",
      p.description_short as "descriptionShort",
      p.description_full as "descriptionFull",
      p.riding_style as "ridingStyle",
      p.skill_level as "skillLevel",
      p.flex as "flex",
      p.price_from as "priceFrom",
      p.image_url as "imageUrl",
      ${galleryImagesSelect} as "galleryImages",
      p.affiliate_url as "affiliateUrl",
      p.is_active as "isActive",
      p.board_line as "boardLine",
      p.shape_type as "shapeType",
      p.data_status as "dataStatus",
      p.source_name as "sourceName",
      p.source_url as "sourceUrl",
      p.source_checked_at::text as "sourceCheckedAt",
      p.scenarios as "scenarios",
      p.not_ideal_for as "notIdealFor",
      coalesce(
        json_agg(
          json_build_object(
            'sizeCm', ps.size_cm::float8,
            'sizeLabel', ${sizeLabelSelect},
            'waistWidthMm', ps.waist_width_mm,
            'recommendedWeightMin', ps.recommended_weight_min,
            'recommendedWeightMax', ps.recommended_weight_max,
            'widthType', ps.width_type,
            'isAvailable', ${sizeAvailableSelect}
          )
          order by ps.size_cm
        ) filter (where ps.id is not null),
        '[]'::json
      ) as "sizes"
    from products p
    left join product_sizes ps on ps.product_id = p.id
    group by p.id
  `;

  return new Map(
    rows.map((row) => [
      row.slug,
      {
        ...row,
        flex: Number(row.flex),
        priceFrom: Number(row.priceFrom),
        galleryImages: normalizeGalleryImages(row.galleryImages),
        scenarios: Array.isArray(row.scenarios) ? row.scenarios : [],
        notIdealFor: Array.isArray(row.notIdealFor) ? row.notIdealFor : [],
        sizes: Array.isArray(row.sizes)
          ? row.sizes.map((size) => ({
              sizeCm: Number(size.sizeCm),
              sizeLabel: size.sizeLabel?.trim() || null,
              waistWidthMm: Number(size.waistWidthMm),
              recommendedWeightMin: Number(size.recommendedWeightMin),
              recommendedWeightMax:
                size.recommendedWeightMax == null
                  ? null
                  : Number(size.recommendedWeightMax),
              widthType: size.widthType,
              isAvailable: size.isAvailable !== false,
            }))
          : [],
      },
    ]),
  );
}

function mergeWithExistingProduct(existingProduct, importedProduct) {
  if (!existingProduct) {
    return importedProduct;
  }

  if (existingProduct.dataStatus !== "verified") {
    return importedProduct;
  }

  const mergedGalleryImages = Array.from(
    new Set(
      [
        existingProduct.imageUrl,
        ...(existingProduct.galleryImages ?? []),
        importedProduct.imageUrl,
        ...(importedProduct.galleryImages ?? []),
      ]
        .map((image) => String(image ?? "").trim())
        .filter(Boolean),
    ),
  );

  const keepVerifiedMedia = hasCuratedVerifiedMedia(existingProduct);
  const shouldUseImportedStoreLink =
    Boolean(importedProduct.affiliateUrl?.trim()) &&
    importedProduct.isActive &&
    !isPlaceholderAffiliateLink(importedProduct.affiliateUrl);

  return {
    ...existingProduct,
    sizes:
      Array.isArray(importedProduct.sizes) && importedProduct.sizes.length > 0
        ? importedProduct.sizes
        : existingProduct.sizes,
    priceFrom:
      importedProduct.priceFrom > 0
        ? importedProduct.priceFrom
        : existingProduct.priceFrom,
    affiliateUrl: shouldUseImportedStoreLink
      ? importedProduct.affiliateUrl
      : isPreferredStoreLink(existingProduct.affiliateUrl)
        ? existingProduct.affiliateUrl
        : buildTrialSportSearchLink(existingProduct),
    imageUrl: keepVerifiedMedia
      ? existingProduct.imageUrl
      : mergedGalleryImages[0] || existingProduct.imageUrl || importedProduct.imageUrl,
    galleryImages: keepVerifiedMedia
      ? existingProduct.galleryImages ?? []
      : mergedGalleryImages.slice(1),
    seasonLabel:
      existingProduct.seasonLabel?.trim() ||
      importedProduct.seasonLabel?.trim() ||
      null,
    isActive: importedProduct.isActive,
  };
}

function isManagedStoreProduct(product) {
  return product.sourceName === "Траектория" || product.sourceName === "Триал-Спорт";
}

function shouldSyncStoreProduct(product, currentSourceFilter) {
  if (currentSourceFilter === "all") {
    return isManagedStoreProduct(product);
  }

  if (currentSourceFilter === "traektoria") {
    return product.sourceName === "РўСЂР°РµРєС‚РѕСЂРёСЏ";
  }

  if (currentSourceFilter === "trial" || currentSourceFilter === "trial-sport") {
    return product.sourceName === "РўСЂРёР°Р»-РЎРїРѕСЂС‚";
  }

  return false;
}

function summarizeWarnings(warnings) {
  if (warnings.length === 0) {
    return;
  }

  console.warn(`Предупреждений при импорте: ${warnings.length}`);

  for (const warning of warnings.slice(0, 20)) {
    console.warn(`- ${warning}`);
  }

  if (warnings.length > 20) {
    console.warn(`... и ещё ${warnings.length - 20}`);
  }
}

async function cleanupBrokenTrialSportSizes(sqlClient) {
  const [result] = await sqlClient`
    with removed as (
      delete from product_sizes ps
      using products p
      where p.id = ps.product_id
        and p.affiliate_url like 'https://trial-sport.ru/%'
        and ps.size_cm < 100
        and ps.waist_width_mm >= 235
      returning ps.id
    )
    select count(*)::int as count from removed
  `;

  return result?.count ?? 0;
}

async function main() {
  await sql`set statement_timeout = 0`;
  const existingCatalog = await loadExistingCatalog();
  const existingComparableVerifiedProducts = new Map(
    Array.from(existingCatalog.values())
      .filter((product) => product.dataStatus === "verified")
      .map((product) => [
        getComparableProductKey(product.brand, product.modelName),
        product,
      ]),
  );
  const importedProducts = [];
  const warnings = [];

  if (sourceFilter === "all" || sourceFilter === "traektoria") {
    const result = await importTraektoriaProducts({
      fetchJson,
      fetchText,
      checkedAt,
      limit: hasImportLimit() ? importLimit : null,
      logger: console,
    });

    importedProducts.push(...result.products);
    warnings.push(...result.warnings);
  }

  if (sourceFilter === "all" || sourceFilter === "trial" || sourceFilter === "trial-sport") {
    const result = await importTrialSportProducts({
      fetchArrayBuffer,
      fetchText,
      checkedAt,
      limit: hasImportLimit() ? importLimit : null,
      logger: console,
    });

    importedProducts.push(...result.products);
    warnings.push(...result.warnings);
  }

  const mergedImportedProducts = new Map();

  for (const importedProduct of importedProducts) {
    const comparableProductKey = getComparableProductKey(
      importedProduct.brand,
      importedProduct.modelName,
    );
    const exactExistingProduct = existingCatalog.get(importedProduct.slug);
    const comparableVerifiedProduct =
      existingComparableVerifiedProducts.get(comparableProductKey);
    const mergeTargetProduct =
      comparableVerifiedProduct?.dataStatus === "verified"
        ? comparableVerifiedProduct
        : exactExistingProduct;
    const mergedSlug = mergeTargetProduct?.slug ?? importedProduct.slug;
    const normalizedImportedProduct =
      mergedSlug === importedProduct.slug
        ? importedProduct
        : {
            ...importedProduct,
            slug: mergedSlug,
          };
    const current = mergedImportedProducts.get(mergedSlug);
    mergedImportedProducts.set(
      mergedSlug,
      current
        ? mergeImportedProducts(current, normalizedImportedProduct)
        : normalizedImportedProduct,
    );
  }

  const preparedProducts = Array.from(mergedImportedProducts.values())
    .map((product) => mergeWithExistingProduct(existingCatalog.get(product.slug), product))
    .filter((product) => product.sizes.length > 0);

  const staleStoreProducts = Array.from(existingCatalog.values())
    .filter(
      (product) =>
        shouldSyncStoreProduct(product, sourceFilter) &&
        !mergedImportedProducts.has(product.slug),
    )
    .map((product) => ({
      ...product,
      isActive: false,
    }));

  const finalProducts = [...preparedProducts, ...staleStoreProducts];

  const summary = await upsertCatalogProducts(sql, finalProducts);
  const cleanedBrokenTrialSizes = await cleanupBrokenTrialSportSizes(sql);

  console.log(`Готово. Импортировано моделей: ${summary.importedModels}`);
  console.log(`Импортировано размеров: ${summary.importedSizes}`);
  console.log(`Удалено сломанных trial-размеров: ${cleanedBrokenTrialSizes}`);
  console.log(`Уникальных карточек после объединения: ${finalProducts.length}`);
  console.log(
    `Активных карточек после импорта: ${finalProducts.filter((product) => product.isActive).length}`,
  );
  console.log(
    `Черновых карточек после импорта: ${finalProducts.filter((product) => product.dataStatus === "draft").length}`,
  );

  summarizeWarnings(warnings);
}

try {
  await main();
} finally {
  await sql.end({ timeout: 1 });
}

import postgres from "postgres";
import http from "node:http";
import https from "node:https";
import { upsertCatalogProducts } from "./lib/upsert-boards.mjs";
import { mergeImportedProducts } from "./lib/store-import/common.mjs";
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

function hasImportLimit() {
  return Number.isFinite(importLimit) && importLimit > 0;
}

function isPlaceholderAffiliateLink(url) {
  return /example\.(com|org|net)/iu.test(String(url ?? ""));
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

async function loadExistingCatalog() {
  const rows = await sql`
    select
      p.id::text as "id",
      p.slug as "slug",
      p.brand as "brand",
      p.model_name as "modelName",
      p.description_short as "descriptionShort",
      p.description_full as "descriptionFull",
      p.riding_style as "ridingStyle",
      p.skill_level as "skillLevel",
      p.flex as "flex",
      p.price_from as "priceFrom",
      p.image_url as "imageUrl",
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
            'sizeLabel', ps.size_label,
            'waistWidthMm', ps.waist_width_mm,
            'recommendedWeightMin', ps.recommended_weight_min,
            'recommendedWeightMax', ps.recommended_weight_max,
            'widthType', ps.width_type
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

  if (existingProduct.dataStatus === "verified") {
    const shouldReplaceAffiliate =
      isPlaceholderAffiliateLink(existingProduct.affiliateUrl) ||
      (importedProduct.priceFrom > 0 &&
        (existingProduct.priceFrom <= 0 ||
          importedProduct.priceFrom < existingProduct.priceFrom));

    return {
      ...existingProduct,
      priceFrom:
        importedProduct.priceFrom > 0
          ? importedProduct.priceFrom
          : existingProduct.priceFrom,
      affiliateUrl: shouldReplaceAffiliate
        ? importedProduct.affiliateUrl
        : existingProduct.affiliateUrl,
      imageUrl: existingProduct.imageUrl || importedProduct.imageUrl,
      isActive: existingProduct.isActive || importedProduct.isActive,
    };
  }

  return mergeImportedProducts(existingProduct, importedProduct);
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

try {
  const existingCatalog = await loadExistingCatalog();
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
    const current = mergedImportedProducts.get(importedProduct.slug);
    mergedImportedProducts.set(
      importedProduct.slug,
      current ? mergeImportedProducts(current, importedProduct) : importedProduct,
    );
  }

  const preparedProducts = Array.from(mergedImportedProducts.values())
    .map((product) => mergeWithExistingProduct(existingCatalog.get(product.slug), product))
    .filter((product) => product.sizes.length > 0);

  const finalProducts = preparedProducts;

  const summary = await upsertCatalogProducts(sql, finalProducts);

  console.log(`Готово. Импортировано моделей: ${summary.importedModels}`);
  console.log(`Импортировано размеров: ${summary.importedSizes}`);
  console.log(`Уникальных карточек после объединения: ${finalProducts.length}`);
  console.log(
    `Активных карточек после импорта: ${finalProducts.filter((product) => product.isActive).length}`,
  );
  console.log(
    `Черновых карточек после импорта: ${finalProducts.filter((product) => product.dataStatus === "draft").length}`,
  );

  summarizeWarnings(warnings);
} finally {
  await sql.end({ timeout: 1 });
}

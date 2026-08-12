import postgres from "postgres";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { upsertCatalogProducts } from "./lib/upsert-boards.mjs";
import { normalizeCatalogWaistWidths } from "./lib/catalog-repair.mjs";
import {
  normalizeWhitespace,
} from "./lib/store-import/common.mjs";
import {
  buildSourceIdentityPlan,
  getStoreIdentityFromUrl,
} from "./lib/store-import/source-identity.mjs";
import {
  applyOfficialProductSpecs,
  loadOfficialProductSpecs,
} from "./lib/official-specs.mjs";
import { importTraektoriaProducts } from "./lib/store-import/traektoria.mjs";
import {
  importTrialSportProducts,
  revalidateTrialSportProducts,
} from "./lib/store-import/trial-sport.mjs";
import { fetchCatalogWithRetries } from "./lib/store-import/catalog-http.mjs";

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

function hasImportLimit(importLimit) {
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

function getManagedStoreCodeFromUrl(url) {
  try {
    const hostname = new URL(String(url ?? "")).hostname.toLowerCase();

    if (hostname === "traektoria.ru" || hostname === "www.traektoria.ru") {
      return "traektoria";
    }

    if (hostname === "trial-sport.ru" || hostname === "www.trial-sport.ru") {
      return "trial-sport";
    }
  } catch {
    return null;
  }

  return null;
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

export async function fetchText(url) {
  return fetchCatalogWithRetries(
    url,
    {
      "user-agent": "EdgeFitBot/1.0 (+https://edgefit.local)",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    (buffer) => buffer.toString("utf8"),
  );
}

export async function fetchJson(url) {
  return fetchCatalogWithRetries(
    url,
    {
      "user-agent": "EdgeFitBot/1.0 (+https://edgefit.local)",
      accept: "application/json,text/plain,*/*",
      "x-requested-with": "XMLHttpRequest",
    },
    (buffer) => JSON.parse(buffer.toString("utf8")),
  );
}

export async function fetchArrayBuffer(url) {
  return fetchCatalogWithRetries(
    url,
    {
      "user-agent": "EdgeFitBot/1.0 (+https://edgefit.local)",
      accept: "*/*",
    },
    (buffer) => buffer,
  );
}

async function getProductColumnSupport(sql, state) {
  if (state.productColumnSupport) {
    return state.productColumnSupport;
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

  state.productColumnSupport = {
    hasSeasonLabel: productColumns.has("season_label"),
    hasGalleryImages: productColumns.has("gallery_images"),
    hasSizeLabel: sizeColumns.has("size_label"),
    hasSizeAvailable: sizeColumns.has("is_available"),
  };

  return state.productColumnSupport;
}

export async function loadExistingCatalog(sql, state = { productColumnSupport: null }) {
  const {
    hasSeasonLabel,
    hasGalleryImages,
    hasSizeLabel,
    hasSizeAvailable,
  } = await getProductColumnSupport(sql, state);
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
      p.family_id::text as "familyId",
      p.family_member_role as "familyMemberRole",
      p.family_match_method as "familyMatchMethod",
      p.family_match_confidence as "familyMatchConfidence",
      p.family_manual_override as "familyManualOverride",
      p.family_match_reason as "familyMatchReason",
      p.family_matched_at::text as "familyMatchedAt",
      p.updated_at::text as "updatedAt",
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

  const hasIdentityConflict =
    existingProduct.boardLine !== importedProduct.boardLine ||
    (existingProduct.seasonLabel?.trim() &&
      importedProduct.seasonLabel?.trim() &&
      existingProduct.seasonLabel.trim() !== importedProduct.seasonLabel.trim());

  if (hasIdentityConflict) {
    return importedProduct;
  }

  const importedMedia = [
    importedProduct.imageUrl,
    ...(importedProduct.galleryImages ?? []),
  ]
    .map((image) => String(image ?? "").trim())
    .filter(Boolean);
  const rawExistingMedia = [
    existingProduct.imageUrl,
    ...(existingProduct.galleryImages ?? []),
  ]
    .map((image) => String(image ?? "").trim())
    .filter(Boolean);
  const existingHasCuratedMedia = rawExistingMedia.some(
    (image) => !isLocalCatalogPlaceholderImage(image),
  );
  const existingMedia = rawExistingMedia.filter(
    (image) => !existingHasCuratedMedia || !isLocalCatalogPlaceholderImage(image),
  );
  const mergedGalleryImages = Array.from(
    new Set([...importedMedia, ...existingMedia]),
  );

  const keepVerifiedMedia = hasCuratedVerifiedMedia(existingProduct);
  const hasImportedStoreLink =
    Boolean(importedProduct.affiliateUrl?.trim()) &&
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
    affiliateUrl: hasImportedStoreLink
      ? importedProduct.affiliateUrl
      : isPreferredStoreLink(existingProduct.affiliateUrl)
        ? existingProduct.affiliateUrl
        : buildTrialSportSearchLink(existingProduct),
    imageUrl: keepVerifiedMedia
      ? existingMedia[0] || existingProduct.imageUrl
      : mergedGalleryImages[0] || existingProduct.imageUrl || importedProduct.imageUrl,
    galleryImages: keepVerifiedMedia
      ? existingMedia.slice(1)
      : mergedGalleryImages.slice(1),
    seasonLabel:
      existingProduct.seasonLabel?.trim() ||
      importedProduct.seasonLabel?.trim() ||
      null,
    isActive: importedProduct.isActive,
  };
}

function isManagedStoreProduct(product) {
  return (
    product.sourceName === "Траектория" || product.sourceName === "Триал-Спорт"
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function shouldSyncStoreProduct(product, currentSourceFilter) {
  if (currentSourceFilter === "all") {
    return isManagedStoreProduct(product);
  }

  if (currentSourceFilter === "traektoria") {
    return product.sourceName === "Траектория";
  }

  if (currentSourceFilter === "trial" || currentSourceFilter === "trial-sport") {
    return product.sourceName === "Триал-Спорт";
  }

  return false;
}

function isManagedStoreCatalogProduct(product) {
  return Boolean(getManagedStoreCodeFromUrl(product.affiliateUrl));
}

function shouldSyncManagedStoreProduct(product, currentSourceFilter) {
  const managedStoreCode = getManagedStoreCodeFromUrl(product.affiliateUrl);

  if (currentSourceFilter === "all") {
    return isManagedStoreCatalogProduct(product);
  }

  if (currentSourceFilter === "traektoria") {
    return managedStoreCode === "traektoria";
  }

  if (currentSourceFilter === "trial" || currentSourceFilter === "trial-sport") {
    return managedStoreCode === "trial-sport";
  }

  return false;
}

export function assertTrialSportSourceComplete(diagnostics) {
  if (!diagnostics || diagnostics.complete !== true) {
    throw new Error("INCOMPLETE_TRIAL_SPORT_SOURCE");
  }
}

function toProductValues(products) {
  if (products instanceof Map) {
    return Array.from(products.values());
  }

  return Array.isArray(products) ? products : [];
}

export function buildStaleProductDecision({
  existingProducts,
  resolvedProducts,
  sourceFilter,
  trialRevalidationOutcomes = [],
}) {
  const resolvedValues = toProductValues(resolvedProducts);
  const resolvedSlugs = new Set(resolvedValues.map((product) => product.slug));
  const resolvedTrialSourceIds = new Set(
    resolvedValues
      .filter(
        (product) => getManagedStoreCodeFromUrl(product.affiliateUrl) === "trial-sport",
      )
      .map(
        (product) => getStoreIdentityFromUrl(product.affiliateUrl).sourceProductId,
      )
      .filter(Boolean),
  );
  const revalidationBySlug = new Map(
    trialRevalidationOutcomes.map((outcome) => [outcome.slug, outcome.status]),
  );
  const staleProducts = [];
  const preservedProducts = [];
  const trialProductsRequiringRevalidation = [];
  const blockingTrialProducts = [];

  for (const product of toProductValues(existingProducts)) {
    if (
      !shouldSyncManagedStoreProduct(product, sourceFilter) ||
      product.isActive === false ||
      resolvedSlugs.has(product.slug)
    ) {
      continue;
    }

    const storeCode = getManagedStoreCodeFromUrl(product.affiliateUrl);
    if (storeCode !== "trial-sport") {
      staleProducts.push(product);
      continue;
    }

    const sourceProductId = getStoreIdentityFromUrl(
      product.affiliateUrl,
    ).sourceProductId;
    if (sourceProductId && resolvedTrialSourceIds.has(sourceProductId)) {
      staleProducts.push(product);
      continue;
    }

    const revalidationStatus = revalidationBySlug.get(product.slug);
    if (revalidationStatus === "unavailable") {
      staleProducts.push(product);
    } else if (revalidationStatus === "available") {
      preservedProducts.push(product);
    } else if (revalidationStatus === "unknown") {
      blockingTrialProducts.push(product);
    } else {
      trialProductsRequiringRevalidation.push(product);
    }
  }

  return {
    staleProducts,
    preservedProducts,
    trialProductsRequiringRevalidation,
    blockingTrialProducts,
  };
}

function summarizeWarnings(warnings, logger) {
  if (warnings.length === 0) {
    return;
  }

  logger.warn(`Warnings during store import: ${warnings.length}`);

  for (const warning of warnings.slice(0, 20)) {
    logger.warn(`- ${warning}`);
  }

  if (warnings.length > 20) {
    logger.warn(`... and ${warnings.length - 20} more`);
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

export async function runStoreImport(options = {}) {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  const sslMode =
    options.sslMode ?? (process.env.DATABASE_SSL === "disable" ? false : "require");
  const checkedAt =
    options.checkedAt ?? new Date().toISOString().slice(0, 10);
  const sourceFilter = String(
    options.sourceFilter ?? process.env.STORE_IMPORT_SOURCE ?? "all",
  )
    .trim()
    .toLowerCase();
  const importLimit = Number.isFinite(options.importLimit)
    ? options.importLimit
    : Number.parseInt(process.env.STORE_IMPORT_LIMIT ?? "", 10);
  const logger = options.logger ?? console;
  const expectedPlanHash = normalizeWhitespace(
    options.expectedPlanHash ??
      process.env.CATALOG_SOURCE_IDENTITY_EXPECTED_PLAN_HASH ??
      "",
  );
  const ownSqlClient = !options.sql;

  if (!options.sql && !databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  const sql =
    options.sql ??
    postgres(databaseUrl, {
      ssl: sslMode,
      prepare: false,
      max: 1,
    });
  const state = { productColumnSupport: null };

  try {
    const importedProducts = [];
    const warnings = [];
    let trialSportDiagnostics = null;

    if (sourceFilter === "all" || sourceFilter === "traektoria") {
      const result = await importTraektoriaProducts({
        fetchJson,
        fetchText,
        checkedAt,
        limit: hasImportLimit(importLimit) ? importLimit : null,
        logger,
      });

      importedProducts.push(...result.products);
      warnings.push(...result.warnings);
    }

    if (
      sourceFilter === "all" ||
      sourceFilter === "trial" ||
      sourceFilter === "trial-sport"
    ) {
      const result = await importTrialSportProducts({
        fetchArrayBuffer,
        fetchText,
        checkedAt,
        limit: hasImportLimit(importLimit) ? importLimit : null,
        logger,
      });

      importedProducts.push(...result.products);
      warnings.push(...result.warnings);
      trialSportDiagnostics = result.diagnostics;
      assertTrialSportSourceComplete(trialSportDiagnostics);
    }

    await sql`set statement_timeout = 0`;

    const existingCatalog = await loadExistingCatalog(sql, state);
    const officialProductSpecs = await loadOfficialProductSpecs();

    const identityPlan = buildSourceIdentityPlan({
      importedProducts,
      existingProducts: existingCatalog,
      officialSpecs: officialProductSpecs,
    });

    if (identityPlan.logicalPlan.blockingIssues.length > 0) {
      throw new Error(
        `Source identity plan is blocked: ${identityPlan.logicalPlan.blockingIssues.join(" ")}`,
      );
    }

    const pendingIdentityRepairs = identityPlan.logicalPlan.groups.filter(
      (group) =>
        group.repairRequired && group.classification !== "NO_CONFLICT",
    );

    if (pendingIdentityRepairs.length > 0 && !expectedPlanHash) {
      throw new Error(
        `Source identity changes require a hashed preview (${pendingIdentityRepairs.length} groups).`,
      );
    }

    if (expectedPlanHash && identityPlan.planHash !== expectedPlanHash) {
      throw new Error(
        `Source identity plan hash changed: expected ${expectedPlanHash}, actual ${identityPlan.planHash}.`,
      );
    }

    const mergedImportedProducts = new Map(
      identityPlan.resolvedProducts.map((product) => [product.slug, product]),
    );

    const initialStaleDecision = buildStaleProductDecision({
      existingProducts: existingCatalog,
      resolvedProducts: mergedImportedProducts,
      sourceFilter,
    });
    let staleDecision = initialStaleDecision;

    if (initialStaleDecision.trialProductsRequiringRevalidation.length > 0) {
      const revalidation = await revalidateTrialSportProducts({
        products: initialStaleDecision.trialProductsRequiringRevalidation,
        fetchText,
      });

      if (!revalidation.diagnostics.complete) {
        throw new Error("INCOMPLETE_TRIAL_SPORT_SOURCE");
      }

      staleDecision = buildStaleProductDecision({
        existingProducts: existingCatalog,
        resolvedProducts: mergedImportedProducts,
        sourceFilter,
        trialRevalidationOutcomes: revalidation.outcomes,
      });
    }

    if (
      staleDecision.trialProductsRequiringRevalidation.length > 0 ||
      staleDecision.blockingTrialProducts.length > 0
    ) {
      throw new Error("INCOMPLETE_TRIAL_SPORT_SOURCE");
    }

    const preparedProducts = Array.from(mergedImportedProducts.values())
      .map((product) => {
        const mergedProduct = mergeWithExistingProduct(
          existingCatalog.get(product.slug),
          product,
        );

        return applyOfficialProductSpecs(
          mergedProduct,
          officialProductSpecs.get(mergedProduct.slug),
        );
      })
      .filter((product) => product.sizes.length > 0);

    const staleStoreProducts = staleDecision.staleProducts
      .map((product) =>
        applyOfficialProductSpecs(
          {
            ...product,
            isActive: false,
          },
          officialProductSpecs.get(product.slug),
        ),
      );

    const finalProducts = [...preparedProducts, ...staleStoreProducts];
    const summary = await upsertCatalogProducts(sql, finalProducts);
    const cleanedBrokenTrialSizes = await cleanupBrokenTrialSportSizes(sql);
    const repairedWaistWidths = await normalizeCatalogWaistWidths(sql);
    const result = {
      checkedAt,
      sourceIdentityPlanHash: identityPlan.planHash,
      sourceFilter,
      warnings,
      importedModels: summary.importedModels,
      importedSizes: summary.importedSizes,
      cleanedBrokenTrialSizes,
      repairedWaistWidths: repairedWaistWidths.length,
      mergedProducts: finalProducts.length,
      activeProducts: finalProducts.filter((product) => product.isActive).length,
      draftProducts: finalProducts.filter(
        (product) => product.dataStatus === "draft",
      ).length,
      verifiedProducts: finalProducts.filter(
        (product) => product.dataStatus === "verified",
      ).length,
    };

    logger.log(`Store import finished. Models: ${result.importedModels}`);
    logger.log(`Sizes imported: ${result.importedSizes}`);
    logger.log(`Broken Trial Sport sizes removed: ${result.cleanedBrokenTrialSizes}`);
    logger.log(`Waist widths repaired: ${result.repairedWaistWidths}`);
    logger.log(`Merged product cards: ${result.mergedProducts}`);
    logger.log(`Active products after import: ${result.activeProducts}`);
    logger.log(`Draft products after import: ${result.draftProducts}`);
    logger.log(`Verified products after import: ${result.verifiedProducts}`);
    summarizeWarnings(warnings, logger);

    return result;
  } finally {
    if (ownSqlClient) {
      await sql.end({ timeout: 1 });
    }
  }
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  try {
    await runStoreImport();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

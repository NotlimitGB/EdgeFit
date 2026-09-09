import {
  assertProductSizeTruthV2,
  assertProductTruthV2,
} from "../../../scripts/lib/store-import/attribute-truth.mjs";

let cachedProductColumnSupport = null;

const TRUTH_WRITE_MODES = new Set(["disabled", "shadow"]);
const REQUIRED_PRODUCT_TRUTH_COLUMNS = new Set([
  "truth_model_version",
  "truth_riding_styles",
  "truth_skill_level_min",
  "truth_skill_level_max",
  "truth_board_line",
  "truth_flex",
  "truth_shape_type",
  "truth_camber_profile",
  "truth_attribute_evidence",
]);
const REQUIRED_SIZE_TRUTH_COLUMNS = new Set([
  "truth_model_version",
  "truth_waist_width_mm",
  "truth_width_type",
  "truth_attribute_evidence",
]);

function normalizeTruthWriteMode(options = {}) {
  const mode = options.truthWriteMode ?? "disabled";
  if (!TRUTH_WRITE_MODES.has(mode)) {
    throw new TypeError(`Unsupported truthWriteMode: ${mode}`);
  }
  return mode;
}

function validateProductsForShadowWrite(products) {
  for (const product of products) {
    assertProductTruthV2(product.truthV2);
    for (const size of product.sizes) assertProductSizeTruthV2(size.truthV2);
  }
}

async function assertTruthShadowSchema(transaction) {
  const rows = await transaction`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('products', 'product_sizes')
  `;
  const byTable = new Map([
    ["products", new Set()],
    ["product_sizes", new Set()],
  ]);
  for (const row of rows) byTable.get(row.table_name)?.add(row.column_name);
  const complete =
    [...REQUIRED_PRODUCT_TRUTH_COLUMNS].every((column) => byTable.get("products").has(column)) &&
    [...REQUIRED_SIZE_TRUTH_COLUMNS].every((column) => byTable.get("product_sizes").has(column));
  if (!complete) {
    const error = new Error("Catalog truth-v2 shadow schema is required.");
    error.code = "TRUTH_V2_SCHEMA_REQUIRED";
    throw error;
  }
}

async function writeProductTruth(transaction, productId, truth) {
  await transaction`
    update products set
      truth_model_version = ${truth.truthModelVersion},
      truth_riding_styles = ${truth.ridingStyles},
      truth_skill_level_min = ${truth.skillApplicability?.min ?? null},
      truth_skill_level_max = ${truth.skillApplicability?.max ?? null},
      truth_board_line = ${truth.boardLine},
      truth_flex = ${truth.flex},
      truth_shape_type = ${truth.shapeType},
      truth_camber_profile = ${truth.camberProfile},
      truth_attribute_evidence = ${JSON.stringify(truth.attributeEvidence)}::jsonb
    where id = ${productId}
  `;
}

async function writeSizeTruth(transaction, sizeId, truth) {
  await transaction`
    update product_sizes set
      truth_model_version = ${truth.truthModelVersion},
      truth_waist_width_mm = ${truth.waistWidthMm},
      truth_width_type = ${truth.widthType},
      truth_attribute_evidence = ${JSON.stringify(truth.attributeEvidence)}::jsonb
    where id = ${sizeId}
  `;
}

async function getProductColumnSupport(sql) {
  if (cachedProductColumnSupport) {
    return cachedProductColumnSupport;
  }

  const rows = await sql`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and (
        (
          table_name = 'products'
          and column_name in ('season_label', 'gallery_images', 'shape_type', 'camber_profile', 'data_status', 'source_name', 'source_url', 'source_checked_at')
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

  cachedProductColumnSupport = {
    hasSeasonLabel: productColumns.has("season_label"),
    hasGalleryImages: productColumns.has("gallery_images"),
    hasShapeType: productColumns.has("shape_type"),
    hasCamberProfile: productColumns.has("camber_profile"),
    hasExtendedColumns:
      productColumns.has("data_status") &&
      productColumns.has("source_name") &&
      productColumns.has("source_url") &&
      productColumns.has("source_checked_at"),
    hasSizeLabel: sizeColumns.has("size_label"),
    hasSizeAvailable: sizeColumns.has("is_available"),
  };

  return cachedProductColumnSupport;
}

async function saveCatalogProductInTransaction(
  transaction,
  product,
  truthWriteMode = "disabled",
) {
  const galleryImages = Array.isArray(product.galleryImages)
    ? product.galleryImages.map((image) => String(image ?? "").trim()).filter(Boolean)
    : null;
  const shapeType = product.shapeType ?? null;
  const camberProfile = product.camberProfile ?? null;
  const seasonLabel = product.seasonLabel?.trim() || null;
  const dataStatus = product.dataStatus ?? "draft";
  const sourceName = product.sourceName?.trim() || null;
  const sourceUrl = product.sourceUrl?.trim() || null;
  const sourceCheckedAt = product.sourceCheckedAt?.trim() || null;
  const { hasSeasonLabel, hasGalleryImages, hasShapeType, hasCamberProfile, hasExtendedColumns, hasSizeLabel, hasSizeAvailable } = await getProductColumnSupport(
    transaction,
  );

  const [savedProduct] = hasExtendedColumns && hasShapeType && hasSeasonLabel
    ? await transaction`
        insert into products (
          slug,
          brand,
          model_name,
          season_label,
          description_short,
          description_full,
          riding_style,
          skill_level,
          flex,
          price_from,
          image_url,
          affiliate_url,
          is_active,
          board_line,
          shape_type,
          data_status,
          source_name,
          source_url,
          source_checked_at,
          scenarios,
          not_ideal_for
        ) values (
          ${product.slug},
          ${product.brand},
          ${product.modelName},
          ${seasonLabel},
          ${product.descriptionShort},
          ${product.descriptionFull},
          ${product.ridingStyle},
          ${product.skillLevel},
          ${product.flex},
          ${product.priceFrom},
          ${product.imageUrl},
          ${product.affiliateUrl},
          ${product.isActive},
          ${product.boardLine},
          ${shapeType},
          ${dataStatus},
          ${sourceName},
          ${sourceUrl},
          ${sourceCheckedAt},
          ${JSON.stringify(product.scenarios)}::jsonb,
          ${JSON.stringify(product.notIdealFor)}::jsonb
        )
        on conflict (slug) do update set
          brand = excluded.brand,
          model_name = excluded.model_name,
          season_label = excluded.season_label,
          description_short = excluded.description_short,
          description_full = excluded.description_full,
          riding_style = excluded.riding_style,
          skill_level = excluded.skill_level,
          flex = excluded.flex,
          price_from = excluded.price_from,
          image_url = excluded.image_url,
          affiliate_url = excluded.affiliate_url,
          is_active = excluded.is_active,
          board_line = excluded.board_line,
          shape_type = excluded.shape_type,
          data_status = excluded.data_status,
          source_name = excluded.source_name,
          source_url = excluded.source_url,
          source_checked_at = excluded.source_checked_at,
          scenarios = excluded.scenarios,
          not_ideal_for = excluded.not_ideal_for,
          updated_at = now()
        returning id
      `
    : hasExtendedColumns && hasShapeType
      ? await transaction`
          insert into products (
            slug,
            brand,
            model_name,
            description_short,
            description_full,
            riding_style,
            skill_level,
            flex,
            price_from,
            image_url,
            affiliate_url,
            is_active,
            board_line,
            shape_type,
            data_status,
            source_name,
            source_url,
            source_checked_at,
            scenarios,
            not_ideal_for
          ) values (
            ${product.slug},
            ${product.brand},
            ${product.modelName},
            ${product.descriptionShort},
            ${product.descriptionFull},
            ${product.ridingStyle},
            ${product.skillLevel},
            ${product.flex},
            ${product.priceFrom},
            ${product.imageUrl},
            ${product.affiliateUrl},
            ${product.isActive},
            ${product.boardLine},
            ${shapeType},
            ${dataStatus},
            ${sourceName},
            ${sourceUrl},
            ${sourceCheckedAt},
            ${JSON.stringify(product.scenarios)}::jsonb,
            ${JSON.stringify(product.notIdealFor)}::jsonb
          )
          on conflict (slug) do update set
            brand = excluded.brand,
            model_name = excluded.model_name,
            description_short = excluded.description_short,
            description_full = excluded.description_full,
            riding_style = excluded.riding_style,
            skill_level = excluded.skill_level,
            flex = excluded.flex,
            price_from = excluded.price_from,
            image_url = excluded.image_url,
            affiliate_url = excluded.affiliate_url,
            is_active = excluded.is_active,
            board_line = excluded.board_line,
            shape_type = excluded.shape_type,
            data_status = excluded.data_status,
            source_name = excluded.source_name,
            source_url = excluded.source_url,
            source_checked_at = excluded.source_checked_at,
            scenarios = excluded.scenarios,
            not_ideal_for = excluded.not_ideal_for,
            updated_at = now()
          returning id
        `
    : hasExtendedColumns
      ? await transaction`
          insert into products (
            slug,
            brand,
            model_name,
            description_short,
            description_full,
            riding_style,
            skill_level,
            flex,
            price_from,
            image_url,
            affiliate_url,
            is_active,
            board_line,
            data_status,
            source_name,
            source_url,
            source_checked_at,
            scenarios,
            not_ideal_for
          ) values (
            ${product.slug},
            ${product.brand},
            ${product.modelName},
            ${product.descriptionShort},
            ${product.descriptionFull},
            ${product.ridingStyle},
            ${product.skillLevel},
            ${product.flex},
            ${product.priceFrom},
            ${product.imageUrl},
            ${product.affiliateUrl},
            ${product.isActive},
            ${product.boardLine},
            ${dataStatus},
            ${sourceName},
            ${sourceUrl},
            ${sourceCheckedAt},
            ${JSON.stringify(product.scenarios)}::jsonb,
            ${JSON.stringify(product.notIdealFor)}::jsonb
          )
          on conflict (slug) do update set
            brand = excluded.brand,
            model_name = excluded.model_name,
            description_short = excluded.description_short,
            description_full = excluded.description_full,
            riding_style = excluded.riding_style,
            skill_level = excluded.skill_level,
            flex = excluded.flex,
            price_from = excluded.price_from,
            image_url = excluded.image_url,
            affiliate_url = excluded.affiliate_url,
            is_active = excluded.is_active,
            board_line = excluded.board_line,
            data_status = excluded.data_status,
            source_name = excluded.source_name,
            source_url = excluded.source_url,
            source_checked_at = excluded.source_checked_at,
            scenarios = excluded.scenarios,
            not_ideal_for = excluded.not_ideal_for,
            updated_at = now()
          returning id
        `
      : hasShapeType
        ? await transaction`
            insert into products (
              slug,
              brand,
              model_name,
              description_short,
              description_full,
              riding_style,
              skill_level,
              flex,
              price_from,
              image_url,
              affiliate_url,
              is_active,
              board_line,
              shape_type,
              scenarios,
              not_ideal_for
            ) values (
              ${product.slug},
              ${product.brand},
              ${product.modelName},
              ${product.descriptionShort},
              ${product.descriptionFull},
              ${product.ridingStyle},
              ${product.skillLevel},
              ${product.flex},
              ${product.priceFrom},
              ${product.imageUrl},
              ${product.affiliateUrl},
              ${product.isActive},
              ${product.boardLine},
              ${shapeType},
              ${JSON.stringify(product.scenarios)}::jsonb,
              ${JSON.stringify(product.notIdealFor)}::jsonb
            )
            on conflict (slug) do update set
              brand = excluded.brand,
              model_name = excluded.model_name,
              description_short = excluded.description_short,
              description_full = excluded.description_full,
              riding_style = excluded.riding_style,
              skill_level = excluded.skill_level,
              flex = excluded.flex,
              price_from = excluded.price_from,
              image_url = excluded.image_url,
              affiliate_url = excluded.affiliate_url,
              is_active = excluded.is_active,
              board_line = excluded.board_line,
              shape_type = excluded.shape_type,
              scenarios = excluded.scenarios,
              not_ideal_for = excluded.not_ideal_for,
              updated_at = now()
            returning id
          `
    : await transaction`
        insert into products (
          slug,
          brand,
          model_name,
          description_short,
          description_full,
          riding_style,
          skill_level,
          flex,
          price_from,
          image_url,
          affiliate_url,
          is_active,
          board_line,
          scenarios,
          not_ideal_for
        ) values (
          ${product.slug},
          ${product.brand},
          ${product.modelName},
          ${product.descriptionShort},
          ${product.descriptionFull},
          ${product.ridingStyle},
          ${product.skillLevel},
          ${product.flex},
          ${product.priceFrom},
          ${product.imageUrl},
          ${product.affiliateUrl},
          ${product.isActive},
          ${product.boardLine},
          ${JSON.stringify(product.scenarios)}::jsonb,
          ${JSON.stringify(product.notIdealFor)}::jsonb
        )
        on conflict (slug) do update set
          brand = excluded.brand,
          model_name = excluded.model_name,
          description_short = excluded.description_short,
          description_full = excluded.description_full,
          riding_style = excluded.riding_style,
          skill_level = excluded.skill_level,
          flex = excluded.flex,
          price_from = excluded.price_from,
          image_url = excluded.image_url,
          affiliate_url = excluded.affiliate_url,
          is_active = excluded.is_active,
          board_line = excluded.board_line,
          scenarios = excluded.scenarios,
          not_ideal_for = excluded.not_ideal_for,
          updated_at = now()
        returning id
      `;

  if (hasGalleryImages && galleryImages) {
    await transaction`
      update products
      set gallery_images = ${JSON.stringify(galleryImages)}::jsonb
      where id = ${savedProduct.id}
    `;
  }

  if (hasCamberProfile) {
    await transaction`
      update products
      set camber_profile = ${camberProfile}
      where id = ${savedProduct.id}
    `;
  }

  if (truthWriteMode === "shadow") {
    await writeProductTruth(transaction, savedProduct.id, product.truthV2);
  }

  await transaction`delete from product_sizes where product_id = ${savedProduct.id}`;

  for (const size of product.sizes) {
    const sizeLabel = size.sizeLabel?.trim() || null;
    const isAvailable = size.isAvailable !== false;

    if (hasSizeLabel && hasSizeAvailable) {
      const [savedSize] = await transaction`
        insert into product_sizes (
          product_id,
          size_cm,
          size_label,
          waist_width_mm,
          recommended_weight_min,
          recommended_weight_max,
          width_type,
          is_available
        ) values (
          ${savedProduct.id},
          ${size.sizeCm},
          ${sizeLabel},
          ${size.waistWidthMm},
          ${size.recommendedWeightMin},
          ${size.recommendedWeightMax},
          ${size.widthType},
          ${isAvailable}
        ) returning id
      `;
      if (truthWriteMode === "shadow") await writeSizeTruth(transaction, savedSize.id, size.truthV2);
      continue;
    }

    if (hasSizeLabel) {
      const [savedSize] = await transaction`
        insert into product_sizes (
          product_id,
          size_cm,
          size_label,
          waist_width_mm,
          recommended_weight_min,
          recommended_weight_max,
          width_type
        ) values (
          ${savedProduct.id},
          ${size.sizeCm},
          ${sizeLabel},
          ${size.waistWidthMm},
          ${size.recommendedWeightMin},
          ${size.recommendedWeightMax},
          ${size.widthType}
        ) returning id
      `;
      if (truthWriteMode === "shadow") await writeSizeTruth(transaction, savedSize.id, size.truthV2);
      continue;
    }

    if (hasSizeAvailable) {
      const [savedSize] = await transaction`
        insert into product_sizes (
          product_id,
          size_cm,
          waist_width_mm,
          recommended_weight_min,
          recommended_weight_max,
          width_type,
          is_available
        ) values (
          ${savedProduct.id},
          ${size.sizeCm},
          ${size.waistWidthMm},
          ${size.recommendedWeightMin},
          ${size.recommendedWeightMax},
          ${size.widthType},
          ${isAvailable}
        ) returning id
      `;
      if (truthWriteMode === "shadow") await writeSizeTruth(transaction, savedSize.id, size.truthV2);
      continue;
    }

    const [savedSize] = await transaction`
      insert into product_sizes (
        product_id,
        size_cm,
        waist_width_mm,
        recommended_weight_min,
        recommended_weight_max,
        width_type
      ) values (
        ${savedProduct.id},
        ${size.sizeCm},
        ${size.waistWidthMm},
        ${size.recommendedWeightMin},
        ${size.recommendedWeightMax},
        ${size.widthType}
      ) returning id
    `;
    if (truthWriteMode === "shadow") await writeSizeTruth(transaction, savedSize.id, size.truthV2);
  }

  return {
    ...product,
    id: savedProduct.id,
    seasonLabel,
    shapeType,
    camberProfile,
    dataStatus,
    sourceName,
    sourceUrl,
    sourceCheckedAt,
    ...(galleryImages ? { galleryImages } : {}),
    sizes: product.sizes.map((size) => ({
      ...size,
      sizeLabel: size.sizeLabel?.trim() || null,
      isAvailable: size.isAvailable !== false,
    })),
  };
}

export async function saveCatalogProduct(sql, product, options = {}) {
  const truthWriteMode = normalizeTruthWriteMode(options);
  if (truthWriteMode === "shadow") validateProductsForShadowWrite([product]);
  return sql.begin(async (transaction) => {
    if (truthWriteMode === "shadow") await assertTruthShadowSchema(transaction);
    return saveCatalogProductInTransaction(transaction, product, truthWriteMode);
  });
}

export async function upsertCatalogProducts(sql, products, options = {}) {
  const truthWriteMode = normalizeTruthWriteMode(options);
  if (truthWriteMode === "shadow") validateProductsForShadowWrite(products);
  return sql.begin(async (transaction) => {
    if (truthWriteMode === "shadow") await assertTruthShadowSchema(transaction);
    const savedProducts = [];

    for (const product of products) {
      savedProducts.push(
        await saveCatalogProductInTransaction(transaction, product, truthWriteMode),
      );
    }

    return {
      importedModels: savedProducts.length,
      importedSizes: savedProducts.reduce(
        (total, product) => total + product.sizes.length,
        0,
      ),
      savedProducts,
    };
  });
}

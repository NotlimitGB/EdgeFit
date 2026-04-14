let cachedProductColumnSupport = null;

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

async function saveCatalogProductInTransaction(transaction, product) {
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

  await transaction`delete from product_sizes where product_id = ${savedProduct.id}`;

  for (const size of product.sizes) {
    const sizeLabel = size.sizeLabel?.trim() || null;
    const isAvailable = size.isAvailable !== false;

    if (hasSizeLabel && hasSizeAvailable) {
      await transaction`
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
        )
      `;
      continue;
    }

    if (hasSizeLabel) {
      await transaction`
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
        )
      `;
      continue;
    }

    if (hasSizeAvailable) {
      await transaction`
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
        )
      `;
      continue;
    }

    await transaction`
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
      )
    `;
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

export async function saveCatalogProduct(sql, product) {
  return sql.begin((transaction) => saveCatalogProductInTransaction(transaction, product));
}

export async function upsertCatalogProducts(sql, products) {
  return sql.begin(async (transaction) => {
    const savedProducts = [];

    for (const product of products) {
      savedProducts.push(await saveCatalogProductInTransaction(transaction, product));
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

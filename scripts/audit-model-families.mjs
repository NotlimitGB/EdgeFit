import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const DEFAULT_REPORT_PATH = "reports/catalog-model-family-audit.json";

const REQUIRED_COLUMNS = {
  products: [
    "id",
    "slug",
    "brand",
    "model_name",
    "season_label",
    "source_name",
    "source_url",
    "affiliate_url",
    "riding_style",
    "skill_level",
    "board_line",
    "shape_type",
    "camber_profile",
    "data_status",
    "image_url",
    "gallery_images",
    "is_active",
    "updated_at",
  ],
  product_sizes: [
    "product_id",
    "size_cm",
    "size_label",
    "waist_width_mm",
    "width_type",
    "is_available",
  ],
};

const PROTECTED_SUFFIXES = [
  "pro model",
  "2 0",
  "limited",
  "carbon",
  "women",
  "womens",
  "youth",
  "ultra",
  "team",
  "plus",
  "kids",
  "pro",
  "ltd",
  "x",
];

function normalizeWhitespace(value) {
  return String(value ?? "").trim().replace(/\s+/gu, " ");
}

export function normalizeBrand(value) {
  return normalizeWhitespace(value).normalize("NFKC").toLocaleLowerCase("en-US");
}

export function normalizeModelName(value) {
  return normalizeWhitespace(value)
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[’']/gu, "")
    .replace(/&/gu, " and ")
    .replace(/\+/gu, " plus ")
    .replace(/[‐‑‒–—-]+/gu, " ")
    .replace(/[._()/\\,;:!?]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function normalizeSeason(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return null;
  }

  const fullRange = normalized.match(/\b(20\d{2})\s*[/-]\s*(20\d{2})\b/u);
  if (fullRange) {
    return `${fullRange[1]}/${fullRange[2]}`;
  }

  const mixedRange = normalized.match(/\b(20\d{2})\s*[/-]\s*(\d{2})\b/u);
  if (mixedRange) {
    return `${mixedRange[1]}/20${mixedRange[2]}`;
  }

  const shortRange = normalized.match(/\b(\d{2})\s*[/-]\s*(\d{2})\b/u);
  if (shortRange) {
    return `20${shortRange[1]}/20${shortRange[2]}`;
  }

  return normalized.toLocaleLowerCase("en-US");
}

export function detectWidthMarker(modelName) {
  const normalized = normalizeModelName(modelName);
  const midWideMatch = normalized.match(/^(.*?)\s+mid\s+wide(?:\s+snowboard)?$/u);
  if (midWideMatch?.[1]) {
    return {
      kind: "ambiguous-mid-wide",
      baseModelName: midWideMatch[1],
      marker: normalized.slice(midWideMatch[1].length).trim(),
    };
  }

  const explicitWideMatch = normalized.match(/^(.*?)\s+wide(?:\s+snowboard)?$/u);
  if (explicitWideMatch?.[1]) {
    return {
      kind: "explicit-wide",
      baseModelName: explicitWideMatch[1],
      marker: normalized.slice(explicitWideMatch[1].length).trim(),
    };
  }

  const singleWMatch = normalized.match(/^(.*?)\s+w$/u);
  if (singleWMatch?.[1]) {
    return {
      kind: "ambiguous-single-w",
      baseModelName: singleWMatch[1],
      marker: "w",
    };
  }

  const sizeWMatch = normalized.match(/^(.*?)\s+(\d{2,3}(?:\s+\d+)?)w$/u);
  if (sizeWMatch?.[1]) {
    return {
      kind: "ambiguous-size-w",
      baseModelName: sizeWMatch[1],
      marker: sizeWMatch[2],
    };
  }

  return {
    kind: "base",
    baseModelName: normalized,
    marker: null,
  };
}

function toNumber(value) {
  if (value == null) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeGalleryImages(value) {
  let current = value;

  for (let depth = 0; depth < 2 && typeof current === "string"; depth += 1) {
    try {
      current = JSON.parse(current);
    } catch {
      current = [];
    }
  }

  return Array.from(
    new Set(
      (Array.isArray(current) ? current : [])
        .map((image) => normalizeWhitespace(image))
        .filter(Boolean),
    ),
  );
}

function normalizeSize(size) {
  return {
    sizeCm: toNumber(size.sizeCm),
    sizeLabel: normalizeWhitespace(size.sizeLabel) || null,
    waistWidthMm: toNumber(size.waistWidthMm),
    widthType: normalizeWhitespace(size.widthType) || null,
    isAvailable: size.isAvailable === true,
  };
}

function sortSizes(sizes) {
  return [...sizes].sort(
    (left, right) =>
      (left.sizeCm ?? Number.POSITIVE_INFINITY) -
        (right.sizeCm ?? Number.POSITIVE_INFINITY) ||
      String(left.sizeLabel ?? "").localeCompare(String(right.sizeLabel ?? ""), "en"),
  );
}

function getUrlEvidence(value) {
  const fullUrl = normalizeWhitespace(value) || null;
  if (!fullUrl) {
    return {
      url: null,
      hostname: null,
      pathname: null,
    };
  }

  try {
    const parsed = new URL(fullUrl);
    return {
      url: fullUrl,
      hostname: parsed.hostname.toLocaleLowerCase("en-US"),
      pathname: parsed.pathname,
    };
  } catch {
    return {
      url: fullUrl,
      hostname: null,
      pathname: null,
    };
  }
}

function getWidthSummary(sizes) {
  const widthCounts = {
    regular: 0,
    "mid-wide": 0,
    wide: 0,
    unknown: 0,
  };
  const waists = [];
  const labelsWithW = [];

  for (const size of sizes) {
    if (Object.hasOwn(widthCounts, size.widthType)) {
      widthCounts[size.widthType] += 1;
    } else {
      widthCounts.unknown += 1;
    }

    if (Number.isFinite(size.waistWidthMm)) {
      waists.push(size.waistWidthMm);
    }

    if (/\d+(?:[.,]\d+)?\s*w\b/iu.test(size.sizeLabel ?? "")) {
      labelsWithW.push(size.sizeLabel);
    }
  }

  return {
    sizeCount: sizes.length,
    availableSizeCount: sizes.filter((size) => size.isAvailable).length,
    widthCounts,
    minWaistWidthMm: waists.length > 0 ? Math.min(...waists) : null,
    maxWaistWidthMm: waists.length > 0 ? Math.max(...waists) : null,
    hasExplicitWSizeLabels: labelsWithW.length > 0,
    explicitWSizeLabels: labelsWithW,
  };
}

function toMember(product) {
  const sizes = sortSizes((Array.isArray(product.sizes) ? product.sizes : []).map(normalizeSize));
  const galleryImages = normalizeGalleryImages(product.galleryImages);
  const source = getUrlEvidence(product.sourceUrl);
  const affiliate = getUrlEvidence(product.affiliateUrl);

  return {
    id: String(product.id),
    slug: String(product.slug),
    brand: normalizeWhitespace(product.brand),
    modelName: normalizeWhitespace(product.modelName),
    seasonLabel: normalizeWhitespace(product.seasonLabel) || null,
    normalizedSeason: normalizeSeason(product.seasonLabel),
    sourceName: normalizeWhitespace(product.sourceName) || null,
    sourceUrl: source.url,
    sourceHost: source.hostname,
    sourcePathname: source.pathname,
    affiliateUrl: affiliate.url,
    affiliateHost: affiliate.hostname,
    affiliatePathname: affiliate.pathname,
    ridingStyle: normalizeWhitespace(product.ridingStyle) || null,
    skillLevel: normalizeWhitespace(product.skillLevel) || null,
    boardLine: normalizeWhitespace(product.boardLine) || null,
    shapeType: normalizeWhitespace(product.shapeType) || null,
    camberProfile: normalizeWhitespace(product.camberProfile) || null,
    dataStatus: normalizeWhitespace(product.dataStatus) || null,
    imageUrl: normalizeWhitespace(product.imageUrl) || null,
    galleryImages,
    sizes,
    widthSummary: getWidthSummary(sizes),
  };
}

function compareText(left, right) {
  return normalizeWhitespace(left).toLocaleLowerCase("en-US") ===
    normalizeWhitespace(right).toLocaleLowerCase("en-US");
}

function getImageEvidence(left, right) {
  const leftImages = new Set(
    [left.imageUrl, ...left.galleryImages].map(normalizeWhitespace).filter(Boolean),
  );
  const rightImages = new Set(
    [right.imageUrl, ...right.galleryImages].map(normalizeWhitespace).filter(Boolean),
  );

  return {
    samePrimaryUrl:
      Boolean(left.imageUrl) && Boolean(right.imageUrl) && left.imageUrl === right.imageUrl,
    sharedImageUrlCount: [...leftImages].filter((image) => rightImages.has(image)).length,
    leftImageUrlCount: leftImages.size,
    rightImageUrlCount: rightImages.size,
  };
}

function getCollisionAnalysis(left, right) {
  const sameSizeLabels = [];
  const sameSizeCm = [];
  const sameSizeCmDifferentLabels = [];
  const sameSizeCmDifferentWaists = [];
  const sameSizeLabelDifferentWaists = [];

  for (const leftSize of left.sizes) {
    for (const rightSize of right.sizes) {
      const leftLabel = normalizeWhitespace(leftSize.sizeLabel).toLocaleLowerCase("en-US");
      const rightLabel = normalizeWhitespace(rightSize.sizeLabel).toLocaleLowerCase("en-US");
      const sameLabel = Boolean(leftLabel) && leftLabel === rightLabel;
      const sameCm =
        Number.isFinite(leftSize.sizeCm) && leftSize.sizeCm === rightSize.sizeCm;
      const sameWaist =
        Number.isFinite(leftSize.waistWidthMm) &&
        leftSize.waistWidthMm === rightSize.waistWidthMm;

      if (sameLabel) {
        sameSizeLabels.push(leftSize.sizeLabel);
      }

      if (sameCm) {
        sameSizeCm.push(leftSize.sizeCm);
      }

      if (sameCm && !sameLabel) {
        sameSizeCmDifferentLabels.push({
          sizeCm: leftSize.sizeCm,
          leftLabel: leftSize.sizeLabel,
          rightLabel: rightSize.sizeLabel,
          safeDistinctVariant: true,
        });
      }

      if (sameCm && !sameWaist) {
        sameSizeCmDifferentWaists.push({
          sizeCm: leftSize.sizeCm,
          leftWaistWidthMm: leftSize.waistWidthMm,
          rightWaistWidthMm: rightSize.waistWidthMm,
        });
      }

      if (sameLabel && !sameWaist) {
        sameSizeLabelDifferentWaists.push({
          sizeLabel: leftSize.sizeLabel,
          leftWaistWidthMm: leftSize.waistWidthMm,
          rightWaistWidthMm: rightSize.waistWidthMm,
        });
      }
    }
  }

  return {
    sameSizeLabels: [...new Set(sameSizeLabels)].sort(),
    sameSizeCm: [...new Set(sameSizeCm)].sort((leftCm, rightCm) => leftCm - rightCm),
    sameSizeCmDifferentLabels,
    sameSizeCmDifferentWaists,
    sameSizeLabelDifferentWaists,
    hasMergeCollisionConcern:
      sameSizeLabels.length > 0 || sameSizeLabelDifferentWaists.length > 0,
    note:
      sameSizeCmDifferentLabels.length > 0
        ? "Equal numeric size_cm with distinct size_label values is a valid variant distinction, not a collision by itself."
        : null,
  };
}

function getPairComparison(left, right) {
  const conflictingFields = [];

  for (const field of ["ridingStyle", "skillLevel", "boardLine"]) {
    if (!compareText(left[field], right[field])) {
      conflictingFields.push(field);
    }
  }

  for (const field of ["shapeType", "camberProfile"]) {
    if (left[field] && right[field] && !compareText(left[field], right[field])) {
      conflictingFields.push(field);
    }
  }

  const affiliateUrls = new Set(
    [left.affiliateUrl, right.affiliateUrl].map(normalizeWhitespace).filter(Boolean),
  );

  return {
    sameSourceName: compareText(left.sourceName, right.sourceName),
    sameSourceHost:
      Boolean(left.sourceHost) &&
      Boolean(right.sourceHost) &&
      left.sourceHost === right.sourceHost,
    sameSeason:
      Boolean(left.normalizedSeason) &&
      Boolean(right.normalizedSeason) &&
      left.normalizedSeason === right.normalizedSeason,
    bothSeasonsKnown: Boolean(left.normalizedSeason) && Boolean(right.normalizedSeason),
    conflictingFields,
    sameAffiliateUrl:
      Boolean(left.affiliateUrl) && left.affiliateUrl === right.affiliateUrl,
    distinctAffiliateUrlCount: affiliateUrls.size,
    hasMultipleAffiliateUrls: affiliateUrls.size > 1,
    imageEvidence: getImageEvidence(left, right),
  };
}

function getFamilySortKey(family) {
  return [
    normalizeBrand(family.brand),
    family.canonicalCandidateModelName,
    family.normalizedSeason ?? "",
    family.members.map((member) => member.slug).sort().join("|"),
  ].join("|");
}

function sortFamilies(families) {
  return [...families].sort((left, right) =>
    getFamilySortKey(left).localeCompare(getFamilySortKey(right), "en"),
  );
}

function buildWidthFamily(baseProduct, variantProduct, marker) {
  const base = toMember(baseProduct);
  const variant = toMember(variantProduct);
  const comparison = getPairComparison(base, variant);
  const collisionAnalysis = getCollisionAnalysis(base, variant);
  const widthEvidence = {
    hasExplicitWSizeLabels: variant.widthSummary.hasExplicitWSizeLabels,
    hasNonRegularWidthType:
      variant.widthSummary.widthCounts["mid-wide"] > 0 ||
      variant.widthSummary.widthCounts.wide > 0,
  };
  widthEvidence.isSupported =
    widthEvidence.hasExplicitWSizeLabels || widthEvidence.hasNonRegularWidthType;

  let classification;
  const reasons = [];

  if (
    comparison.bothSeasonsKnown &&
    base.normalizedSeason !== variant.normalizedSeason
  ) {
    classification = "KEEP_SEPARATE";
    reasons.push("Both seasons are known and different.");
  } else if (marker.kind !== "explicit-wide") {
    classification = "REVIEW_WIDTH_FAMILY";
    reasons.push(
      marker.kind === "ambiguous-mid-wide"
        ? "The product name uses a MID-WIDE marker outside the first audit's automatic HIGH rule."
        : "The product-name width marker is an ambiguous standalone W form.",
    );
  } else if (!comparison.bothSeasonsKnown) {
    classification = "REVIEW_WIDTH_FAMILY";
    reasons.push("One or both season labels are missing.");
  } else if (comparison.conflictingFields.length > 0) {
    classification = "REVIEW_WIDTH_FAMILY";
    reasons.push(
      `Metadata conflicts require review: ${comparison.conflictingFields.join(", ")}.`,
    );
  } else if (base.sizes.length === 0 || variant.sizes.length === 0) {
    classification = "REVIEW_WIDTH_FAMILY";
    reasons.push("One or both product records have no size evidence.");
  } else if (!widthEvidence.isSupported) {
    classification = "REVIEW_WIDTH_FAMILY";
    reasons.push("The Wide listing has no W labels or non-regular width types.");
  } else {
    classification = "HIGH_CONFIDENCE_WIDTH_FAMILY";
    reasons.push(
      "Same normalized brand and base name after explicit terminal WIDE removal.",
      "Both records have the same known season and no physical metadata conflicts.",
      "The Wide member has size-level width evidence.",
    );
  }

  if (comparison.hasMultipleAffiliateUrls) {
    reasons.push("Members have different affiliate URLs and require variant-aware routing.");
  }

  const seasonKey = comparison.sameSeason ? base.normalizedSeason : "cross-season-or-missing";
  const familyId = [
    "width",
    normalizeBrand(base.brand),
    marker.baseModelName,
    seasonKey,
    base.slug,
    variant.slug,
  ].join(":");

  return {
    id: familyId,
    classification,
    confidenceReason: reasons.join(" "),
    reasons,
    brand: base.brand,
    canonicalCandidateModelName: marker.baseModelName,
    normalizedSeason: comparison.sameSeason ? base.normalizedSeason : null,
    markerKind: marker.kind,
    marker: marker.marker,
    members: [base, variant],
    comparison,
    widthEvidence,
    collisionAnalysis,
    routingRisk: {
      hasMultipleAffiliateUrls: comparison.hasMultipleAffiliateUrls,
      distinctAffiliateUrlCount: comparison.distinctAffiliateUrlCount,
    },
  };
}

function getProtectedSuffixRelation(product, productByFullKey) {
  for (const suffix of PROTECTED_SUFFIXES) {
    const suffixText = ` ${suffix}`;
    if (!product.normalizedModelName.endsWith(suffixText)) {
      continue;
    }

    const baseModelName = product.normalizedModelName.slice(0, -suffixText.length).trim();
    if (!baseModelName) {
      continue;
    }

    const bases =
      productByFullKey.get(`${product.normalizedBrand}|${baseModelName}`) ?? [];
    if (bases.length > 0) {
      return {
        suffix,
        baseModelName,
        bases,
      };
    }
  }

  return null;
}

function buildProtectedKeepSeparateCase(baseProduct, variantProduct, suffix) {
  const base = toMember(baseProduct);
  const variant = toMember(variantProduct);
  const comparison = getPairComparison(base, variant);
  const id = [
    "protected",
    normalizeBrand(base.brand),
    normalizeModelName(base.modelName),
    suffix.replace(/\s+/gu, "-"),
    base.slug,
    variant.slug,
  ].join(":");

  return {
    id,
    classification: "KEEP_SEPARATE",
    confidenceReason: `Protected model identity suffix '${suffix}' must not be stripped automatically.`,
    reasons: [
      `The records differ by protected identity suffix '${suffix}'.`,
      "This audit does not treat the suffix as width-family normalization.",
    ],
    brand: base.brand,
    canonicalCandidateModelName: normalizeModelName(base.modelName),
    normalizedSeason:
      comparison.sameSeason && base.normalizedSeason ? base.normalizedSeason : null,
    protectedSuffix: suffix,
    members: [base, variant],
    comparison,
    collisionAnalysis: getCollisionAnalysis(base, variant),
    routingRisk: {
      hasMultipleAffiliateUrls: comparison.hasMultipleAffiliateUrls,
      distinctAffiliateUrlCount: comparison.distinctAffiliateUrlCount,
    },
  };
}

function buildDuplicateGroup(products, season) {
  const members = products.map(toMember).sort((left, right) =>
    left.slug.localeCompare(right.slug, "en"),
  );
  const affiliateUrls = new Set(
    members.map((member) => member.affiliateUrl).filter(Boolean),
  );
  const sourceHosts = new Set(members.map((member) => member.sourceHost).filter(Boolean));

  return {
    id: [
      "duplicate",
      normalizeBrand(members[0].brand),
      normalizeModelName(members[0].modelName),
      season,
    ].join(":"),
    classification: "EXACT_OR_CROSS_STORE_DUPLICATES",
    confidenceReason:
      "Multiple active Product records have the same normalized brand, full model name, and known season.",
    brand: members[0].brand,
    canonicalCandidateModelName: normalizeModelName(members[0].modelName),
    normalizedSeason: season,
    members,
    sameSourceHost: sourceHosts.size <= 1,
    distinctSourceHostCount: sourceHosts.size,
    distinctAffiliateUrlCount: affiliateUrls.size,
    hasMultipleAffiliateUrls: affiliateUrls.size > 1,
  };
}

function getSnapshotKey(snapshot) {
  return JSON.stringify({
    products: Number(snapshot.products),
    activeProducts: Number(snapshot.activeProducts),
    productSizes: Number(snapshot.productSizes),
    maxUpdatedAt: snapshot.maxUpdatedAt,
  });
}

async function loadDatabaseSnapshot(sql) {
  const [row] = await sql`
    select
      count(*)::int as "products",
      count(*) filter (where is_active = true)::int as "activeProducts",
      (select count(*)::int from product_sizes) as "productSizes",
      max(updated_at)::text as "maxUpdatedAt"
    from products
  `;

  return row;
}

async function assertRequiredSchema(sql) {
  const rows = await sql`
    select table_name as "tableName", column_name as "columnName"
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('products', 'product_sizes')
  `;
  const available = new Set(
    rows.map((row) => `${row.tableName}.${row.columnName}`),
  );
  const missing = [];

  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    for (const column of columns) {
      if (!available.has(`${table}.${column}`)) {
        missing.push(`${table}.${column}`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(`Required catalog schema is missing: ${missing.join(", ")}.`);
  }
}

async function loadActiveProducts(sql) {
  return sql`
    select
      p.id::text as "id",
      p.slug as "slug",
      p.brand as "brand",
      p.model_name as "modelName",
      p.season_label as "seasonLabel",
      p.source_name as "sourceName",
      p.source_url as "sourceUrl",
      p.affiliate_url as "affiliateUrl",
      p.riding_style as "ridingStyle",
      p.skill_level as "skillLevel",
      p.board_line as "boardLine",
      p.shape_type as "shapeType",
      p.camber_profile as "camberProfile",
      p.data_status as "dataStatus",
      p.image_url as "imageUrl",
      p.gallery_images as "galleryImages",
      coalesce(
        json_agg(
          json_build_object(
            'sizeCm', ps.size_cm::float8,
            'sizeLabel', ps.size_label,
            'waistWidthMm', ps.waist_width_mm,
            'widthType', ps.width_type,
            'isAvailable', ps.is_available
          )
          order by ps.size_cm, ps.size_label
        ) filter (where ps.id is not null),
        '[]'::json
      ) as "sizes"
    from products p
    left join product_sizes ps on ps.product_id = p.id
    where p.is_active = true
    group by p.id
    order by lower(p.brand), lower(p.model_name), p.season_label nulls last, p.slug
  `;
}

export function analyzeCatalog(products, databaseSafety) {
  const normalizedProducts = products.map((product) => ({
    ...product,
    normalizedBrand: normalizeBrand(product.brand),
    normalizedModelName: normalizeModelName(product.modelName),
    normalizedSeason: normalizeSeason(product.seasonLabel),
    widthMarker: detectWidthMarker(product.modelName),
  }));
  const productByFullKey = new Map();

  for (const product of normalizedProducts) {
    const key = `${product.normalizedBrand}|${product.normalizedModelName}`;
    const group = productByFullKey.get(key) ?? [];
    group.push(product);
    productByFullKey.set(key, group);
  }

  const highConfidenceWidthFamilies = [];
  const reviewWidthFamilies = [];
  const keepSeparate = [];
  const nearNameSafetyCases = [];
  const seenKeepSeparateIds = new Set();
  const seenNearNameIds = new Set();

  for (const variant of normalizedProducts) {
    if (variant.widthMarker.kind === "base") {
      continue;
    }

    const baseKey = `${variant.normalizedBrand}|${variant.widthMarker.baseModelName}`;
    const bases = productByFullKey.get(baseKey) ?? [];

    if (bases.length === 0) {
      const id = `orphan-width:${variant.slug}`;
      nearNameSafetyCases.push({
        id,
        type: "orphan_width_marker",
        markerKind: variant.widthMarker.kind,
        brand: variant.brand,
        modelName: variant.modelName,
        seasonLabel: variant.seasonLabel ?? null,
        slug: variant.slug,
        reason: "A width-like suffix exists, but no active base-name sibling was found.",
      });
      seenNearNameIds.add(id);
      continue;
    }

    for (const base of bases) {
      const family = buildWidthFamily(base, variant, variant.widthMarker);

      if (family.classification === "HIGH_CONFIDENCE_WIDTH_FAMILY") {
        highConfidenceWidthFamilies.push(family);
      } else if (family.classification === "REVIEW_WIDTH_FAMILY") {
        reviewWidthFamilies.push(family);
      } else {
        keepSeparate.push(family);
        seenKeepSeparateIds.add(family.id);
      }

      if (variant.widthMarker.kind !== "explicit-wide") {
        const id = `ambiguous-width:${base.slug}:${variant.slug}`;
        nearNameSafetyCases.push({
          id,
          type: "ambiguous_width_marker",
          markerKind: variant.widthMarker.kind,
          brand: base.brand,
          baseModelName: base.modelName,
          variantModelName: variant.modelName,
          slugs: [base.slug, variant.slug],
          linkedClassification: family.classification,
          linkedCaseId: family.id,
          reason:
            variant.widthMarker.kind === "ambiguous-mid-wide"
              ? "MID-WIDE name evidence is retained for review and never promoted to HIGH by the explicit-Wide rule."
              : "Standalone W evidence is never sufficient for HIGH confidence.",
        });
        seenNearNameIds.add(id);
      }
    }
  }

  for (const variant of normalizedProducts) {
    const relation = getProtectedSuffixRelation(variant, productByFullKey);
    if (!relation) {
      continue;
    }

    for (const base of relation.bases) {
      const separateCase = buildProtectedKeepSeparateCase(
        base,
        variant,
        relation.suffix,
      );
      if (!seenKeepSeparateIds.has(separateCase.id)) {
        keepSeparate.push(separateCase);
        seenKeepSeparateIds.add(separateCase.id);
      }

      const nearNameId = `protected-suffix:${base.slug}:${variant.slug}`;
      if (!seenNearNameIds.has(nearNameId)) {
        nearNameSafetyCases.push({
          id: nearNameId,
          type: "protected_identity_suffix",
          protectedSuffix: relation.suffix,
          brand: base.brand,
          baseModelName: base.modelName,
          variantModelName: variant.modelName,
          seasons: [base.seasonLabel ?? null, variant.seasonLabel ?? null],
          slugs: [base.slug, variant.slug],
          linkedKeepSeparateId: separateCase.id,
          reason: "The protected suffix remains part of model identity.",
        });
        seenNearNameIds.add(nearNameId);
      }
    }
  }

  const exactOrCrossStoreDuplicates = [];
  for (const group of productByFullKey.values()) {
    if (group.length < 2) {
      continue;
    }

    const byKnownSeason = new Map();
    const missingSeason = [];
    for (const product of group) {
      if (!product.normalizedSeason) {
        missingSeason.push(product);
        continue;
      }

      const seasonGroup = byKnownSeason.get(product.normalizedSeason) ?? [];
      seasonGroup.push(product);
      byKnownSeason.set(product.normalizedSeason, seasonGroup);
    }

    for (const [season, seasonGroup] of byKnownSeason) {
      if (seasonGroup.length > 1) {
        exactOrCrossStoreDuplicates.push(buildDuplicateGroup(seasonGroup, season));
      }
    }

    if (missingSeason.length > 1) {
      const id = `exact-name-missing-season:${missingSeason
        .map((product) => product.slug)
        .sort()
        .join(":")}`;
      nearNameSafetyCases.push({
        id,
        type: "exact_name_missing_season",
        brand: missingSeason[0].brand,
        modelName: missingSeason[0].modelName,
        slugs: missingSeason.map((product) => product.slug).sort(),
        reason:
          "Exact normalized names have missing seasons and are not confirmed duplicates.",
      });
    }
  }

  const sortedHigh = sortFamilies(highConfidenceWidthFamilies);
  const sortedReview = sortFamilies(reviewWidthFamilies);
  const sortedKeepSeparate = sortFamilies(keepSeparate);
  const sortedDuplicates = sortFamilies(exactOrCrossStoreDuplicates);
  const sortedNearNameSafetyCases = [...nearNameSafetyCases].sort((left, right) =>
    left.id.localeCompare(right.id, "en"),
  );
  const routingCandidates = [...sortedHigh, ...sortedReview];
  const highSlugs = new Set(
    sortedHigh.flatMap((family) => family.members.map((member) => member.slug)),
  );
  const beyondMedalsFamily = [...sortedHigh, ...sortedReview, ...sortedKeepSeparate].find(
    (family) =>
      normalizeBrand(family.brand) === "bataleon" &&
      family.canonicalCandidateModelName === "beyond medals" &&
      family.members.some(
        (member) => normalizeModelName(member.modelName) === "beyond medals wide",
      ),
  );
  const beyondMedalsRecords = normalizedProducts
    .filter(
      (product) =>
        product.normalizedBrand === "bataleon" &&
        ["beyond medals", "beyond medals wide"].includes(product.normalizedModelName),
    )
    .map(toMember)
    .sort((left, right) => left.slug.localeCompare(right.slug, "en"));

  return {
    generatedAt: new Date().toISOString(),
    databaseSafety,
    summary: {
      catalog: databaseSafety.after,
      highConfidenceWidthFamilyCount: sortedHigh.length,
      reviewWidthFamilyCount: sortedReview.length,
      keepSeparateCount: sortedKeepSeparate.length,
      exactOrCrossStoreDuplicateCount: sortedDuplicates.length,
      nearNameSafetyCaseCount: sortedNearNameSafetyCases.length,
      routingRisk: {
        candidateFamiliesWithMultipleAffiliateUrls: routingCandidates.filter(
          (family) => family.routingRisk.hasMultipleAffiliateUrls,
        ).length,
        candidateFamiliesWithOneAffiliateUrl: routingCandidates.filter(
          (family) => !family.routingRisk.hasMultipleAffiliateUrls,
        ).length,
      },
      impactEstimate: {
        activeProductRowsInHighFamilies: highSlugs.size,
        canonicalModelFamilies: sortedHigh.length,
        potentialCatalogIdentityReduction: Math.max(0, highSlugs.size - sortedHigh.length),
        potentialRecommendationIdentityReduction: Math.max(
          0,
          highSlugs.size - sortedHigh.length,
        ),
      },
    },
    beyondMedals: {
      found: Boolean(beyondMedalsFamily),
      classification: beyondMedalsFamily?.classification ?? null,
      familyId: beyondMedalsFamily?.id ?? null,
      records: beyondMedalsRecords,
      familyEvidence: beyondMedalsFamily ?? null,
    },
    highConfidenceWidthFamilies: sortedHigh,
    reviewWidthFamilies: sortedReview,
    keepSeparate: sortedKeepSeparate,
    exactOrCrossStoreDuplicates: sortedDuplicates,
    nearNameSafetyCases: sortedNearNameSafetyCases,
  };
}

async function writeReport(report, reportPath) {
  const targetPath = path.resolve(/* turbopackIgnore: true */ reportPath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return targetPath;
}

export async function runModelFamilyAudit(options = {}) {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  const sslMode =
    options.sslMode ?? (process.env.DATABASE_SSL === "disable" ? false : "require");
  const reportPath =
    options.reportPath ??
    process.env.MODEL_FAMILY_AUDIT_REPORT_PATH ??
    DEFAULT_REPORT_PATH;
  const logger = options.logger ?? console;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  const sql = postgres(databaseUrl, {
    ssl: sslMode,
    prepare: false,
    max: 1,
    connect_timeout: 15,
  });

  try {
    const { products, databaseSafety } = await sql.begin(
      "isolation level repeatable read read only",
      async (transaction) => {
        const [transactionSettings] = await transaction`
          select
            current_setting('transaction_read_only') as "readOnly",
            current_setting('transaction_isolation') as "isolationLevel"
        `;
        if (
          transactionSettings.readOnly !== "on" ||
          transactionSettings.isolationLevel !== "repeatable read"
        ) {
          throw new Error("Database transaction is not REPEATABLE READ READ ONLY.");
        }

        await assertRequiredSchema(transaction);
        const before = await loadDatabaseSnapshot(transaction);
        const activeProducts = await loadActiveProducts(transaction);
        const after = await loadDatabaseSnapshot(transaction);

        if (getSnapshotKey(before) !== getSnapshotKey(after)) {
          throw new Error("Catalog snapshot changed during the read-only audit.");
        }

        return {
          products: activeProducts,
          databaseSafety: {
            transactionMode: "isolation level repeatable read read only",
            transactionSettings,
            readOnlyConfirmed: true,
            before,
            after,
            unchanged: true,
          },
        };
      },
    );
    const report = analyzeCatalog(products, databaseSafety);
    const targetPath = await writeReport(report, reportPath);

    logger.log(`Catalog model-family audit report: ${targetPath}`);
    logger.log(
      `Products: ${report.summary.catalog.activeProducts} active / ${report.summary.catalog.products} total; sizes: ${report.summary.catalog.productSizes}.`,
    );
    logger.log(
      `Families: ${report.summary.highConfidenceWidthFamilyCount} HIGH, ${report.summary.reviewWidthFamilyCount} REVIEW, ${report.summary.keepSeparateCount} KEEP-SEPARATE.`,
    );
    logger.log(
      `Exact/cross-store duplicates: ${report.summary.exactOrCrossStoreDuplicateCount}; near-name safety cases: ${report.summary.nearNameSafetyCaseCount}.`,
    );
    logger.log(
      `Beyond Medals: ${report.beyondMedals.found ? report.beyondMedals.classification : "not found"}.`,
    );
    logger.log("Database read-only transaction confirmed; catalog snapshot unchanged.");

    return {
      report,
      reportPath: targetPath,
    };
  } finally {
    await sql.end({ timeout: 1 });
  }
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  try {
    await runModelFamilyAudit();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

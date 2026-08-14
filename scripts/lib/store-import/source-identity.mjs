import { createHash } from "node:crypto";
import {
  mergeImportedProducts,
  normalizeSeasonIdentity,
  normalizeWhitespace,
  slugifyBoard,
} from "./common.mjs";

export const SOURCE_IDENTITY_PLAN_VERSION = "catalog-source-identity-v1";

export const SOURCE_IDENTITY_CLASSES = {
  confirmed: "CONFIRMED_IDENTITY_COLLISION",
  potential: "POTENTIAL_IDENTITY_COLLISION",
  safe: "SAFE_SAME_PRODUCT_MULTI_SOURCE",
  none: "NO_CONFLICT",
};

const BOARD_LINE_VALUES = new Set(["men", "women", "unisex"]);

function normalizeNullable(value) {
  const normalized = normalizeWhitespace(value);
  return normalized || null;
}

export function normalizeSourceIdentityText(value) {
  return normalizeWhitespace(value)
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[’']/gu, "")
    .replace(/&/gu, " and ")
    .replace(/\+/gu, " plus ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function toSlugToken(value) {
  return normalizeSourceIdentityText(value).replace(/\s+/gu, "-");
}

export function getBoardLineEvidence(value) {
  const normalized = normalizeSourceIdentityText(value);

  if (!normalized) {
    return { boardLine: "unisex", evidence: "missing" };
  }

  if (/(?:жен|women|female)/iu.test(normalized)) {
    return { boardLine: "women", evidence: "known" };
  }

  if (/(?:муж|\bmen(?:s)?\b|\bmale\b)/iu.test(normalized)) {
    return { boardLine: "men", evidence: "known" };
  }

  if (
    /(?:унисекс|\bunisex\b|мальчик|малыш|дет|\bkids?\b|\bjunior\b|\byouth\b)/iu.test(
      normalized,
    )
  ) {
    return { boardLine: "unisex", evidence: "known" };
  }

  return { boardLine: "unisex", evidence: "missing" };
}

export function getExplicitVariantMarker(modelName) {
  const normalized = normalizeSourceIdentityText(modelName);

  if (/\bmid wide$/u.test(normalized)) {
    return "mid-wide";
  }

  if (/\bwide(?: snowboard)?$/u.test(normalized)) {
    return "wide";
  }

  return null;
}

export function getStoreIdentityFromUrl(value) {
  const normalized = normalizeNullable(value);
  if (!normalized) {
    return { storeCode: null, sourceProductId: null };
  }

  try {
    const url = new URL(normalized);
    const hostname = url.hostname.toLowerCase();

    if (hostname === "traektoria.ru" || hostname === "www.traektoria.ru") {
      return {
        storeCode: "traektoria",
        sourceProductId: url.pathname.match(/\/product\/(\d+)_/u)?.[1] ?? null,
      };
    }

    if (hostname === "trial-sport.ru" || hostname === "www.trial-sport.ru") {
      return {
        storeCode: "trial-sport",
        sourceProductId:
          url.pathname.match(/\/goods\/\d+\/(\d+)\.html$/u)?.[1] ?? null,
      };
    }
  } catch {
    return { storeCode: null, sourceProductId: null };
  }

  return { storeCode: null, sourceProductId: null };
}

function normalizeSeason(value) {
  const normalized = normalizeSeasonIdentity(value);
  return normalized ? normalizeSourceIdentityText(normalized) : null;
}

export function buildSourceOfferIdentity(product) {
  const urlIdentity = getStoreIdentityFromUrl(
    product?.affiliateUrl || product?.sourceUrl,
  );
  const importMeta = product?.importMeta ?? {};
  const storeCode = normalizeNullable(importMeta.storeCode) ?? urlIdentity.storeCode;
  const sourceProductId =
    normalizeNullable(importMeta.sourceProductId) ?? urlIdentity.sourceProductId;
  const boardLine = BOARD_LINE_VALUES.has(product?.boardLine)
    ? product.boardLine
    : "unisex";
  const boardLineEvidence =
    importMeta.boardLineEvidence === "known" ||
    importMeta.boardLineEvidence === "missing"
      ? importMeta.boardLineEvidence
      : boardLine === "men" || boardLine === "women"
        ? "known"
        : "missing";
  const variantMarker =
    normalizeNullable(importMeta.variantMarker) ??
    getExplicitVariantMarker(product?.modelName);
  const baseSlug =
    normalizeNullable(importMeta.baseSlug) ??
    normalizeNullable(product?.slug) ??
    slugifyBoard(`${product?.brand ?? ""} ${product?.modelName ?? ""}`);

  return {
    storeCode,
    sourceProductId,
    key:
      storeCode && sourceProductId
        ? `${storeCode}|${sourceProductId}`
        : null,
    baseSlug,
    normalizedBrand: normalizeSourceIdentityText(product?.brand),
    normalizedModel: normalizeSourceIdentityText(product?.modelName),
    boardLine,
    boardLineEvidence,
    season: normalizeSeason(product?.seasonLabel),
    variantMarker,
  };
}

function hasKnownLineConflict(left, right) {
  return (
    left.boardLineEvidence === "known" &&
    right.boardLineEvidence === "known" &&
    left.boardLine !== right.boardLine
  );
}

function hasMissingLineRisk(left, right) {
  return (
    left.key !== right.key &&
    (left.boardLineEvidence !== "known" || right.boardLineEvidence !== "known")
  );
}

export function getSourceOfferCompatibility(leftProduct, rightProduct) {
  const left = buildSourceOfferIdentity(leftProduct);
  const right = buildSourceOfferIdentity(rightProduct);
  const reasons = [];

  if (
    left.normalizedBrand !== right.normalizedBrand ||
    left.normalizedModel !== right.normalizedModel
  ) {
    reasons.push("normalized brand/model differ");
  }

  if (
    left.storeCode &&
    right.storeCode &&
    left.storeCode === right.storeCode &&
    left.sourceProductId &&
    right.sourceProductId &&
    left.sourceProductId !== right.sourceProductId
  ) {
    reasons.push("same store has different merchant product IDs");
  }

  if (hasKnownLineConflict(left, right)) {
    reasons.push(`known board lines differ (${left.boardLine}/${right.boardLine})`);
  } else if (hasMissingLineRisk(left, right)) {
    reasons.push("board-line evidence is missing for an ambiguous identity");
  }

  if (left.season && right.season && left.season !== right.season) {
    reasons.push(`known seasons differ (${left.season}/${right.season})`);
  }

  if (left.variantMarker !== right.variantMarker) {
    reasons.push(
      `explicit variants differ (${left.variantMarker ?? "base"}/${right.variantMarker ?? "base"})`,
    );
  }

  return { compatible: reasons.length === 0, reasons };
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right, "en"))
        .map((key) => [key, canonicalize(value[key])]),
    );
  }

  return value;
}

export function getSourceIdentityPlanHash(logicalPlan) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(logicalPlan)))
    .digest("hex");
}

function compareIdentities(left, right) {
  const leftIdentity = buildSourceOfferIdentity(left);
  const rightIdentity = buildSourceOfferIdentity(right);

  return [
    leftIdentity.storeCode ?? "",
    leftIdentity.sourceProductId ?? "",
    leftIdentity.boardLine,
    leftIdentity.season ?? "",
    leftIdentity.variantMarker ?? "",
  ]
    .join("|")
    .localeCompare(
      [
        rightIdentity.storeCode ?? "",
        rightIdentity.sourceProductId ?? "",
        rightIdentity.boardLine,
        rightIdentity.season ?? "",
        rightIdentity.variantMarker ?? "",
      ].join("|"),
      "en",
      { numeric: true },
    );
}

function buildCompatibleClusters(products) {
  const clusters = [];

  for (const product of [...products].sort(compareIdentities)) {
    const compatibleCluster = clusters.find((cluster) =>
      cluster.every(
        (member) => getSourceOfferCompatibility(member, product).compatible,
      ),
    );

    if (compatibleCluster) {
      compatibleCluster.push(product);
    } else {
      clusters.push([product]);
    }
  }

  return clusters;
}

function getClusterIdentity(cluster) {
  const identities = cluster.map(buildSourceOfferIdentity);
  return {
    members: identities,
    boardLine:
      identities.every(
        (identity) =>
          identity.boardLineEvidence === "known" &&
          identity.boardLine === identities[0].boardLine,
      )
        ? identities[0].boardLine
        : null,
    season: identities.every(
      (identity) => identity.season && identity.season === identities[0].season,
    )
      ? identities[0].season
      : null,
    variantMarker: identities.every(
      (identity) => identity.variantMarker === identities[0].variantMarker,
    )
      ? identities[0].variantMarker
      : null,
  };
}

function getExistingIdentity(product) {
  return {
    ...buildSourceOfferIdentity(product),
    slug: product.slug,
    id: product.id ?? null,
  };
}

function isExistingIdentityCompatible(existingProduct, sourceProduct) {
  const existing = getExistingIdentity(existingProduct);
  const source = buildSourceOfferIdentity(sourceProduct);

  if (!existing.key || existing.key !== source.key) {
    return false;
  }

  if (existingProduct.boardLine !== source.boardLine) {
    return false;
  }

  if (existing.season && source.season && existing.season !== source.season) {
    return false;
  }

  if (existing.variantMarker !== source.variantMarker) {
    return false;
  }

  return true;
}

function findExistingSlugsForCluster(cluster, existingProducts, baseSlug) {
  const matches = new Set();

  for (const sourceProduct of cluster) {
    for (const existingProduct of existingProducts) {
      if (!isExistingIdentityCompatible(existingProduct, sourceProduct)) {
        continue;
      }

      if (existingProduct.slug !== baseSlug) {
        matches.add(existingProduct.slug);
      }
    }
  }

  return [...matches].sort((left, right) => left.localeCompare(right, "en"));
}

function getOfficialSpec(officialSpecs, slug) {
  if (officialSpecs instanceof Map) {
    return officialSpecs.get(slug) ?? null;
  }

  return (Array.isArray(officialSpecs) ? officialSpecs : []).find(
    (spec) => spec.slug === slug,
  ) ?? null;
}

function chooseBaseCluster({
  clusters,
  existingProducts,
  officialSpec,
  baseSlug,
  blockingIssues,
}) {
  const historicalOwners = existingProducts.filter(
    (product) => product.slug === baseSlug,
  );

  if (historicalOwners.length > 0) {
    const historicalOwner = historicalOwners[0];
    const historicalIdentity = getExistingIdentity(historicalOwner);

    if (historicalOwners.length > 1) {
      blockingIssues.push(
        `Historical base slug ${baseSlug} has multiple existing owners.`,
      );
      return {
        index: null,
        reason: "historical-base-reserved",
        historicalIdentity: null,
      };
    }

    if (!historicalIdentity.key) {
      blockingIssues.push(
        `Historical base slug ${baseSlug} has no stable source identity.`,
      );
      return {
        index: null,
        reason: "historical-base-reserved",
        historicalIdentity,
      };
    }

    const compatibleClusters = clusters
      .map((cluster, index) => ({
        index,
        compatible: cluster.some((product) =>
          isExistingIdentityCompatible(historicalOwner, product),
        ),
      }))
      .filter((entry) => entry.compatible);

    if (compatibleClusters.length === 1) {
      return {
        index: compatibleClusters[0].index,
        reason: "coherent-existing-base",
        historicalIdentity,
      };
    }

    if (compatibleClusters.length > 1) {
      blockingIssues.push(
        `Historical base slug ${baseSlug} matches multiple current source clusters.`,
      );
    }

    return {
      index: null,
      reason: "historical-base-reserved",
      historicalIdentity,
    };
  }

  if (officialSpec?.boardLine) {
    const specMatches = clusters
      .map((cluster, index) => ({ index, identity: getClusterIdentity(cluster) }))
      .filter((entry) => entry.identity.boardLine === officialSpec.boardLine);

    if (specMatches.length === 1) {
      return {
        index: specMatches[0].index,
        reason: "official-spec-board-line",
        historicalIdentity: null,
      };
    }
  }

  return {
    index: 0,
    reason: "deterministic-source-order",
    historicalIdentity: null,
  };
}

function getCandidateSuffixes(cluster, referenceIdentity, clusters) {
  const identity = getClusterIdentity(cluster);
  const suffixes = [];

  if (
    identity.boardLine &&
    identity.boardLine !== referenceIdentity?.boardLine
  ) {
    const sameLineCount = clusters.filter(
      (candidate) => getClusterIdentity(candidate).boardLine === identity.boardLine,
    ).length;
    if (sameLineCount === 1) {
      suffixes.push(identity.boardLine);
    }
  }

  if (
    identity.variantMarker &&
    identity.variantMarker !== referenceIdentity?.variantMarker
  ) {
    suffixes.push(identity.variantMarker);
  }

  if (identity.season && identity.season !== referenceIdentity?.season) {
    suffixes.push(identity.season);
  }

  for (const member of identity.members) {
    if (member.storeCode && member.sourceProductId) {
      suffixes.push(`${member.storeCode}-${member.sourceProductId}`);
    }
  }

  return [...new Set(suffixes.map(toSlugToken).filter(Boolean))];
}

function resolveClusterSlug({
  cluster,
  clusterIndex,
  baseClusterIndex,
  clusters,
  baseSlug,
  existingProducts,
  usedSlugs,
  blockingIssues,
  historicalIdentity,
}) {
  const priorSlugs = findExistingSlugsForCluster(cluster, existingProducts, baseSlug);

  if (priorSlugs.length === 1) {
    const priorSlug = priorSlugs[0];
    if (!usedSlugs.has(priorSlug)) {
      usedSlugs.add(priorSlug);
      return { slug: priorSlug, reason: "stable-existing-source-slug" };
    }
  }

  if (priorSlugs.length > 1) {
    blockingIssues.push(
      `Source cluster for ${baseSlug} maps to multiple existing slugs: ${priorSlugs.join(", ")}.`,
    );
    return { slug: null, reason: "blocking-existing-identity-duplication" };
  }

  if (baseClusterIndex !== null && clusterIndex === baseClusterIndex) {
    usedSlugs.add(baseSlug);
    return { slug: baseSlug, reason: "base-source-offer" };
  }

  const existingBySlug = new Map(existingProducts.map((product) => [product.slug, product]));
  const suffixes = getCandidateSuffixes(
    cluster,
    baseClusterIndex === null
      ? historicalIdentity
      : getClusterIdentity(clusters[baseClusterIndex]),
    clusters,
  );

  for (const suffix of suffixes) {
    const candidate = `${baseSlug}-${suffix}`;
    const existing = existingBySlug.get(candidate);
    const belongsToCluster =
      !existing || cluster.some((product) => isExistingIdentityCompatible(existing, product));

    if (!usedSlugs.has(candidate) && belongsToCluster) {
      usedSlugs.add(candidate);
      return { slug: candidate, reason: `collision-suffix:${suffix}` };
    }
  }

  blockingIssues.push(`Unable to derive a unique collision slug for ${baseSlug}.`);
  return { slug: null, reason: "blocking-no-safe-slug" };
}

function getGroupClassification(products, clusters) {
  if (products.length <= 1) {
    return SOURCE_IDENTITY_CLASSES.none;
  }

  if (clusters.length === 1) {
    return SOURCE_IDENTITY_CLASSES.safe;
  }

  const identities = products.map(buildSourceOfferIdentity);
  const knownSeasons = new Set(
    identities.map((identity) => identity.season).filter(Boolean),
  );
  const sameStoreDifferentId = identities.some((left, leftIndex) =>
    identities.some(
      (right, rightIndex) =>
        leftIndex !== rightIndex &&
        left.storeCode &&
        left.storeCode === right.storeCode &&
        left.sourceProductId &&
        right.sourceProductId &&
        left.sourceProductId !== right.sourceProductId,
    ),
  );
  const hardConflict = products.some((left, leftIndex) =>
    products.some((right, rightIndex) => {
      if (leftIndex === rightIndex) {
        return false;
      }
      const leftIdentity = buildSourceOfferIdentity(left);
      const rightIdentity = buildSourceOfferIdentity(right);
      return (
        hasKnownLineConflict(leftIdentity, rightIdentity) ||
        leftIdentity.variantMarker !== rightIdentity.variantMarker
      );
    }),
  );

  if (knownSeasons.size > 1 && !hardConflict) {
    return SOURCE_IDENTITY_CLASSES.potential;
  }

  return sameStoreDifferentId || hardConflict
    ? SOURCE_IDENTITY_CLASSES.confirmed
    : SOURCE_IDENTITY_CLASSES.potential;
}

function buildProductEvidence(product) {
  const identity = buildSourceOfferIdentity(product);
  return {
    sourceIdentityKey: identity.key,
    storeCode: identity.storeCode,
    sourceProductId: identity.sourceProductId,
    brand: normalizeWhitespace(product.brand),
    modelName: normalizeWhitespace(product.modelName),
    boardLine: identity.boardLine,
    boardLineEvidence: identity.boardLineEvidence,
    season: identity.season,
    variantMarker: identity.variantMarker,
    affiliateUrl: normalizeNullable(product.affiliateUrl),
    priceFrom:
      Number.isFinite(product.priceFrom) && product.priceFrom > 0
        ? Number(product.priceFrom)
        : null,
    isActive: Boolean(product.isActive),
    sizes: (Array.isArray(product.sizes) ? product.sizes : [])
      .map((size) => ({
        sizeLabel: normalizeWhitespace(size?.sizeLabel ?? size?.sizeCm),
        sizeCm: Number(size?.sizeCm),
        waistWidthMm: Number(size?.waistWidthMm),
        widthType: size?.widthType ?? null,
        isAvailable: size?.isAvailable !== false,
      }))
      .sort(
        (left, right) =>
          left.sizeCm - right.sizeCm ||
          left.sizeLabel.localeCompare(right.sizeLabel, "en", { numeric: true }),
      ),
  };
}

function mergeCluster(cluster, slug) {
  const normalized = cluster.map((product) => ({ ...product, slug }));
  return normalized.slice(1).reduce(
    (current, product) => mergeImportedProducts(current, product),
    normalized[0],
  );
}

export function buildSourceIdentityPlan({
  importedProducts,
  existingProducts = [],
  officialSpecs = new Map(),
}) {
  const products = Array.isArray(importedProducts) ? importedProducts : [];
  const existing = existingProducts instanceof Map
    ? [...existingProducts.values()]
    : Array.isArray(existingProducts)
      ? existingProducts
      : [];
  const blockingIssues = [];
  const groupsBySlug = new Map();

  for (const product of products) {
    const identity = buildSourceOfferIdentity(product);
    if (!identity.storeCode || !identity.sourceProductId || !identity.key) {
      blockingIssues.push(
        `Missing stable source identity for ${product.slug || product.modelName || "unknown product"}.`,
      );
      continue;
    }

    const group = groupsBySlug.get(identity.baseSlug) ?? [];
    group.push(product);
    groupsBySlug.set(identity.baseSlug, group);
  }

  const usedSlugs = new Set();
  const groups = [];
  const resolvedProducts = [];

  for (const [baseSlug, groupProducts] of [...groupsBySlug.entries()].sort(
    ([left], [right]) => left.localeCompare(right, "en"),
  )) {
    const clusters = buildCompatibleClusters(groupProducts);
    const officialSpec = getOfficialSpec(officialSpecs, baseSlug);
    const baseChoice = chooseBaseCluster({
      clusters,
      existingProducts: existing,
      officialSpec,
      baseSlug,
      blockingIssues,
    });
    const classification = getGroupClassification(groupProducts, clusters);
    const assignments = [];

    if (baseChoice.index === null) {
      usedSlugs.add(baseSlug);
    }

    clusters.forEach((cluster, clusterIndex) => {
      const resolved = resolveClusterSlug({
        cluster,
        clusterIndex,
        baseClusterIndex: baseChoice.index,
        clusters,
        baseSlug,
        existingProducts: existing,
        usedSlugs,
        blockingIssues,
        historicalIdentity: baseChoice.historicalIdentity,
      });

      if (!resolved.slug) {
        return;
      }

      const mergedProduct = mergeCluster(cluster, resolved.slug);
      resolvedProducts.push(mergedProduct);
      assignments.push({
        slug: resolved.slug,
        reason:
          clusterIndex === baseChoice.index
            ? `${resolved.reason}:${baseChoice.reason}`
            : resolved.reason,
        members: cluster.map(buildProductEvidence).sort((left, right) =>
          String(left.sourceIdentityKey).localeCompare(
            String(right.sourceIdentityKey),
            "en",
            { numeric: true },
          ),
        ),
      });
    });

    const officialSpecImpact = officialSpec
      ? {
          slug: officialSpec.slug,
          boardLine: officialSpec.boardLine ?? null,
          applicableAssignments: assignments
            .filter((assignment) =>
              assignment.members.every(
                (member) =>
                  !officialSpec.boardLine || member.boardLine === officialSpec.boardLine,
              ),
            )
            .map((assignment) => assignment.slug),
        }
      : null;
    const sourceIdentity = buildSourceOfferIdentity(groupProducts[0]);
    const assignmentSlugs = new Set(
      assignments.map((assignment) => assignment.slug),
    );
    const currentProducts = existing
      .filter((product) => {
        const identity = buildSourceOfferIdentity(product);
        return (
          product.slug === baseSlug ||
          assignmentSlugs.has(product.slug) ||
          (identity.normalizedBrand === sourceIdentity.normalizedBrand &&
            identity.normalizedModel === sourceIdentity.normalizedModel)
        );
      })
      .map((product) => ({
        id: product.id ?? null,
        slug: product.slug,
        familyId: product.familyId ?? null,
        familyMemberRole: product.familyMemberRole ?? null,
        familyMatchMethod: product.familyMatchMethod ?? null,
        familyManualOverride: Boolean(product.familyManualOverride),
        ...buildProductEvidence(product),
      }))
      .sort((left, right) => left.slug.localeCompare(right.slug, "en"));
    const repairRequired = assignments.some((assignment) => {
      const currentProduct = currentProducts.find(
        (product) => product.slug === assignment.slug,
      );
      if (!currentProduct) {
        return true;
      }

      const matchingMember = assignment.members.find(
        (member) => member.sourceIdentityKey === currentProduct.sourceIdentityKey,
      );
      return (
        !matchingMember ||
        currentProduct.boardLine !== matchingMember.boardLine ||
        currentProduct.season !== matchingMember.season ||
        currentProduct.variantMarker !== matchingMember.variantMarker ||
        currentProduct.affiliateUrl !== matchingMember.affiliateUrl ||
        JSON.stringify(
          currentProduct.sizes.map(({ sizeLabel, sizeCm, isAvailable }) => ({
            sizeLabel,
            sizeCm,
            isAvailable,
          })),
        ) !==
          JSON.stringify(
            matchingMember.sizes.map(({ sizeLabel, sizeCm, isAvailable }) => ({
              sizeLabel,
              sizeCm,
              isAvailable,
            })),
          )
      );
    });

    groups.push({
      baseSlug,
      classification,
      sourceCount: groupProducts.length,
      resolvedIdentityCount: clusters.length,
      repairRequired,
      currentProducts,
      officialSpecImpact,
      assignments: assignments.sort((left, right) =>
        left.slug.localeCompare(right.slug, "en"),
      ),
    });
  }

  const logicalPlan = canonicalize({
    version: SOURCE_IDENTITY_PLAN_VERSION,
    blockingIssues: [...new Set(blockingIssues)].sort((left, right) =>
      left.localeCompare(right, "en"),
    ),
    groups,
  });

  return {
    logicalPlan,
    planHash: getSourceIdentityPlanHash(logicalPlan),
    resolvedProducts: resolvedProducts.sort((left, right) =>
      left.slug.localeCompare(right.slug, "en"),
    ),
  };
}

import { execFileSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { analyzeCatalog } from "./audit-model-families.mjs";
import {
  AUDIT_RULE,
  buildBackfillLogicalPlan,
  buildPlanArtifact,
  canonicalStringify,
  compareExistingBackfillState,
  hashCanonicalValue,
  validatePlanArtifact,
} from "./lib/model-family-backfill.mjs";

const BASELINE_REPOSITORY_SHA = "16c8f01d5363eeafaaa4b139e5d409a35ca13cad";
const APPROVED_IDENTITY_FINGERPRINT =
  "188fe8e3a9972149ff23e73d45d0a8c770d625afbbed83a95c4c658f0f7eb760";
const PLAN_PATH = path.resolve("reports/model-family-backfill-plan.json");
const RECEIPT_PATH = path.resolve("reports/model-family-backfill-receipt.json");
const ADVISORY_LOCK_KEY = "edgefit:model-family-backfill:v1";
const EXPECTED_SNAPSHOT = {
  products: 453,
  activeProducts: 405,
  productSizes: 1406,
  maxUpdatedAt: "2026-04-17 20:01:10.302949+00",
  productChecksum: "024ea105c85ae7ae0a532a506c5fe351",
  productSizeChecksum: "f24f13ac725b2ff288ff2b09051cd5c8",
};
const EXPECTED_AUDIT = {
  highConfidenceWidthFamilies: 49,
  reviewWidthFamilies: 15,
  keepSeparate: 34,
  exactOrCrossStoreDuplicates: 0,
  uniqueHighProducts: 98,
};

const FAMILY_COLUMN_EXPECTATIONS = {
  id: { type: "uuid", nullable: false, defaultIncludes: "gen_random_uuid" },
  slug: { type: "text", nullable: false },
  identity_key: { type: "text", nullable: false },
  brand: { type: "text", nullable: false },
  model_name: { type: "text", nullable: false },
  season_label: { type: "text", nullable: false },
  description_short: { type: "text", nullable: true },
  description_full: { type: "text", nullable: true },
  riding_style: { type: "riding_style_type", nullable: true },
  skill_level: { type: "skill_level_type", nullable: true },
  flex: { type: "int2", nullable: true },
  board_line: { type: "board_line_type", nullable: true },
  shape_type: { type: "board_shape_type", nullable: true },
  camber_profile: { type: "camber_profile_type", nullable: true },
  canonical_source_kind: { type: "text", nullable: true },
  canonical_source_name: { type: "text", nullable: true },
  canonical_source_url: { type: "text", nullable: true },
  canonical_source_checked_at: { type: "date", nullable: true },
  canonical_data_status: {
    type: "product_data_status_type",
    nullable: false,
    defaultIncludes: "draft",
  },
  created_at: { type: "timestamptz", nullable: false, defaultIncludes: "now()" },
  updated_at: { type: "timestamptz", nullable: false, defaultIncludes: "now()" },
};
const PRODUCT_FAMILY_COLUMN_EXPECTATIONS = {
  family_id: { type: "uuid", nullable: true },
  family_member_role: { type: "text", nullable: true },
  family_match_method: { type: "text", nullable: true },
  family_match_confidence: { type: "text", nullable: true },
  family_manual_override: {
    type: "bool",
    nullable: false,
    defaultIncludes: "false",
  },
  family_match_reason: { type: "text", nullable: true },
  family_matched_at: { type: "timestamptz", nullable: true },
};
const REQUIRED_CONSTRAINTS = [
  "model_families_pkey",
  "uq_model_families_slug",
  "uq_model_families_identity_key",
  "chk_model_families_flex",
  "chk_model_families_slug_not_blank",
  "chk_model_families_identity_key_not_blank",
  "chk_model_families_brand_not_blank",
  "chk_model_families_model_name_not_blank",
  "chk_model_families_season_label_not_blank",
  "chk_model_families_canonical_source_kind",
  "fk_products_family_id",
  "chk_products_family_member_role",
  "chk_products_family_match_confidence",
  "chk_products_family_membership_coherence",
];
const REQUIRED_INDEXES = [
  "idx_products_family_id",
  "uq_products_one_base_per_family",
];

function parseMode(args) {
  if (args.length === 0) return "PREVIEW";
  if (args.length === 1 && args[0] === "--apply") return "APPLY";
  if (args.length === 1 && args[0] === "--rollback") return "ROLLBACK";
  throw new Error(
    `Unknown arguments: ${args.join(" ")}. Supported modes are PREVIEW, --apply, and --rollback.`,
  );
}

function currentRepositorySha() {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
}

function normalizeDefinition(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/"/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label} is ${actual}, expected ${expected}.`);
  }
}

function assertSnapshot(snapshot, expected = EXPECTED_SNAPSHOT) {
  for (const [key, expectedValue] of Object.entries(expected)) {
    assertEqual(`Catalog snapshot ${key}`, snapshot[key], expectedValue);
  }
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(targetPath, value) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(targetPath, missingMessage) {
  if (!(await pathExists(targetPath))) {
    throw new Error(missingMessage);
  }
  try {
    return JSON.parse(await readFile(targetPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Cannot read ${targetPath}: ${error instanceof Error ? error.message : error}`,
    );
  }
}

async function loadLegacySnapshot(sql) {
  const [products] = await sql`
    select
      count(*)::int as "products",
      count(*) filter (where is_active = true)::int as "activeProducts",
      max(updated_at)::text as "maxUpdatedAt",
      md5(
        coalesce(
          string_agg(
            md5(
              jsonb_build_array(
                id, slug, brand, model_name, season_label,
                description_short, description_full, riding_style, skill_level,
                flex, price_from, image_url, gallery_images, affiliate_url,
                is_active, board_line, shape_type, camber_profile, data_status,
                source_name, source_url, source_checked_at, scenarios,
                not_ideal_for, created_at, updated_at
              )::text
            ),
            '' order by id
          ),
          ''
        )
      ) as "productChecksum"
    from products
  `;
  const [sizes] = await sql`
    select
      count(*)::int as "productSizes",
      md5(
        coalesce(
          string_agg(
            md5(
              jsonb_build_array(
                id, product_id, size_cm, size_label, waist_width_mm,
                recommended_weight_min, recommended_weight_max, width_type,
                is_available
              )::text
            ),
            '' order by id
          ),
          ''
        )
      ) as "productSizeChecksum"
    from product_sizes
  `;

  return {
    products: Number(products.products),
    activeProducts: Number(products.activeProducts),
    productSizes: Number(sizes.productSizes),
    maxUpdatedAt: products.maxUpdatedAt,
    productChecksum: products.productChecksum,
    productSizeChecksum: sizes.productSizeChecksum,
  };
}

async function validateFoundationSchema(sql) {
  const columns = await sql`
    select
      table_name as "tableName",
      column_name as "columnName",
      udt_name as "type",
      is_nullable as "isNullable",
      column_default as "defaultValue"
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('model_families', 'products')
  `;
  const constraints = await sql`
    select
      constraint_row.conname as "name",
      constraint_row.contype as "type",
      constraint_row.conrelid::regclass::text as "tableName",
      case when constraint_row.confrelid = 0 then null
        else constraint_row.confrelid::regclass::text end as "referencedTable",
      constraint_row.confdeltype as "deleteAction",
      pg_get_constraintdef(constraint_row.oid, true) as "definition"
    from pg_constraint constraint_row
    join pg_namespace namespace_row
      on namespace_row.oid = constraint_row.connamespace
    where namespace_row.nspname = 'public'
      and constraint_row.conrelid in ('products'::regclass, 'model_families'::regclass)
  `;
  const indexes = await sql`
    select indexname as "name", indexdef as "definition"
    from pg_indexes
    where schemaname = 'public' and tablename in ('model_families', 'products')
  `;
  const columnByName = new Map(
    columns.map((column) => [`${column.tableName}.${column.columnName}`, column]),
  );
  const constraintByName = new Map(
    constraints.map((constraint) => [constraint.name, constraint]),
  );
  const indexByName = new Map(indexes.map((index) => [index.name, index]));
  const issues = [];

  for (const [tableName, expectations] of [
    ["model_families", FAMILY_COLUMN_EXPECTATIONS],
    ["products", PRODUCT_FAMILY_COLUMN_EXPECTATIONS],
  ]) {
    for (const [columnName, expectation] of Object.entries(expectations)) {
      const column = columnByName.get(`${tableName}.${columnName}`);
      if (!column) {
        issues.push(`Missing ${tableName}.${columnName}.`);
        continue;
      }
      if (column.type !== expectation.type) {
        issues.push(
          `${tableName}.${columnName} has type ${column.type}, expected ${expectation.type}.`,
        );
      }
      if ((column.isNullable === "YES") !== expectation.nullable) {
        issues.push(`${tableName}.${columnName} has invalid nullability.`);
      }
      if (
        expectation.defaultIncludes &&
        !normalizeDefinition(column.defaultValue).includes(expectation.defaultIncludes)
      ) {
        issues.push(`${tableName}.${columnName} has an invalid default.`);
      }
    }
  }
  for (const name of REQUIRED_CONSTRAINTS) {
    if (!constraintByName.has(name)) issues.push(`Missing constraint ${name}.`);
  }
  for (const name of REQUIRED_INDEXES) {
    if (!indexByName.has(name)) issues.push(`Missing index ${name}.`);
  }

  const foreignKey = constraintByName.get("fk_products_family_id");
  if (
    foreignKey &&
    (foreignKey.type !== "f" ||
      foreignKey.tableName !== "products" ||
      foreignKey.referencedTable !== "model_families" ||
      foreignKey.deleteAction !== "n" ||
      !normalizeDefinition(foreignKey.definition).includes("on delete set null"))
  ) {
    issues.push("fk_products_family_id does not target model_families ON DELETE SET NULL.");
  }

  const constraintExpectations = {
    model_families_pkey: ["primary key", "(id)"],
    uq_model_families_slug: ["unique", "(slug)"],
    uq_model_families_identity_key: ["unique", "(identity_key)"],
    chk_model_families_flex: ["flex is null", "flex >= 1", "flex <= 10"],
    chk_model_families_slug_not_blank: ["length", "slug", "> 0"],
    chk_model_families_identity_key_not_blank: ["length", "identity_key", "> 0"],
    chk_model_families_brand_not_blank: ["length", "brand", "> 0"],
    chk_model_families_model_name_not_blank: ["length", "model_name", "> 0"],
    chk_model_families_season_label_not_blank: ["length", "season_label", "> 0"],
    chk_model_families_canonical_source_kind: [
      "canonical_source_kind is null",
      "verified-official",
      "manual",
      "trusted-member",
      "fallback-member",
    ],
  };
  for (const [name, tokens] of Object.entries(constraintExpectations)) {
    const definition = normalizeDefinition(constraintByName.get(name)?.definition);
    if (tokens.some((token) => !definition.includes(token))) {
      issues.push(`${name} has an unexpected definition.`);
    }
  }

  const roleConstraint = normalizeDefinition(
    constraintByName.get("chk_products_family_member_role")?.definition,
  );
  if (
    roleConstraint &&
    ["base", "wide", "other"].some((value) => !roleConstraint.includes(value))
  ) {
    issues.push("chk_products_family_member_role has an unexpected definition.");
  }
  const confidenceConstraint = normalizeDefinition(
    constraintByName.get("chk_products_family_match_confidence")?.definition,
  );
  if (
    confidenceConstraint &&
    ["high", "reviewed"].some((value) => !confidenceConstraint.includes(value))
  ) {
    issues.push("chk_products_family_match_confidence has an unexpected definition.");
  }
  const coherenceConstraint = normalizeDefinition(
    constraintByName.get("chk_products_family_membership_coherence")?.definition,
  );
  for (const token of [
    "family_id is null",
    "family_member_role is null",
    "family_id is not null",
    "family_match_method is not null",
    "family_match_confidence is not null",
    "family_matched_at is not null",
  ]) {
    if (coherenceConstraint && !coherenceConstraint.includes(token)) {
      issues.push("chk_products_family_membership_coherence has an unexpected definition.");
      break;
    }
  }
  const baseIndex = normalizeDefinition(
    indexByName.get("uq_products_one_base_per_family")?.definition,
  );
  if (
    baseIndex &&
    (!baseIndex.includes("create unique index") ||
      !baseIndex.includes("family_member_role = 'base'::text"))
  ) {
    issues.push("uq_products_one_base_per_family has an unexpected definition.");
  }
  const familyIndex = normalizeDefinition(
    indexByName.get("idx_products_family_id")?.definition,
  );
  if (
    familyIndex &&
    (!familyIndex.includes("create index") || !familyIndex.includes("(family_id)"))
  ) {
    issues.push("idx_products_family_id has an unexpected definition.");
  }

  if (issues.length > 0) {
    throw new Error(`Task012D foundation is invalid:\n- ${issues.join("\n- ")}`);
  }
}

async function loadFoundationCounts(sql) {
  const [row] = await sql`
    select
      (select count(*)::int from model_families) as "families",
      count(*) filter (where family_id is not null)::int as "assignedProducts",
      count(*) filter (where family_manual_override = true)::int as "manualOverrides",
      count(*) filter (where family_member_role = 'base')::int as "baseMemberships",
      count(*) filter (where family_member_role = 'wide')::int as "wideMemberships",
      count(*) filter (where family_match_method = ${AUDIT_RULE})::int as "auditHighMemberships",
      count(*) filter (where family_match_confidence = 'high')::int as "highMemberships"
    from products
  `;
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, Number(value)]),
  );
}

async function loadActiveProducts(sql) {
  return sql`
    select
      p.id::text as "id",
      p.slug as "slug",
      p.brand as "brand",
      p.model_name as "modelName",
      p.season_label as "seasonLabel",
      p.description_short as "descriptionShort",
      p.description_full as "descriptionFull",
      p.riding_style as "ridingStyle",
      p.skill_level as "skillLevel",
      p.flex::int as "flex",
      p.board_line as "boardLine",
      p.shape_type as "shapeType",
      p.camber_profile as "camberProfile",
      p.data_status as "dataStatus",
      p.source_name as "sourceName",
      p.source_url as "sourceUrl",
      p.source_checked_at::text as "sourceCheckedAt",
      p.affiliate_url as "affiliateUrl",
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
          ) order by ps.size_cm, ps.size_label
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

async function loadExistingFamilies(sql) {
  const rows = await sql`
    select
      mf.id::text as "familyId",
      mf.slug as "familySlug",
      mf.identity_key as "identityKey",
      mf.brand as "familyBrand",
      mf.model_name as "familyModelName",
      mf.season_label as "familySeasonLabel",
      mf.description_short as "descriptionShort",
      mf.description_full as "descriptionFull",
      mf.riding_style as "ridingStyle",
      mf.skill_level as "skillLevel",
      mf.flex::int as "flex",
      mf.board_line as "boardLine",
      mf.shape_type as "shapeType",
      mf.camber_profile as "camberProfile",
      mf.canonical_source_kind as "canonicalSourceKind",
      mf.canonical_source_name as "canonicalSourceName",
      mf.canonical_source_url as "canonicalSourceUrl",
      mf.canonical_source_checked_at::text as "canonicalSourceCheckedAt",
      mf.canonical_data_status as "canonicalDataStatus",
      p.id::text as "productId",
      p.slug as "productSlug",
      p.family_member_role as "role",
      p.family_match_method as "matchMethod",
      p.family_match_confidence as "confidence",
      p.family_manual_override as "manualOverride",
      p.family_match_reason as "reason",
      p.family_matched_at::text as "matchedAt"
    from model_families mf
    left join products p on p.family_id = mf.id
    order by mf.identity_key, p.slug
  `;
  const families = new Map();

  for (const row of rows) {
    let family = families.get(row.familyId);
    if (!family) {
      family = {
        id: row.familyId,
        identityKey: row.identityKey,
        slug: row.familySlug,
        brand: row.familyBrand,
        modelName: row.familyModelName,
        seasonLabel: row.familySeasonLabel,
        canonicalFamily: {
          descriptionShort: row.descriptionShort,
          descriptionFull: row.descriptionFull,
          ridingStyle: row.ridingStyle,
          skillLevel: row.skillLevel,
          flex: row.flex,
          boardLine: row.boardLine,
          shapeType: row.shapeType,
          camberProfile: row.camberProfile,
          canonicalSourceKind: row.canonicalSourceKind,
          canonicalSourceName: row.canonicalSourceName,
          canonicalSourceUrl: row.canonicalSourceUrl,
          canonicalSourceCheckedAt: row.canonicalSourceCheckedAt,
          canonicalDataStatus: row.canonicalDataStatus,
        },
        members: [],
      };
      families.set(row.familyId, family);
    }
    if (row.productId) {
      family.members.push({
        productId: row.productId,
        productSlug: row.productSlug,
        role: row.role,
        matchMethod: row.matchMethod,
        confidence: row.confidence,
        manualOverride: row.manualOverride,
        reason: row.reason,
        matchedAt: row.matchedAt,
      });
    }
  }

  return [...families.values()];
}

function validateAuditPlan(logicalPlan) {
  for (const [key, expected] of Object.entries(EXPECTED_AUDIT)) {
    assertEqual(`Audit summary ${key}`, logicalPlan.auditSummary[key], expected);
  }
  assertEqual(
    "Approved HIGH identity fingerprint",
    logicalPlan.approvedIdentityFingerprint,
    APPROVED_IDENTITY_FINGERPRINT,
  );
  assertEqual("Proposed family count", logicalPlan.families.length, 49);
}

function validateCurrentState(logicalPlan, families, counts) {
  if (counts.manualOverrides !== 0) {
    throw new Error(`Expected zero manual overrides, found ${counts.manualOverrides}.`);
  }
  const comparison = compareExistingBackfillState(logicalPlan, families);

  if (comparison.status === "EMPTY") {
    if (counts.families !== 0 || counts.assignedProducts !== 0) {
      throw new Error("Partial family state exists without complete model_families rows.");
    }
    return comparison;
  }
  if (comparison.status === "CONFLICT") {
    throw new Error(`Existing family state conflicts:\n- ${comparison.reasons.join("\n- ")}`);
  }
  if (counts.families !== 49 || counts.assignedProducts !== 98) {
    throw new Error("Exact family comparison disagrees with foundation counts.");
  }
  return comparison;
}

async function buildCurrentLogicalPlan(sql, repositorySha, transactionMode) {
  await validateFoundationSchema(sql);
  const before = await loadLegacySnapshot(sql);
  assertSnapshot(before);
  const products = await loadActiveProducts(sql);
  const after = await loadLegacySnapshot(sql);
  if (canonicalStringify(before) !== canonicalStringify(after)) {
    throw new Error("Legacy catalog snapshot changed while building the plan.");
  }
  const databaseSafety = {
    transactionMode,
    readOnlyConfirmed: transactionMode.includes("read only"),
    before,
    after,
    unchanged: true,
  };
  const analysis = analyzeCatalog(products, databaseSafety);
  const logicalPlan = buildBackfillLogicalPlan({
    analysis,
    products,
    baselineRepositorySha: repositorySha,
    snapshot: before,
  });
  validateAuditPlan(logicalPlan);
  return { logicalPlan, analysis, products, snapshot: before };
}

async function loadStructuralSummary(sql) {
  const counts = await loadFoundationCounts(sql);
  const badFamilies = await sql`
    select
      mf.id::text as "familyId",
      count(p.id)::int as "members",
      count(p.id) filter (where p.family_member_role = 'base')::int as "baseMembers",
      count(p.id) filter (where p.family_member_role = 'wide')::int as "wideMembers"
    from model_families mf
    left join products p on p.family_id = mf.id
    group by mf.id
    having count(p.id) <> 2
      or count(p.id) filter (where p.family_member_role = 'base') <> 1
      or count(p.id) filter (where p.family_member_role = 'wide') <> 1
  `;
  return { ...counts, structurallyInvalidFamilies: badFamilies.length };
}

async function loadBeyondMedalsEvidence(sql) {
  const rows = await sql`
    select
      mf.id::text as "familyId",
      mf.slug as "familySlug",
      mf.brand,
      mf.model_name as "modelName",
      mf.season_label as "seasonLabel",
      p.slug as "productSlug",
      p.family_member_role as "role",
      p.affiliate_url as "affiliateUrl",
      coalesce(
        json_agg(
          json_build_object(
            'sizeCm', ps.size_cm::float8,
            'sizeLabel', ps.size_label,
            'waistWidthMm', ps.waist_width_mm,
            'widthType', ps.width_type
          ) order by ps.size_cm, ps.size_label
        ) filter (where ps.id is not null),
        '[]'::json
      ) as sizes
    from model_families mf
    join products p on p.family_id = mf.id
    left join product_sizes ps on ps.product_id = p.id
    where mf.slug = 'bataleon-beyond-medals'
    group by mf.id, p.id
    order by p.slug
  `;
  if (rows.length !== 2) {
    throw new Error(`Beyond Medals expected two members, found ${rows.length}.`);
  }
  const rawWLabels = rows.flatMap((row) => row.sizes).filter((size) =>
    /\d+(?:[.,]\d+)?\s*w\b/iu.test(size.sizeLabel ?? ""),
  );
  return {
    familyId: rows[0].familyId,
    familySlug: rows[0].familySlug,
    brand: rows[0].brand,
    modelName: rows[0].modelName,
    seasonLabel: rows[0].seasonLabel,
    members: rows.map((row) => ({
      productSlug: row.productSlug,
      role: row.role,
      sizes: row.sizes,
    })),
    rawWLabelsInvented: rawWLabels.length > 0,
  };
}

function assertPostApplyState(comparison, structural) {
  if (comparison.status !== "NOOP") {
    throw new Error("Post-apply family state is not an exact match.");
  }
  const expected = {
    families: 49,
    assignedProducts: 98,
    manualOverrides: 0,
    baseMemberships: 49,
    wideMemberships: 49,
    auditHighMemberships: 98,
    highMemberships: 98,
    structurallyInvalidFamilies: 0,
  };
  for (const [key, value] of Object.entries(expected)) {
    assertEqual(`Post-apply ${key}`, structural[key], value);
  }
}

async function insertBackfill(sql, logicalPlan, matchedAt) {
  const familyRows = logicalPlan.families.map((family) => {
    const canonical = family.canonicalFamily;
    return {
      slug: family.slug,
      identity_key: family.identityKey,
      brand: family.brand,
      model_name: family.modelName,
      season_label: family.seasonLabel,
      description_short: canonical.descriptionShort,
      description_full: canonical.descriptionFull,
      riding_style: canonical.ridingStyle,
      skill_level: canonical.skillLevel,
      flex: canonical.flex,
      board_line: canonical.boardLine,
      shape_type: canonical.shapeType,
      camber_profile: canonical.camberProfile,
      canonical_source_kind: canonical.canonicalSourceKind,
      canonical_source_name: canonical.canonicalSourceName,
      canonical_source_url: canonical.canonicalSourceUrl,
      canonical_source_checked_at: canonical.canonicalSourceCheckedAt,
      canonical_data_status: canonical.canonicalDataStatus,
    };
  });
  const insertedFamilies = await sql`
    insert into model_families ${sql(
      familyRows,
      "slug",
      "identity_key",
      "brand",
      "model_name",
      "season_label",
      "description_short",
      "description_full",
      "riding_style",
      "skill_level",
      "flex",
      "board_line",
      "shape_type",
      "camber_profile",
      "canonical_source_kind",
      "canonical_source_name",
      "canonical_source_url",
      "canonical_source_checked_at",
      "canonical_data_status",
    )}
    returning id::text as id, identity_key as "identityKey"
  `;
  if (insertedFamilies.length !== logicalPlan.families.length) {
    throw new Error("Not all proposed model families were inserted.");
  }
  const familyIds = new Map(
    insertedFamilies.map((family) => [family.identityKey, family.id]),
  );
  const members = logicalPlan.families.flatMap((family) =>
    family.memberProposals.map((member) => ({
      ...member,
      familyId: familyIds.get(family.identityKey),
    })),
  );
  const updatedProducts = await sql`
    update products p
    set
      family_id = proposed.family_id,
      family_member_role = proposed.member_role,
      family_match_method = proposed.match_method,
      family_match_confidence = proposed.confidence,
      family_manual_override = false,
      family_match_reason = proposed.reason,
      family_matched_at = ${matchedAt}
    from unnest(
      ${members.map((member) => member.productId)}::uuid[],
      ${members.map((member) => member.familyId)}::uuid[],
      ${members.map((member) => member.role)}::text[],
      ${members.map((member) => member.matchMethod)}::text[],
      ${members.map((member) => member.confidence)}::text[],
      ${members.map((member) => member.reason)}::text[]
    ) as proposed(
      product_id,
      family_id,
      member_role,
      match_method,
      confidence,
      reason
    )
    where p.id = proposed.product_id
      and p.family_id is null
      and p.family_member_role is null
      and p.family_manual_override = false
    returning p.id
  `;
  if (updatedProducts.length !== members.length) {
    throw new Error(
      `Assigned ${updatedProducts.length} Products, expected ${members.length}.`,
    );
  }

  return {
    familiesInserted: insertedFamilies.length,
    productsUpdated: updatedProducts.length,
  };
}

function receiptFamilies(existingFamilies, logicalPlan) {
  const expectedByIdentity = new Map(
    logicalPlan.families.map((family) => [family.identityKey, family]),
  );
  return existingFamilies
    .map((family) => {
      const expected = expectedByIdentity.get(family.identityKey);
      return {
        familyId: family.id,
        identityKey: family.identityKey,
        slug: family.slug,
        baseProductId: expected.baseProductId,
        baseProductSlug: expected.baseProductSlug,
        wideProductId: expected.wideProductId,
        wideProductSlug: expected.wideProductSlug,
      };
    })
    .sort((left, right) => left.identityKey.localeCompare(right.identityKey, "en"));
}

function validateReceipt(receipt, planArtifact, existingFamilies, logicalPlan) {
  if (receipt.planHash !== planArtifact.planHash) {
    throw new Error("Backfill receipt plan hash does not match the preview plan.");
  }
  const expectedFamilies = receiptFamilies(existingFamilies, logicalPlan);
  if (canonicalStringify(receipt.families) !== canonicalStringify(expectedFamilies)) {
    throw new Error("Backfill receipt family identities do not match the database.");
  }
}

async function runPreview(sql, repositorySha) {
  const result = await sql.begin(
    "isolation level repeatable read read only",
    async (transaction) => {
      const [settings] = await transaction`
        select
          current_setting('transaction_read_only') as "readOnly",
          current_setting('transaction_isolation') as "isolationLevel"
      `;
      if (settings.readOnly !== "on" || settings.isolationLevel !== "repeatable read") {
        throw new Error("PREVIEW transaction is not REPEATABLE READ READ ONLY.");
      }
      const current = await buildCurrentLogicalPlan(
        transaction,
        repositorySha,
        "isolation level repeatable read read only",
      );
      const counts = await loadFoundationCounts(transaction);
      const families = await loadExistingFamilies(transaction);
      const state = validateCurrentState(current.logicalPlan, families, counts);
      return { ...current, counts, state, settings };
    },
  );
  const artifact = buildPlanArtifact(result.logicalPlan, new Date().toISOString());
  await writeJson(PLAN_PATH, artifact);

  console.log("Model family HIGH backfill");
  console.log("mode: PREVIEW");
  console.log("schema: valid");
  console.log(`HIGH families: ${artifact.auditSummary.highConfidenceWidthFamilies}`);
  console.log(`HIGH Product memberships: ${artifact.auditSummary.uniqueHighProducts}`);
  console.log(`REVIEW: ${artifact.auditSummary.reviewWidthFamilies}`);
  console.log(`KEEP_SEPARATE: ${artifact.auditSummary.keepSeparate}`);
  console.log(`existing families: ${result.counts.families}`);
  console.log(`existing assignments: ${result.counts.assignedProducts}`);
  console.log(`manual overrides: ${result.counts.manualOverrides}`);
  console.log(`existing state: ${result.state.status}`);
  console.log(`plan: ${PLAN_PATH}`);
  console.log(`plan hash: ${artifact.planHash}`);
  console.log("DB writes: 0");
  console.log("READY TO APPLY");
  return { artifact, result };
}

async function runApply(sql, repositorySha) {
  const planArtifact = await readJson(PLAN_PATH, "No preview plan exists. Run preview first.");
  const savedLogicalPlan = validatePlanArtifact(planArtifact);
  assertEqual(
    "Preview baseline repository SHA",
    savedLogicalPlan.baselineRepositorySha,
    BASELINE_REPOSITORY_SHA,
  );
  const receiptAlreadyExists = await pathExists(RECEIPT_PATH);

  const result = await sql.begin("isolation level serializable", async (transaction) => {
    await transaction`select pg_advisory_xact_lock(hashtext(${ADVISORY_LOCK_KEY}))`;
    const [settings] = await transaction`
      select
        current_setting('transaction_read_only') as "readOnly",
        current_setting('transaction_isolation') as "isolationLevel",
        transaction_timestamp()::text as "matchedAt"
    `;
    if (settings.readOnly !== "off" || settings.isolationLevel !== "serializable") {
      throw new Error("APPLY transaction is not SERIALIZABLE read-write.");
    }

    const current = await buildCurrentLogicalPlan(
      transaction,
      repositorySha,
      "isolation level serializable",
    );
    if (
      hashCanonicalValue(current.logicalPlan) !== planArtifact.planHash ||
      canonicalStringify(current.logicalPlan) !== canonicalStringify(savedLogicalPlan)
    ) {
      throw new Error("Fresh APPLY plan differs from the saved PREVIEW plan.");
    }

    const beforeCounts = await loadFoundationCounts(transaction);
    const beforeFamilies = await loadExistingFamilies(transaction);
    const state = validateCurrentState(
      current.logicalPlan,
      beforeFamilies,
      beforeCounts,
    );
    if (state.status === "EMPTY" && receiptAlreadyExists) {
      throw new Error("A stale backfill receipt exists for an empty database state.");
    }
    if (state.status === "NOOP" && !receiptAlreadyExists) {
      throw new Error("Exact backfill state exists but the required receipt is missing.");
    }

    const mutation =
      state.status === "EMPTY"
        ? await insertBackfill(transaction, current.logicalPlan, settings.matchedAt)
        : { familiesInserted: 0, productsUpdated: 0 };
    const afterFamilies = await loadExistingFamilies(transaction);
    const afterComparison = compareExistingBackfillState(
      current.logicalPlan,
      afterFamilies,
    );
    const structural = await loadStructuralSummary(transaction);
    assertPostApplyState(afterComparison, structural);
    const afterSnapshot = await loadLegacySnapshot(transaction);
    if (canonicalStringify(current.snapshot) !== canonicalStringify(afterSnapshot)) {
      throw new Error("Legacy Product/ProductSize data changed during APPLY.");
    }
    const beyondMedals = await loadBeyondMedalsEvidence(transaction);
    if (beyondMedals.rawWLabelsInvented) {
      throw new Error("Beyond Medals raw W labels changed unexpectedly.");
    }

    return {
      action: state.status === "EMPTY" ? "CREATED" : "NOOP",
      settings,
      beforeSnapshot: current.snapshot,
      afterSnapshot,
      beforeCounts,
      structural,
      mutation,
      matchedAt: afterComparison.matchedAt,
      families: afterFamilies,
      beyondMedals,
      logicalPlan: current.logicalPlan,
    };
  });

  const receipt = {
    version: "model-family-backfill-receipt-v1",
    appliedAt: result.matchedAt,
    planHash: planArtifact.planHash,
    result: result.action,
    familyCount: result.structural.families,
    membershipCount: result.structural.assignedProducts,
    families: receiptFamilies(result.families, result.logicalPlan),
    beforeSnapshot: result.beforeSnapshot,
    afterSnapshot: result.afterSnapshot,
    structuralValidation: result.structural,
    beyondMedals: result.beyondMedals,
  };

  if (result.action === "CREATED") {
    await writeJson(RECEIPT_PATH, receipt);
  } else {
    const existingReceipt = await readJson(
      RECEIPT_PATH,
      "Exact backfill state exists but the required receipt is missing.",
    );
    validateReceipt(existingReceipt, planArtifact, result.families, result.logicalPlan);
  }

  console.log("Model family HIGH backfill");
  console.log("mode: APPLY");
  console.log("advisory lock: acquired");
  console.log("transaction isolation: serializable");
  console.log("plan revalidation: PASS");
  console.log(`result: ${result.action}`);
  console.log(`families inserted: ${result.mutation.familiesInserted}`);
  console.log(`Products updated: ${result.mutation.productsUpdated}`);
  console.log(`families total: ${result.structural.families}`);
  console.log(`memberships total: ${result.structural.assignedProducts}`);
  console.log("post-validation: PASS");
  console.log("transaction: committed");
  console.log(`receipt: ${RECEIPT_PATH}`);
  return { planArtifact, result, receipt };
}

async function runRollback(sql) {
  const planArtifact = await readJson(PLAN_PATH, "Rollback requires the saved preview plan.");
  const logicalPlan = validatePlanArtifact(planArtifact);
  const receipt = await readJson(RECEIPT_PATH, "Rollback requires the apply receipt.");

  return sql.begin("isolation level serializable", async (transaction) => {
    await transaction`select pg_advisory_xact_lock(hashtext(${ADVISORY_LOCK_KEY}))`;
    await validateFoundationSchema(transaction);
    const beforeSnapshot = await loadLegacySnapshot(transaction);
    const existingFamilies = await loadExistingFamilies(transaction);
    const counts = await loadFoundationCounts(transaction);
    const state = validateCurrentState(logicalPlan, existingFamilies, counts);
    if (state.status !== "NOOP") {
      throw new Error("Rollback target is not the exact automatic Task012E state.");
    }
    validateReceipt(receipt, planArtifact, existingFamilies, logicalPlan);
    const familyIdByIdentity = new Map(
      existingFamilies.map((family) => [family.identityKey, family.id]),
    );

    for (const family of logicalPlan.families) {
      const familyId = familyIdByIdentity.get(family.identityKey);
      for (const member of family.memberProposals) {
        const cleared = await transaction`
          update products
          set
            family_id = null,
            family_member_role = null,
            family_match_method = null,
            family_match_confidence = null,
            family_match_reason = null,
            family_matched_at = null
          where id = ${member.productId}
            and family_id = ${familyId}
            and family_match_method = ${AUDIT_RULE}
            and family_match_confidence = 'high'
            and family_manual_override = false
          returning id
        `;
        if (cleared.length !== 1) {
          throw new Error(`Rollback could not safely clear ${member.productSlug}.`);
        }
      }
    }

    for (const family of logicalPlan.families) {
      const familyId = familyIdByIdentity.get(family.identityKey);
      const deleted = await transaction`
        delete from model_families mf
        where mf.id = ${familyId}
          and mf.identity_key = ${family.identityKey}
          and not exists (select 1 from products p where p.family_id = mf.id)
        returning id
      `;
      if (deleted.length !== 1) {
        throw new Error(`Rollback could not safely delete ${family.identityKey}.`);
      }
    }

    const afterCounts = await loadFoundationCounts(transaction);
    if (
      afterCounts.families !== 0 ||
      afterCounts.assignedProducts !== 0 ||
      afterCounts.manualOverrides !== 0
    ) {
      throw new Error("Rollback post-condition failed.");
    }
    const afterSnapshot = await loadLegacySnapshot(transaction);
    if (canonicalStringify(beforeSnapshot) !== canonicalStringify(afterSnapshot)) {
      throw new Error("Legacy Product/ProductSize data changed during rollback.");
    }

    console.log("Model family HIGH backfill");
    console.log("mode: ROLLBACK");
    console.log("guarded automatic memberships cleared: 98");
    console.log("guarded automatic families deleted: 49");
    console.log("legacy snapshot: unchanged");
    return { beforeSnapshot, afterSnapshot, afterCounts };
  });
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set.");
  const repositorySha = currentRepositorySha();
  if (mode !== "ROLLBACK" && repositorySha !== BASELINE_REPOSITORY_SHA) {
    throw new Error(
      `Repository HEAD is ${repositorySha}, expected ${BASELINE_REPOSITORY_SHA}.`,
    );
  }
  const sql = postgres(databaseUrl, {
    ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
    prepare: false,
    max: 1,
    connect_timeout: 15,
    onnotice: () => {},
  });

  try {
    if (mode === "PREVIEW") return await runPreview(sql, repositorySha);
    if (mode === "APPLY") return await runApply(sql, repositorySha);
    return await runRollback(sql);
  } finally {
    await sql.end({ timeout: 1 });
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { analyzeCatalog } from "../audit-model-families.mjs";
import {
  AUDIT_RULE,
  buildBackfillLogicalPlan,
  canonicalStringify,
} from "./model-family-backfill.mjs";
import {
  BACKFILL_LOCK_KEY,
  RECONCILIATION_LOCK_KEY,
  assertModelFamilyMutationCounts,
  assertModelFamilyMutationPlanFingerprint,
  buildModelFamilyReconciliationPlan,
  getModelFamilyMutationPlanFingerprint,
  hasReconciliationMutations,
} from "./model-family-reconciliation.mjs";

const REQUIRED_FAMILY_COLUMNS = [
  "id", "slug", "identity_key", "brand", "model_name", "season_label",
  "description_short", "description_full", "riding_style", "skill_level", "flex",
  "board_line", "shape_type", "camber_profile", "canonical_source_kind",
  "canonical_source_name", "canonical_source_url", "canonical_source_checked_at",
  "canonical_data_status", "created_at", "updated_at",
];
const REQUIRED_PRODUCT_COLUMNS = [
  "family_id", "family_member_role", "family_match_method",
  "family_match_confidence", "family_manual_override", "family_match_reason",
  "family_matched_at",
];
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;

function getDatabaseOptions(options) {
  return {
    databaseUrl: options.databaseUrl ?? process.env.DATABASE_URL,
    sslMode:
      options.sslMode ??
      (process.env.DATABASE_SSL === "disable" ? false : "require"),
  };
}

function createSql(options) {
  const { databaseUrl, sslMode } = getDatabaseOptions(options);
  if (!databaseUrl) throw new Error("DATABASE_URL is not set.");
  return postgres(databaseUrl, {
    ssl: sslMode,
    prepare: false,
    max: 1,
    connect_timeout: 15,
    onnotice: () => {},
  });
}

async function maybeWriteReport(report, options) {
  if (options.writeReportToFile !== true) return null;
  const reportPath = path.resolve(
    /* turbopackIgnore: true */
    options.reportPath ??
      process.env.MODEL_FAMILY_RECONCILIATION_REPORT_PATH ??
      "reports/model-family-reconciliation.json",
  );
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

async function validateFoundation(sql) {
  const rows = await sql`
    select table_name as "tableName", column_name as "columnName"
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('model_families', 'products')
  `;
  const available = new Set(rows.map((row) => `${row.tableName}.${row.columnName}`));
  const missing = [
    ...REQUIRED_FAMILY_COLUMNS.map((column) => `model_families.${column}`),
    ...REQUIRED_PRODUCT_COLUMNS.map((column) => `products.${column}`),
  ].filter((column) => !available.has(column));
  const constraints = await sql`
    select conname as "name"
    from pg_constraint
    where connamespace = 'public'::regnamespace
  `;
  const names = new Set(constraints.map((row) => row.name));
  for (const name of [
    "fk_products_family_id",
    "chk_products_family_member_role",
    "chk_products_family_match_confidence",
    "chk_products_family_membership_coherence",
  ]) {
    if (!names.has(name)) missing.push(`constraint:${name}`);
  }
  if (missing.length) {
    throw new Error(`Model-family foundation is incomplete: ${missing.join(", ")}.`);
  }
}

async function loadLegacySnapshot(sql) {
  const [products] = await sql`
    select count(*)::int as "products",
      count(*) filter (where is_active)::int as "activeProducts",
      max(updated_at)::text as "maxUpdatedAt",
      md5(coalesce(string_agg(md5(jsonb_build_array(
        id, slug, brand, model_name, season_label, description_short,
        description_full, riding_style, skill_level, flex, price_from,
        image_url, gallery_images, affiliate_url, is_active, board_line,
        shape_type, camber_profile, data_status, source_name, source_url,
        source_checked_at, scenarios, not_ideal_for, created_at, updated_at
      )::text), '' order by id), '')) as "productChecksum"
    from products
  `;
  const [sizes] = await sql`
    select count(*)::int as "productSizes",
      md5(coalesce(string_agg(md5(jsonb_build_array(
        id, product_id, size_cm, size_label, waist_width_mm,
        recommended_weight_min, recommended_weight_max, width_type, is_available
      )::text), '' order by id), '')) as "productSizeChecksum"
    from product_sizes
  `;
  return { ...products, ...sizes };
}

async function loadFamilySnapshot(sql) {
  const [families] = await sql`
    select count(*)::int as "families",
      md5(coalesce(string_agg(md5(jsonb_build_array(
        id, slug, identity_key, brand, model_name, season_label,
        description_short, description_full, riding_style, skill_level, flex,
        board_line, shape_type, camber_profile, canonical_source_kind,
        canonical_source_name, canonical_source_url, canonical_source_checked_at,
        canonical_data_status, created_at, updated_at
      )::text), '' order by id), '')) as "familyChecksum"
    from model_families
  `;
  const [members] = await sql`
    select count(*) filter (where family_id is not null)::int as "memberships",
      count(*) filter (where family_member_role = 'base')::int as "baseMemberships",
      count(*) filter (where family_member_role = 'wide')::int as "wideMemberships",
      count(*) filter (where family_manual_override)::int as "manualOverrides",
      count(*) filter (where family_manual_override and family_id is null)::int as "manualBlocks",
      md5(coalesce(string_agg(md5(jsonb_build_array(
        id, family_id, family_member_role, family_match_method,
        family_match_confidence, family_manual_override, family_match_reason,
        family_matched_at
      )::text), '' order by id) filter (where family_id is not null or family_manual_override), '')) as "membershipChecksum"
    from products
  `;
  return { ...families, ...members };
}

async function loadProducts(sql) {
  return sql`
    select p.id::text as "id", p.slug, p.brand, p.model_name as "modelName",
      p.season_label as "seasonLabel", p.description_short as "descriptionShort",
      p.description_full as "descriptionFull", p.riding_style as "ridingStyle",
      p.skill_level as "skillLevel", p.flex::int, p.board_line as "boardLine",
      p.shape_type as "shapeType", p.camber_profile as "camberProfile",
      p.data_status as "dataStatus", p.source_name as "sourceName",
      p.source_url as "sourceUrl", p.source_checked_at::text as "sourceCheckedAt",
      p.affiliate_url as "affiliateUrl", p.image_url as "imageUrl",
      p.gallery_images as "galleryImages", p.is_active as "isActive",
      p.family_id::text as "familyId", p.family_member_role as "familyMemberRole",
      p.family_match_method as "familyMatchMethod",
      p.family_match_confidence as "familyMatchConfidence",
      p.family_manual_override as "familyManualOverride",
      p.family_match_reason as "familyMatchReason",
      p.family_matched_at::text as "familyMatchedAt",
      coalesce(json_agg(json_build_object(
        'sizeCm', ps.size_cm::float8, 'sizeLabel', ps.size_label,
        'waistWidthMm', ps.waist_width_mm, 'widthType', ps.width_type,
        'isAvailable', ps.is_available
      ) order by ps.size_cm, ps.size_label) filter (where ps.id is not null), '[]'::json) as sizes
    from products p
    left join product_sizes ps on ps.product_id = p.id
    group by p.id
    order by lower(p.brand), lower(p.model_name), p.season_label nulls last, p.slug
  `;
}

async function loadFamilies(sql) {
  const rows = await sql`
    select mf.id::text as "familyId", mf.slug as "familySlug",
      mf.identity_key as "identityKey", mf.brand as "familyBrand",
      mf.model_name as "familyModelName", mf.season_label as "familySeasonLabel",
      mf.description_short as "descriptionShort", mf.description_full as "descriptionFull",
      mf.riding_style as "ridingStyle", mf.skill_level as "skillLevel", mf.flex::int,
      mf.board_line as "boardLine", mf.shape_type as "shapeType",
      mf.camber_profile as "camberProfile", mf.canonical_source_kind as "canonicalSourceKind",
      mf.canonical_source_name as "canonicalSourceName",
      mf.canonical_source_url as "canonicalSourceUrl",
      mf.canonical_source_checked_at::text as "canonicalSourceCheckedAt",
      mf.canonical_data_status as "canonicalDataStatus",
      p.id::text as "productId", p.slug as "productSlug", p.is_active as "isActive",
      p.family_member_role as role, p.family_match_method as "matchMethod",
      p.family_match_confidence as confidence, p.family_manual_override as "manualOverride",
      p.family_match_reason as reason, p.family_matched_at::text as "matchedAt"
    from model_families mf left join products p on p.family_id = mf.id
    order by mf.identity_key, p.slug
  `;
  const families = new Map();
  for (const row of rows) {
    if (!families.has(row.familyId)) {
      families.set(row.familyId, {
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
      });
    }
    if (row.productId) {
      families.get(row.familyId).members.push({
        productId: row.productId,
        productSlug: row.productSlug,
        isActive: row.isActive,
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

function databaseSafety(snapshot) {
  return {
    before: snapshot,
    after: snapshot,
    unchanged: true,
    transaction: "reconciliation snapshot",
  };
}

async function buildCurrent(sql) {
  await validateFoundation(sql);
  const sourceSnapshot = await loadLegacySnapshot(sql);
  const products = await loadProducts(sql);
  const activeProducts = products.filter((product) => product.isActive);
  const analysis = analyzeCatalog(activeProducts, databaseSafety(sourceSnapshot));
  const proposals = buildBackfillLogicalPlan({
    analysis,
    products: activeProducts,
    baselineRepositorySha: "refresh-reconciliation",
    snapshot: sourceSnapshot,
  }).families;
  const families = await loadFamilies(sql);
  const plan = buildModelFamilyReconciliationPlan({
    candidateFamilies: proposals,
    existingFamilies: families,
    products,
    reviewFamilies: analysis.reviewWidthFamilies,
    keepSeparateFamilies: analysis.keepSeparate,
  });
  return {
    sourceSnapshot,
    familySnapshot: await loadFamilySnapshot(sql),
    products,
    analysis,
    proposals,
    families,
    plan,
  };
}

async function applyMutations(sql, current, transactionTimestamp) {
  const familyIdByIdentity = new Map(
    current.families.map((family) => [family.identityKey, family.id]),
  );
  let insertedFamilies = 0;
  let assignedProducts = 0;
  let updatedFamilies = 0;
  for (const family of current.plan.newFamilies) {
    const canonical = family.canonicalFamily;
    const [inserted] = await sql`
      insert into model_families (
        slug, identity_key, brand, model_name, season_label, description_short,
        description_full, riding_style, skill_level, flex, board_line, shape_type,
        camber_profile, canonical_source_kind, canonical_source_name,
        canonical_source_url, canonical_source_checked_at, canonical_data_status
      ) values (
        ${family.slug}, ${family.identityKey}, ${family.brand}, ${family.modelName},
        ${family.seasonLabel}, ${canonical.descriptionShort}, ${canonical.descriptionFull},
        ${canonical.ridingStyle}, ${canonical.skillLevel}, ${canonical.flex},
        ${canonical.boardLine}, ${canonical.shapeType}, ${canonical.camberProfile},
        ${canonical.canonicalSourceKind}, ${canonical.canonicalSourceName},
        ${canonical.canonicalSourceUrl}, ${canonical.canonicalSourceCheckedAt},
        ${canonical.canonicalDataStatus}
      ) returning id::text as id
    `;
    familyIdByIdentity.set(family.identityKey, inserted.id);
    insertedFamilies += 1;
  }
  for (const member of current.plan.newMemberships) {
    const familyId = familyIdByIdentity.get(member.identityKey);
    const updated = await sql`
      update products set family_id = ${familyId}, family_member_role = ${member.role},
        family_match_method = ${AUDIT_RULE}, family_match_confidence = 'high',
        family_match_reason = ${member.reason}, family_matched_at = ${transactionTimestamp}
      where id = ${member.productId} and family_id is null
        and family_manual_override = false
      returning id
    `;
    if (updated.length !== 1) {
      throw new Error(`Could not safely assign Product ${member.productId}.`);
    }
    assignedProducts += 1;
  }
  for (const update of current.plan.canonicalMetadataUpdates) {
    const family = current.proposals.find(
      (item) => item.identityKey === update.identityKey,
    );
    const canonical = family.canonicalFamily;
    const updated = await sql`
      update model_families set description_short = ${canonical.descriptionShort},
        description_full = ${canonical.descriptionFull}, riding_style = ${canonical.ridingStyle},
        skill_level = ${canonical.skillLevel}, flex = ${canonical.flex},
        board_line = ${canonical.boardLine}, shape_type = ${canonical.shapeType},
        camber_profile = ${canonical.camberProfile},
        canonical_source_name = ${canonical.canonicalSourceName},
        canonical_source_url = ${canonical.canonicalSourceUrl},
        canonical_source_checked_at = ${canonical.canonicalSourceCheckedAt},
        canonical_data_status = ${canonical.canonicalDataStatus}, updated_at = ${transactionTimestamp}
      where id = ${update.familyId} and canonical_source_kind = 'fallback-member'
      returning id
    `;
    if (updated.length !== 1) {
      throw new Error(`Could not safely update family ${update.familyId}.`);
    }
    updatedFamilies += 1;
  }
  return { insertedFamilies, assignedProducts, updatedFamilies };
}

function beyondMedalsEvidence(current) {
  const family = current.families.find((item) =>
    item.identityKey.includes("|bataleon|beyond medals|"),
  );
  return family
    ? {
        familyId: family.id,
        identityKey: family.identityKey,
        slug: family.slug,
        members: family.members
          .map((member) => ({
            productId: member.productId,
            slug: member.productSlug,
            role: member.role,
            matchedAt: member.matchedAt,
          }))
          .sort((left, right) => left.role.localeCompare(right.role, "en")),
      }
    : null;
}

function reportFor(mode, before, after, mutation, settings, authorization) {
  return {
    version: before.plan.version,
    generatedAt: new Date().toISOString(),
    mode,
    planFingerprint: authorization.fingerprint,
    expectedPlanFingerprint: authorization.expectedFingerprint,
    planFingerprintMatch: authorization.match,
    transaction: settings,
    sourceAudit: {
      high: before.analysis.summary.highConfidenceWidthFamilyCount,
      review: before.analysis.summary.reviewWidthFamilyCount,
      keepSeparate: before.analysis.summary.keepSeparateCount,
    },
    sourceBefore: before.sourceSnapshot,
    sourceAfter: after?.sourceSnapshot ?? before.sourceSnapshot,
    familyBefore: before.familySnapshot,
    familyAfter: after?.familySnapshot ?? before.familySnapshot,
    actions: before.plan,
    mutation,
    beyondMedals: beyondMedalsEvidence(after ?? before),
  };
}

function logReport(report, reportPath, logger) {
  logger.log("Model family refresh reconciliation");
  logger.log(`mode: ${report.mode}${report.mode === "PREVIEW" ? " (read only)" : ""}`);
  if (report.mode === "PREVIEW") {
    logger.log(
      `compatible: ${report.actions.compatibleExisting.length}; historical: ${report.actions.historicalRetained.length}`,
    );
    logger.log(
      `new families: ${report.actions.newFamilies.length}; metadata updates: ${report.actions.canonicalMetadataUpdates.length}`,
    );
    logger.log(`blocking conflicts: ${report.actions.blockingConflicts.length}`);
  } else {
    logger.log("locks: backfill -> reconciliation");
    logger.log(`families inserted: ${report.mutation.insertedFamilies}`);
    logger.log(`Products assigned: ${report.mutation.assignedProducts}`);
    logger.log(`families metadata-updated: ${report.mutation.updatedFamilies}`);
    logger.log("post-state idempotency: PASS");
  }
  logger.log(
    `plan fingerprint: ${report.planFingerprint}${report.planFingerprintMatch ? " (MATCH)" : ""}`,
  );
  if (reportPath) logger.log(`report: ${reportPath}`);
}

export function hasFamilyReconciliationActions(report) {
  return hasReconciliationMutations(report.actions);
}

export function isFamilyReconciliationNoop(report) {
  return (
    report.actions.blockingConflicts.length === 0 &&
    !hasFamilyReconciliationActions(report)
  );
}

export async function previewModelFamilyReconciliation(options = {}) {
  const logger = options.logger ?? console;
  const ownSqlClient = !options.sql;
  const sql = options.sql ?? createSql(options);
  try {
    const current = await sql.begin(
      "isolation level repeatable read read only",
      async (tx) => {
        const [settings] = await tx`
          select current_setting('transaction_read_only') as "readOnly",
            current_setting('transaction_isolation') as isolation
        `;
        if (
          settings.readOnly !== "on" ||
          settings.isolation !== "repeatable read"
        ) {
          throw new Error("PREVIEW is not REPEATABLE READ READ ONLY.");
        }
        return { ...(await buildCurrent(tx)), settings };
      },
    );
    const fingerprint = getModelFamilyMutationPlanFingerprint(current.plan);
    const report = reportFor(
      "PREVIEW",
      current,
      null,
      { insertedFamilies: 0, assignedProducts: 0, updatedFamilies: 0 },
      current.settings,
      { fingerprint, expectedFingerprint: null, match: null },
    );
    const reportPath = await maybeWriteReport(report, options);
    logReport(report, reportPath, logger);
    return report;
  } finally {
    if (ownSqlClient) await sql.end({ timeout: 1 });
  }
}

export async function applyModelFamilyReconciliation(options = {}) {
  const expectedPlanFingerprint = String(
    options.expectedPlanFingerprint ?? "",
  ).trim();
  if (!FINGERPRINT_PATTERN.test(expectedPlanFingerprint)) {
    throw new Error(
      "Expected plan fingerprint must be 64 lowercase hexadecimal characters.",
    );
  }
  const logger = options.logger ?? console;
  const ownSqlClient = !options.sql;
  const sql = options.sql ?? createSql(options);
  try {
    const result = await sql.begin("isolation level serializable", async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${BACKFILL_LOCK_KEY}))`;
      await tx`select pg_advisory_xact_lock(hashtext(${RECONCILIATION_LOCK_KEY}))`;
      const [settings] = await tx`
        select current_setting('transaction_isolation') as isolation,
          transaction_timestamp()::text as "transactionTimestamp"
      `;
      const before = await buildCurrent(tx);
      if (before.plan.blockingConflicts.length) {
        throw new Error(
          "Reconciliation has blocking conflicts; transaction rolled back.",
        );
      }
      const planFingerprint = assertModelFamilyMutationPlanFingerprint(
        before.plan,
        expectedPlanFingerprint,
      );
      const mutation = await applyMutations(
        tx,
        before,
        settings.transactionTimestamp,
      );
      assertModelFamilyMutationCounts(before.plan, mutation);
      const after = await buildCurrent(tx);
      if (
        after.plan.blockingConflicts.length ||
        hasReconciliationMutations(after.plan)
      ) {
        throw new Error("Post-state is not idempotent; transaction rolled back.");
      }
      if (
        canonicalStringify(before.sourceSnapshot) !==
        canonicalStringify(after.sourceSnapshot)
      ) {
        throw new Error(
          "Product/ProductSize source fields changed; transaction rolled back.",
        );
      }
      if (
        !hasReconciliationMutations(before.plan) &&
        canonicalStringify(before.familySnapshot) !==
          canonicalStringify(after.familySnapshot)
      ) {
        throw new Error("NOOP changed family state; transaction rolled back.");
      }
      return { before, after, mutation, settings, planFingerprint };
    });
    const report = reportFor(
      "APPLY",
      result.before,
      result.after,
      result.mutation,
      result.settings,
      {
        fingerprint: result.planFingerprint,
        expectedFingerprint: expectedPlanFingerprint,
        match: true,
      },
    );
    const reportPath = await maybeWriteReport(report, options);
    logReport(report, reportPath, logger);
    return report;
  } finally {
    if (ownSqlClient) await sql.end({ timeout: 1 });
  }
}

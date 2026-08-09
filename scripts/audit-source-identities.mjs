import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import {
  fetchArrayBuffer,
  fetchJson,
  fetchText,
  loadExistingCatalog,
} from "./import-from-stores.mjs";
import { loadOfficialProductSpecs } from "./lib/official-specs.mjs";
import { importTraektoriaProducts } from "./lib/store-import/traektoria.mjs";
import { importTrialSportProducts } from "./lib/store-import/trial-sport.mjs";
import {
  buildSourceIdentityPlan,
  buildSourceOfferIdentity,
  SOURCE_IDENTITY_CLASSES,
} from "./lib/store-import/source-identity.mjs";

const DEFAULT_REPORT_PATH = "reports/catalog-source-identity-plan.json";

async function loadDatabaseSnapshot(sql) {
  const [products] = await sql`
    select
      count(*)::int as "products",
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
    select
      count(*)::int as "productSizes",
      md5(coalesce(string_agg(md5(jsonb_build_array(
        id, product_id, size_cm, size_label, waist_width_mm,
        recommended_weight_min, recommended_weight_max, width_type, is_available
      )::text), '' order by id), '')) as "productSizeChecksum"
    from product_sizes
  `;
  const [families] = await sql`
    select
      count(*)::int as "families",
      md5(coalesce(string_agg(md5(jsonb_build_array(
        id, slug, identity_key, brand, model_name, season_label,
        canonical_source_kind, updated_at
      )::text), '' order by id), '')) as "familyChecksum"
    from model_families
  `;
  const [memberships] = await sql`
    select
      count(*) filter (where family_id is not null)::int as "memberships",
      count(*) filter (where family_manual_override)::int as "manualOverrides",
      md5(coalesce(string_agg(md5(jsonb_build_array(
        id, family_id, family_member_role, family_match_method,
        family_match_confidence, family_manual_override, family_match_reason,
        family_matched_at
      )::text), '' order by id) filter (
        where family_id is not null or family_manual_override
      ), '')) as "membershipChecksum"
    from products
  `;

  return { ...products, ...sizes, ...families, ...memberships };
}

function countByClassification(groups) {
  const counts = Object.fromEntries(
    Object.values(SOURCE_IDENTITY_CLASSES).map((classification) => [
      classification,
      0,
    ]),
  );

  for (const group of groups) {
    counts[group.classification] += 1;
  }

  return counts;
}

function getExpectedOperations(identityPlan, existingCatalog, sourceFilter) {
  const existingSlugs = new Set(existingCatalog.keys());
  const resolvedSlugs = new Set(
    identityPlan.logicalPlan.groups.flatMap((group) =>
      group.assignments.map((assignment) => assignment.slug),
    ),
  );
  const collisionGroups = identityPlan.logicalPlan.groups.filter(
    (group) => group.classification !== SOURCE_IDENTITY_CLASSES.none,
  );
  const collisionSlugs = new Set(
    collisionGroups.flatMap((group) => [
      group.baseSlug,
      ...group.assignments.map((assignment) => assignment.slug),
    ]),
  );
  const inserts = [...collisionSlugs]
    .filter((slug) => resolvedSlugs.has(slug) && !existingSlugs.has(slug))
    .sort((left, right) => left.localeCompare(right, "en"));
  const updates = [...collisionSlugs]
    .filter((slug) => resolvedSlugs.has(slug) && existingSlugs.has(slug))
    .sort((left, right) => left.localeCompare(right, "en"));
  const unrelatedSlugChanges = [];

  for (const group of identityPlan.logicalPlan.groups) {
    if (group.classification !== SOURCE_IDENTITY_CLASSES.none) {
      continue;
    }

    const assignment = group.assignments[0];
    const memberKey = assignment?.members[0]?.sourceIdentityKey;
    if (!memberKey) {
      continue;
    }

    const current = [...existingCatalog.values()].filter(
      (product) => buildSourceOfferIdentity(product).key === memberKey,
    );
    if (current.length > 0 && !current.some((product) => product.slug === assignment.slug)) {
      unrelatedSlugChanges.push({
        sourceIdentityKey: memberKey,
        currentSlugs: current.map((product) => product.slug).sort(),
        proposedSlug: assignment.slug,
      });
    }
  }

  return {
    inserts,
    updates,
    inactivations: [...existingCatalog.values()]
      .filter((product) => {
        const identity = buildSourceOfferIdentity(product);
        const sourceIsManaged =
          sourceFilter === "all" ||
          identity.storeCode === sourceFilter ||
          (sourceFilter === "trial" && identity.storeCode === "trial-sport");
        return sourceIsManaged && identity.storeCode && !resolvedSlugs.has(product.slug);
      })
      .map((product) => product.slug)
      .sort((left, right) => left.localeCompare(right, "en")),
    unrelatedSlugChanges: unrelatedSlugChanges.sort((left, right) =>
      left.sourceIdentityKey.localeCompare(right.sourceIdentityKey, "en"),
    ),
  };
}

export async function loadSourceProducts(checkedAt, logger, sourceFilter = "all") {
  const traektoria =
    sourceFilter === "all" || sourceFilter === "traektoria"
      ? await importTraektoriaProducts({ fetchJson, checkedAt, logger })
      : { products: [], warnings: [] };
  const trialSport =
    sourceFilter === "all" ||
    sourceFilter === "trial" ||
    sourceFilter === "trial-sport"
      ? await importTrialSportProducts({
          fetchArrayBuffer,
          fetchText,
          checkedAt,
          logger,
        })
      : { products: [], warnings: [] };

  return {
    products: [...traektoria.products, ...trialSport.products],
    warnings: [...traektoria.warnings, ...trialSport.warnings],
  };
}

export async function runSourceIdentityAudit(options = {}) {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  const reportPath =
    options.reportPath ??
    process.env.CATALOG_SOURCE_IDENTITY_REPORT_PATH ??
    DEFAULT_REPORT_PATH;
  const logger = options.logger ?? console;
  const checkedAt = options.checkedAt ?? new Date().toISOString().slice(0, 10);
  const sourceFilter = String(
    options.sourceFilter ?? process.env.STORE_IMPORT_SOURCE ?? "all",
  )
    .trim()
    .toLowerCase();
  if (!["all", "traektoria", "trial", "trial-sport"].includes(sourceFilter)) {
    throw new Error(`Unsupported source filter "${sourceFilter}".`);
  }
  const source = await loadSourceProducts(checkedAt, logger, sourceFilter);
  const officialSpecs = await loadOfficialProductSpecs();
  const sql = postgres(databaseUrl, {
    ssl:
      options.sslMode ??
      (process.env.DATABASE_SSL === "disable" ? false : "require"),
    prepare: false,
    max: 1,
    connect_timeout: 15,
  });

  try {
    const database = await sql.begin(
      "isolation level repeatable read read only",
      async (transaction) => {
        const [settings] = await transaction`
          select
            current_setting('transaction_read_only') as "readOnly",
            current_setting('transaction_isolation') as "isolationLevel"
        `;
        if (
          settings.readOnly !== "on" ||
          settings.isolationLevel !== "repeatable read"
        ) {
          throw new Error("Source identity audit requires a repeatable-read read-only transaction.");
        }

        const existingCatalog = await loadExistingCatalog(transaction);
        const snapshot = await loadDatabaseSnapshot(transaction);
        return { settings, existingCatalog, snapshot };
      },
    );
    const identityPlan = buildSourceIdentityPlan({
      importedProducts: source.products,
      existingProducts: database.existingCatalog,
      officialSpecs,
    });
    const groups = identityPlan.logicalPlan.groups;
    const airmaster = groups.find(
      (group) => group.baseSlug === "yes-airmaster-3d",
    );
    const airmasterDetected = Boolean(
      airmaster?.assignments.some((assignment) =>
          assignment.members.some(
            (member) => member.sourceProductId === "1914518",
          ),
        ) &&
        airmaster.assignments.some((assignment) =>
          assignment.members.some(
            (member) => member.sourceProductId === "1914525",
          ),
        ),
    );
    const expectedOperations = getExpectedOperations(
      identityPlan,
      database.existingCatalog,
      sourceFilter,
    );
    const classificationCounts = countByClassification(groups);
    const unresolvedConfirmed = groups.filter(
      (group) =>
        group.classification === SOURCE_IDENTITY_CLASSES.confirmed &&
        group.repairRequired,
    );
    const officialSpecAmbiguities = groups
      .filter(
        (group) =>
          group.officialSpecImpact &&
          group.officialSpecImpact.applicableAssignments.length !== 1,
      )
      .map((group) => ({
        baseSlug: group.baseSlug,
        boardLine: group.officialSpecImpact.boardLine,
        applicableAssignments:
          group.officialSpecImpact.applicableAssignments,
      }));
    const report = {
      version: identityPlan.logicalPlan.version,
      generatedAt: new Date().toISOString(),
      transaction: database.settings,
      planHash: identityPlan.planHash,
      databaseSnapshot: database.snapshot,
      sourceSummary: {
        sourceFilter,
        products: source.products.length,
        warnings: source.warnings.length,
      },
      classificationCounts,
      signalCounts: {
        sameNameDifferentLine: groups.filter((group) => {
          const lines = new Set(
            group.assignments.flatMap((assignment) =>
              assignment.members.map((member) => member.boardLine),
            ),
          );
          return lines.size > 1;
        }).length,
        sameSlugDifferentMerchantProduct: groups.filter(
          (group) => group.sourceCount > group.resolvedIdentityCount || group.resolvedIdentityCount > 1,
        ).length,
        seasonConflicts: groups.filter((group) => {
          const seasons = new Set(
            group.assignments.flatMap((assignment) =>
              assignment.members.map((member) => member.season).filter(Boolean),
            ),
          );
          return seasons.size > 1;
        }).length,
        sizeMatrixConflicts: groups.filter((group) => {
          const matrices = new Set(
            group.assignments.flatMap((assignment) =>
              assignment.members.map((member) => JSON.stringify(member.sizes)),
            ),
          );
          return matrices.size > 1;
        }).length,
        officialSpecAmbiguities: officialSpecAmbiguities.length,
        confirmedCorruptedProducts: unresolvedConfirmed.length,
      },
      airmasterDetected,
      airmasterRepairRequired: Boolean(airmaster?.repairRequired),
      expectedOperations,
      officialSpecAmbiguities,
      rollback: {
        strategy:
          "Restore affected existing Products and exact ProductSizes from beforeState in one transaction; deactivate task-created rows instead of deleting them; restore family metadata only if it differs from the snapshot.",
        familyMutationExpected: false,
        beforeState: groups
          .filter((group) => group.repairRequired)
          .flatMap((group) => group.currentProducts),
      },
      logicalPlan: identityPlan.logicalPlan,
      sourceWarnings: source.warnings,
    };

    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    logger.log(`Source identity plan: ${reportPath}`);
    logger.log(`Plan hash: ${report.planHash}`);
    logger.log(`Airmaster detected: ${report.airmasterDetected ? "yes" : "no"}`);
    logger.log(`Confirmed repairs required: ${unresolvedConfirmed.length}`);
    logger.log(
      `Unrelated slug changes: ${expectedOperations.unrelatedSlugChanges.length}`,
    );

    if (
      identityPlan.logicalPlan.blockingIssues.length > 0 ||
      !airmasterDetected ||
      expectedOperations.unrelatedSlugChanges.length > 0
    ) {
      throw new Error("Source identity preview failed its apply gates.");
    }

    return report;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  if (process.argv.length > 2) {
    console.error("Source identity audit accepts no arguments.");
    process.exitCode = 1;
  } else {
    try {
      await runSourceIdentityAudit();
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  }
}

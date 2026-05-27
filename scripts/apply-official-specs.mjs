import postgres from "postgres";
import { loadOfficialProductSpecs } from "./lib/official-specs.mjs";

async function getProductColumnSupport(sql) {
  const rows = await sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name in (
        'shape_type',
        'camber_profile',
        'data_status',
        'source_name',
        'source_url',
        'source_checked_at'
      )
  `;

  const columns = new Set(rows.map((row) => row.column_name));

  return {
    hasShapeType: columns.has("shape_type"),
    hasCamberProfile: columns.has("camber_profile"),
    hasDataStatus: columns.has("data_status"),
    hasSourceName: columns.has("source_name"),
    hasSourceUrl: columns.has("source_url"),
    hasSourceCheckedAt: columns.has("source_checked_at"),
  };
}

function buildProductUpdate(columnSupport, spec) {
  const assignments = [];
  const values = [];
  const returningColumns = ["slug"];

  const pushAssignment = (columnName, value) => {
    values.push(value);
    assignments.push(`${columnName} = $${values.length}`);
  };

  if (spec.flex != null) {
    pushAssignment("flex", spec.flex);
    returningColumns.push("flex");
  }

  if (columnSupport.hasShapeType && spec.shapeType !== null) {
    pushAssignment("shape_type", spec.shapeType);
  }
  if (columnSupport.hasShapeType) {
    returningColumns.push("shape_type");
  }

  if (columnSupport.hasCamberProfile && spec.camberProfile !== null) {
    pushAssignment("camber_profile", spec.camberProfile);
  }
  if (columnSupport.hasCamberProfile) {
    returningColumns.push("camber_profile");
  }

  const hasOfficialFlex = spec.flex != null;

  if (columnSupport.hasDataStatus && hasOfficialFlex) {
    pushAssignment("data_status", "verified");
    returningColumns.push("data_status");
  }

  if (columnSupport.hasSourceName && hasOfficialFlex) {
    pushAssignment("source_name", spec.sourceName);
    returningColumns.push("source_name");
  }

  if (columnSupport.hasSourceUrl && hasOfficialFlex) {
    pushAssignment("source_url", spec.sourceUrl);
    returningColumns.push("source_url");
  }

  if (columnSupport.hasSourceCheckedAt && hasOfficialFlex) {
    pushAssignment("source_checked_at", spec.sourceCheckedAt ?? null);
    returningColumns.push("source_checked_at");
  }

  assignments.push("updated_at = now()");

  values.push(spec.slug);

  return {
    query: `
      update products
      set ${assignments.join(", ")}
      where slug = $${values.length}
      returning ${returningColumns.join(", ")}
    `,
    values,
  };
}

function getVerificationMismatches(columnSupport, spec, row) {
  const mismatches = [];

  if (spec.flex != null && Number(row.flex) !== spec.flex) {
    mismatches.push(`flex=${row.flex}, expected=${spec.flex}`);
  }

  if (
    columnSupport.hasShapeType &&
    spec.shapeType !== null &&
    row.shape_type !== spec.shapeType
  ) {
    mismatches.push(
      `shape_type=${row.shape_type ?? "null"}, expected=${spec.shapeType}`,
    );
  }

  if (
    columnSupport.hasCamberProfile &&
    spec.camberProfile !== null &&
    row.camber_profile !== spec.camberProfile
  ) {
    mismatches.push(
      `camber_profile=${row.camber_profile ?? "null"}, expected=${spec.camberProfile}`,
    );
  }

  if (spec.flex != null && columnSupport.hasDataStatus && row.data_status !== "verified") {
    mismatches.push(`data_status=${row.data_status ?? "null"}, expected=verified`);
  }

  if (
    spec.flex != null &&
    columnSupport.hasSourceName &&
    row.source_name !== spec.sourceName
  ) {
    mismatches.push(
      `source_name=${row.source_name ?? "null"}, expected=${spec.sourceName}`,
    );
  }

  if (
    spec.flex != null &&
    columnSupport.hasSourceUrl &&
    row.source_url !== spec.sourceUrl
  ) {
    mismatches.push(
      `source_url=${row.source_url ?? "null"}, expected=${spec.sourceUrl}`,
    );
  }

  if (spec.flex != null && columnSupport.hasSourceCheckedAt) {
    const normalizeDateValue = (value) => {
      if (value == null) {
        return null;
      }

      if (value instanceof Date) {
        return value.toISOString().slice(0, 10);
      }

      return String(value).slice(0, 10);
    };

    const actualDate =
      row.source_checked_at == null ? null : normalizeDateValue(row.source_checked_at);
    const expectedDate = spec.sourceCheckedAt ?? null;

    if (actualDate !== expectedDate) {
      mismatches.push(
        `source_checked_at=${actualDate ?? "null"}, expected=${expectedDate ?? "null"}`,
      );
    }
  }

  return mismatches;
}

async function updateProductWithSpec(sql, columnSupport, spec) {
  const update = buildProductUpdate(columnSupport, spec);
  const updatedRows = await sql.unsafe(update.query, update.values);

  if (updatedRows.length === 0) {
    return {
      updated: false,
      missing: true,
      mismatches: [],
    };
  }

  return {
    updated: true,
    missing: false,
    mismatches: getVerificationMismatches(columnSupport, spec, updatedRows[0]),
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }

  const sql = postgres(process.env.DATABASE_URL, {
    ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
    prepare: false,
    max: 1,
  });

  try {
    const officialSpecs = await loadOfficialProductSpecs();
    const columnSupport = await getProductColumnSupport(sql);
    const missingSlugs = [];
    const failedSpecs = [];
    let updatedCount = 0;

    for (const spec of officialSpecs.values()) {
      const result = await updateProductWithSpec(sql, columnSupport, spec);

      if (result.missing) {
        missingSlugs.push(spec.slug);
        continue;
      }

      if (!result.updated || result.mismatches.length > 0) {
        failedSpecs.push({
          slug: spec.slug,
          mismatches: result.mismatches,
        });
        continue;
      }

      updatedCount += 1;
    }

    console.log(`Applied official specs: ${updatedCount}`);

    if (missingSlugs.length > 0) {
      console.log(`Missing slugs: ${missingSlugs.length}`);
      for (const slug of missingSlugs) {
        console.log(`- ${slug}`);
      }
    }

    if (failedSpecs.length > 0) {
      console.error(`Failed official spec updates: ${failedSpecs.length}`);
      for (const entry of failedSpecs) {
        console.error(`- ${entry.slug}: ${entry.mismatches.join("; ")}`);
      }

      process.exitCode = 1;
    }
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

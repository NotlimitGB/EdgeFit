import postgres from "postgres";

const APPLY_FLAG = "--apply";
const MIGRATION_LOCK_KEY = "edgefit:model-family-schema:v1";

const FAMILY_COLUMNS = {
  id: { udtName: "uuid", nullable: false, defaultIncludes: "gen_random_uuid" },
  slug: { udtName: "text", nullable: false },
  identity_key: { udtName: "text", nullable: false },
  brand: { udtName: "text", nullable: false },
  model_name: { udtName: "text", nullable: false },
  season_label: { udtName: "text", nullable: false },
  description_short: { udtName: "text", nullable: true },
  description_full: { udtName: "text", nullable: true },
  riding_style: { udtName: "riding_style_type", nullable: true },
  skill_level: { udtName: "skill_level_type", nullable: true },
  flex: { udtName: "int2", nullable: true },
  board_line: { udtName: "board_line_type", nullable: true },
  shape_type: { udtName: "board_shape_type", nullable: true },
  camber_profile: { udtName: "camber_profile_type", nullable: true },
  canonical_source_kind: { udtName: "text", nullable: true },
  canonical_source_name: { udtName: "text", nullable: true },
  canonical_source_url: { udtName: "text", nullable: true },
  canonical_source_checked_at: { udtName: "date", nullable: true },
  canonical_data_status: {
    udtName: "product_data_status_type",
    nullable: false,
    defaultIncludes: "draft",
  },
  created_at: { udtName: "timestamptz", nullable: false, defaultIncludes: "now()" },
  updated_at: { udtName: "timestamptz", nullable: false, defaultIncludes: "now()" },
};

const PRODUCT_FAMILY_COLUMNS = {
  family_id: { udtName: "uuid", nullable: true },
  family_member_role: { udtName: "text", nullable: true },
  family_match_method: { udtName: "text", nullable: true },
  family_match_confidence: { udtName: "text", nullable: true },
  family_manual_override: {
    udtName: "bool",
    nullable: false,
    defaultIncludes: "false",
  },
  family_match_reason: { udtName: "text", nullable: true },
  family_matched_at: { udtName: "timestamptz", nullable: true },
};

const FAMILY_COLUMN_DEFINITIONS = [
  "id uuid not null default gen_random_uuid()",
  "slug text not null",
  "identity_key text not null",
  "brand text not null",
  "model_name text not null",
  "season_label text not null",
  "description_short text",
  "description_full text",
  "riding_style riding_style_type",
  "skill_level skill_level_type",
  "flex smallint",
  "board_line board_line_type",
  "shape_type board_shape_type",
  "camber_profile camber_profile_type",
  "canonical_source_kind text",
  "canonical_source_name text",
  "canonical_source_url text",
  "canonical_source_checked_at date",
  "canonical_data_status product_data_status_type not null default 'draft'",
  "created_at timestamptz not null default now()",
  "updated_at timestamptz not null default now()",
];

const PRODUCT_COLUMN_DEFINITIONS = [
  "family_id uuid",
  "family_member_role text",
  "family_match_method text",
  "family_match_confidence text",
  "family_manual_override boolean not null default false",
  "family_match_reason text",
  "family_matched_at timestamptz",
];

const EXPECTED_CONSTRAINTS = [
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

const EXPECTED_INDEXES = [
  "idx_products_family_id",
  "uq_products_one_base_per_family",
];

function parseMode(argv) {
  const args = argv.slice(2);
  if (args.length === 0) {
    return "CHECK";
  }

  if (args.length === 1 && args[0] === APPLY_FLAG) {
    return "APPLY";
  }

  throw new Error(`Unknown arguments: ${args.join(" ")}. Only ${APPLY_FLAG} is supported.`);
}

function normalizeDefinition(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/"/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function snapshotKey(snapshot) {
  return JSON.stringify(snapshot);
}

async function loadLegacySnapshot(sql) {
  const [summary] = await sql`
    select
      count(*)::int as "products",
      count(*) filter (where is_active = true)::int as "activeProducts",
      max(updated_at)::text as "maxUpdatedAt",
      md5(
        coalesce(
          string_agg(
            md5(
              jsonb_build_array(
                id,
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
                gallery_images,
                affiliate_url,
                is_active,
                board_line,
                shape_type,
                camber_profile,
                data_status,
                source_name,
                source_url,
                source_checked_at,
                scenarios,
                not_ideal_for,
                created_at,
                updated_at
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
                id,
                product_id,
                size_cm,
                size_label,
                waist_width_mm,
                recommended_weight_min,
                recommended_weight_max,
                width_type,
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
    products: Number(summary.products),
    activeProducts: Number(summary.activeProducts),
    productSizes: Number(sizes.productSizes),
    maxUpdatedAt: summary.maxUpdatedAt,
    productChecksum: summary.productChecksum,
    productSizeChecksum: sizes.productSizeChecksum,
  };
}

async function loadSchemaState(sql) {
  const columns = await sql`
    select
      table_name as "tableName",
      column_name as "columnName",
      udt_name as "udtName",
      is_nullable as "isNullable",
      column_default as "columnDefault"
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('model_families', 'products')
    order by table_name, ordinal_position
  `;
  const constraints = await sql`
    select
      constraint_row.conname as "name",
      constraint_row.contype as "type",
      constraint_row.conrelid::regclass::text as "tableName",
      case
        when constraint_row.confrelid = 0 then null
        else constraint_row.confrelid::regclass::text
      end as "referencedTable",
      constraint_row.confdeltype as "deleteAction",
      pg_get_constraintdef(constraint_row.oid, true) as "definition"
    from pg_constraint constraint_row
    join pg_namespace namespace_row
      on namespace_row.oid = constraint_row.connamespace
    where namespace_row.nspname = 'public'
      and constraint_row.conrelid in (
        'products'::regclass,
        to_regclass('public.model_families')
      )
    order by constraint_row.conrelid::regclass::text, constraint_row.conname
  `;
  const indexes = await sql`
    select
      tablename as "tableName",
      indexname as "name",
      indexdef as "definition"
    from pg_indexes
    where schemaname = 'public'
      and tablename in ('model_families', 'products')
    order by tablename, indexname
  `;

  return { columns, constraints, indexes };
}

function findColumn(state, tableName, columnName) {
  return state.columns.find(
    (column) => column.tableName === tableName && column.columnName === columnName,
  );
}

function validateColumnSet(state, tableName, expectedColumns, issues) {
  for (const [columnName, expected] of Object.entries(expectedColumns)) {
    const column = findColumn(state, tableName, columnName);
    if (!column) {
      issues.push(`Missing column ${tableName}.${columnName}.`);
      continue;
    }

    if (column.udtName !== expected.udtName) {
      issues.push(
        `Invalid type for ${tableName}.${columnName}: ${column.udtName}, expected ${expected.udtName}.`,
      );
    }

    const nullable = column.isNullable === "YES";
    if (nullable !== expected.nullable) {
      issues.push(
        `Invalid nullability for ${tableName}.${columnName}: ${column.isNullable}.`,
      );
    }

    if (
      expected.defaultIncludes &&
      !normalizeDefinition(column.columnDefault).includes(expected.defaultIncludes)
    ) {
      issues.push(`Invalid default for ${tableName}.${columnName}.`);
    }
  }
}

function validateNamedConstraint(state, name, expected) {
  const constraint = state.constraints.find((candidate) => candidate.name === name);
  if (!constraint) {
    return `Missing constraint ${name}.`;
  }

  const definition = normalizeDefinition(constraint.definition);
  if (expected.type && constraint.type !== expected.type) {
    return `Constraint ${name} has type ${constraint.type}, expected ${expected.type}.`;
  }

  if (expected.tableName && constraint.tableName !== expected.tableName) {
    return `Constraint ${name} is attached to ${constraint.tableName}.`;
  }

  if (expected.referencedTable && constraint.referencedTable !== expected.referencedTable) {
    return `Constraint ${name} references ${constraint.referencedTable}.`;
  }

  if (expected.deleteAction && constraint.deleteAction !== expected.deleteAction) {
    return `Constraint ${name} has delete action ${constraint.deleteAction}.`;
  }

  if ((expected.includes ?? []).some((token) => !definition.includes(token))) {
    return `Constraint ${name} has an unexpected definition.`;
  }

  return null;
}

function validateSchema(state) {
  const issues = [];
  validateColumnSet(state, "model_families", FAMILY_COLUMNS, issues);
  validateColumnSet(state, "products", PRODUCT_FAMILY_COLUMNS, issues);

  const constraintExpectations = {
    model_families_pkey: {
      type: "p",
      tableName: "model_families",
      includes: ["primary key", "(id)"],
    },
    uq_model_families_slug: {
      type: "u",
      tableName: "model_families",
      includes: ["unique", "(slug)"],
    },
    uq_model_families_identity_key: {
      type: "u",
      tableName: "model_families",
      includes: ["unique", "(identity_key)"],
    },
    chk_model_families_flex: {
      type: "c",
      tableName: "model_families",
      includes: ["flex is null", "flex >= 1", "flex <= 10"],
    },
    chk_model_families_slug_not_blank: {
      type: "c",
      tableName: "model_families",
      includes: ["length", "slug", "> 0"],
    },
    chk_model_families_identity_key_not_blank: {
      type: "c",
      tableName: "model_families",
      includes: ["length", "identity_key", "> 0"],
    },
    chk_model_families_brand_not_blank: {
      type: "c",
      tableName: "model_families",
      includes: ["length", "brand", "> 0"],
    },
    chk_model_families_model_name_not_blank: {
      type: "c",
      tableName: "model_families",
      includes: ["length", "model_name", "> 0"],
    },
    chk_model_families_season_label_not_blank: {
      type: "c",
      tableName: "model_families",
      includes: ["length", "season_label", "> 0"],
    },
    chk_model_families_canonical_source_kind: {
      type: "c",
      tableName: "model_families",
      includes: [
        "canonical_source_kind is null",
        "verified-official",
        "manual",
        "trusted-member",
        "fallback-member",
      ],
    },
    fk_products_family_id: {
      type: "f",
      tableName: "products",
      referencedTable: "model_families",
      deleteAction: "n",
      includes: ["foreign key (family_id)", "references model_families(id)", "on delete set null"],
    },
    chk_products_family_member_role: {
      type: "c",
      tableName: "products",
      includes: ["family_member_role is null", "base", "wide", "other"],
    },
    chk_products_family_match_confidence: {
      type: "c",
      tableName: "products",
      includes: ["family_match_confidence is null", "high", "reviewed"],
    },
    chk_products_family_membership_coherence: {
      type: "c",
      tableName: "products",
      includes: [
        "family_id is null",
        "family_member_role is null",
        "family_id is not null",
        "family_member_role is not null",
        "family_match_method is not null",
        "family_match_confidence is not null",
        "family_matched_at is not null",
      ],
    },
  };

  for (const name of EXPECTED_CONSTRAINTS) {
    const issue = validateNamedConstraint(state, name, constraintExpectations[name]);
    if (issue) {
      issues.push(issue);
    }
  }

  const indexExpectations = {
    idx_products_family_id: ["create index", "on public.products", "(family_id)"],
    uq_products_one_base_per_family: [
      "create unique index",
      "on public.products",
      "(family_id)",
      "where",
      "family_id is not null",
      "family_member_role = 'base'::text",
    ],
  };

  for (const name of EXPECTED_INDEXES) {
    const index = state.indexes.find((candidate) => candidate.name === name);
    if (!index) {
      issues.push(`Missing index ${name}.`);
      continue;
    }

    const definition = normalizeDefinition(index.definition);
    if (indexExpectations[name].some((token) => !definition.includes(token))) {
      issues.push(`Index ${name} has an unexpected definition.`);
    }
  }

  return issues;
}

async function hasTable(sql, tableName) {
  const [row] = await sql`
    select to_regclass(${'public.' + tableName}) is not null as "exists"
  `;
  return row.exists;
}

async function hasColumn(sql, tableName, columnName) {
  const [row] = await sql`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ${tableName}
        and column_name = ${columnName}
    ) as "exists"
  `;
  return row.exists;
}

async function loadFoundationCounts(sql) {
  const familyTableExists = await hasTable(sql, "model_families");
  const familyIdExists = await hasColumn(sql, "products", "family_id");
  const manualOverrideExists = await hasColumn(
    sql,
    "products",
    "family_manual_override",
  );

  const familyRows = familyTableExists
    ? Number((await sql`select count(*)::int as count from model_families`)[0].count)
    : 0;
  const assignedProducts = familyIdExists
    ? Number(
        (await sql`
          select count(*)::int as count
          from products
          where family_id is not null
        `)[0].count,
      )
    : 0;
  const manualOverrides = manualOverrideExists
    ? Number(
        (await sql`
          select count(*)::int as count
          from products
          where family_manual_override = true
        `)[0].count,
      )
    : 0;

  return { familyRows, assignedProducts, manualOverrides };
}

async function constraintExists(sql, tableName, constraintName) {
  const [row] = await sql`
    select exists (
      select 1
      from pg_constraint
      where conrelid = to_regclass(${'public.' + tableName})
        and conname = ${constraintName}
    ) as "exists"
  `;
  return row.exists;
}

async function addConstraintIfMissing(sql, tableName, constraintName, ddl) {
  if (!(await constraintExists(sql, tableName, constraintName))) {
    await sql.unsafe(ddl);
  }
}

async function applySchema(sql) {
  await sql.unsafe(`
    create table if not exists model_families (
      id uuid primary key default gen_random_uuid(),
      slug text not null,
      identity_key text not null,
      brand text not null,
      model_name text not null,
      season_label text not null,
      description_short text,
      description_full text,
      riding_style riding_style_type,
      skill_level skill_level_type,
      flex smallint,
      board_line board_line_type,
      shape_type board_shape_type,
      camber_profile camber_profile_type,
      canonical_source_kind text,
      canonical_source_name text,
      canonical_source_url text,
      canonical_source_checked_at date,
      canonical_data_status product_data_status_type not null default 'draft',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  for (const definition of FAMILY_COLUMN_DEFINITIONS) {
    await sql.unsafe(`alter table model_families add column if not exists ${definition}`);
  }

  await sql.unsafe(`alter table model_families alter column id set default gen_random_uuid()`);
  await sql.unsafe(`alter table model_families alter column canonical_data_status set default 'draft'`);
  await sql.unsafe(`alter table model_families alter column created_at set default now()`);
  await sql.unsafe(`alter table model_families alter column updated_at set default now()`);
  for (const column of [
    "id",
    "slug",
    "identity_key",
    "brand",
    "model_name",
    "season_label",
    "canonical_data_status",
    "created_at",
    "updated_at",
  ]) {
    await sql.unsafe(`alter table model_families alter column ${column} set not null`);
  }

  await addConstraintIfMissing(
    sql,
    "model_families",
    "model_families_pkey",
    "alter table model_families add constraint model_families_pkey primary key (id)",
  );
  await addConstraintIfMissing(
    sql,
    "model_families",
    "uq_model_families_slug",
    "alter table model_families add constraint uq_model_families_slug unique (slug)",
  );
  await addConstraintIfMissing(
    sql,
    "model_families",
    "uq_model_families_identity_key",
    "alter table model_families add constraint uq_model_families_identity_key unique (identity_key)",
  );
  await addConstraintIfMissing(
    sql,
    "model_families",
    "chk_model_families_flex",
    "alter table model_families add constraint chk_model_families_flex check (flex is null or flex between 1 and 10)",
  );
  for (const [name, column] of [
    ["chk_model_families_slug_not_blank", "slug"],
    ["chk_model_families_identity_key_not_blank", "identity_key"],
    ["chk_model_families_brand_not_blank", "brand"],
    ["chk_model_families_model_name_not_blank", "model_name"],
    ["chk_model_families_season_label_not_blank", "season_label"],
  ]) {
    await addConstraintIfMissing(
      sql,
      "model_families",
      name,
      `alter table model_families add constraint ${name} check (length(trim(${column})) > 0)`,
    );
  }
  await addConstraintIfMissing(
    sql,
    "model_families",
    "chk_model_families_canonical_source_kind",
    `alter table model_families
      add constraint chk_model_families_canonical_source_kind
      check (
        canonical_source_kind is null
        or canonical_source_kind in (
          'verified-official', 'manual', 'trusted-member', 'fallback-member'
        )
      )`,
  );

  for (const definition of PRODUCT_COLUMN_DEFINITIONS) {
    await sql.unsafe(`alter table products add column if not exists ${definition}`);
  }
  await sql.unsafe(`alter table products alter column family_manual_override set default false`);
  await sql.unsafe(`alter table products alter column family_manual_override set not null`);

  await addConstraintIfMissing(
    sql,
    "products",
    "fk_products_family_id",
    `alter table products
      add constraint fk_products_family_id
      foreign key (family_id) references model_families(id) on delete set null`,
  );
  await addConstraintIfMissing(
    sql,
    "products",
    "chk_products_family_member_role",
    `alter table products
      add constraint chk_products_family_member_role
      check (
        family_member_role is null
        or family_member_role in ('base', 'wide', 'other')
      )`,
  );
  await addConstraintIfMissing(
    sql,
    "products",
    "chk_products_family_match_confidence",
    `alter table products
      add constraint chk_products_family_match_confidence
      check (
        family_match_confidence is null
        or family_match_confidence in ('high', 'reviewed')
      )`,
  );
  await addConstraintIfMissing(
    sql,
    "products",
    "chk_products_family_membership_coherence",
    `alter table products
      add constraint chk_products_family_membership_coherence
      check (
        (family_id is null and family_member_role is null)
        or (
          family_id is not null
          and family_member_role is not null
          and family_match_method is not null
          and family_match_confidence is not null
          and family_matched_at is not null
        )
      )`,
  );

  await sql.unsafe(`create index if not exists idx_products_family_id on products(family_id)`);
  await sql.unsafe(`
    create unique index if not exists uq_products_one_base_per_family
      on products(family_id)
      where family_id is not null and family_member_role = 'base'
  `);
}

function assertZeroFoundation(counts) {
  if (counts.familyRows !== 0) {
    throw new Error(`Expected zero model families, found ${counts.familyRows}.`);
  }
  if (counts.assignedProducts !== 0) {
    throw new Error(`Expected zero assigned Products, found ${counts.assignedProducts}.`);
  }
  if (counts.manualOverrides !== 0) {
    throw new Error(`Expected zero manual overrides, found ${counts.manualOverrides}.`);
  }
}

function printSnapshot(label, snapshot) {
  console.log(`${label} data snapshot:`);
  console.log(`  Products: ${snapshot.products}`);
  console.log(`  Active Products: ${snapshot.activeProducts}`);
  console.log(`  ProductSizes: ${snapshot.productSizes}`);
  console.log(`  Max updated_at: ${snapshot.maxUpdatedAt ?? "null"}`);
  console.log(`  Product checksum: ${snapshot.productChecksum}`);
  console.log(`  ProductSize checksum: ${snapshot.productSizeChecksum}`);
}

function printFoundationState(state, counts, issues) {
  const familyColumnNames = new Set(
    state.columns
      .filter((column) => column.tableName === "model_families")
      .map((column) => column.columnName),
  );
  const productColumnNames = new Set(
    state.columns
      .filter((column) => column.tableName === "products")
      .map((column) => column.columnName),
  );
  const constraintNames = new Set(state.constraints.map((constraint) => constraint.name));
  const indexNames = new Set(state.indexes.map((index) => index.name));

  console.log(
    `table model_families: ${familyColumnNames.size > 0 ? "present" : "missing"}`,
  );
  console.log("Product family fields:");
  for (const column of Object.keys(PRODUCT_FAMILY_COLUMNS)) {
    console.log(`  ${column}: ${productColumnNames.has(column) ? "present" : "missing"}`);
  }
  console.log("constraints:");
  for (const name of EXPECTED_CONSTRAINTS) {
    console.log(`  ${name}: ${constraintNames.has(name) ? "present" : "missing"}`);
  }
  console.log("indexes:");
  for (const name of EXPECTED_INDEXES) {
    console.log(`  ${name}: ${indexNames.has(name) ? "present" : "missing"}`);
  }
  console.log(`Families: ${counts.familyRows}`);
  console.log(`Assigned Products: ${counts.assignedProducts}`);
  console.log(`Manual overrides: ${counts.manualOverrides}`);

  if (issues.length > 0) {
    console.log("Schema findings:");
    for (const issue of issues) {
      console.log(`  - ${issue}`);
    }
  }
}

async function runCheck(sql) {
  return sql.begin(
    "isolation level repeatable read read only",
    async (transaction) => {
      const snapshot = await loadLegacySnapshot(transaction);
      const state = await loadSchemaState(transaction);
      const counts = await loadFoundationCounts(transaction);
      const issues = validateSchema(state);

      console.log("Model family schema foundation");
      console.log("mode: CHECK");
      printFoundationState(state, counts, issues);
      printSnapshot("Current", snapshot);
      console.log(
        `Result: ${issues.length === 0 ? "FOUNDATION VALID" : "READY TO APPLY"}`,
      );

      return { snapshot, state, counts, issues };
    },
  );
}

async function runApply(sql) {
  const result = await sql.begin(async (transaction) => {
    await transaction`
      select pg_advisory_xact_lock(hashtext(${MIGRATION_LOCK_KEY}))
    `;
    const before = await loadLegacySnapshot(transaction);
    const beforeCounts = await loadFoundationCounts(transaction);
    assertZeroFoundation(beforeCounts);

    await applySchema(transaction);

    const state = await loadSchemaState(transaction);
    const issues = validateSchema(state);
    if (issues.length > 0) {
      throw new Error(`Schema validation failed:\n- ${issues.join("\n- ")}`);
    }

    const after = await loadLegacySnapshot(transaction);
    const afterCounts = await loadFoundationCounts(transaction);
    if (snapshotKey(before) !== snapshotKey(after)) {
      throw new Error("Legacy Product/ProductSize data changed during schema apply.");
    }
    assertZeroFoundation(afterCounts);

    return { before, after, beforeCounts, afterCounts, state, issues };
  });

  console.log("Model family schema foundation");
  console.log("mode: APPLY");
  printFoundationState(result.state, result.afterCounts, result.issues);
  printSnapshot("Before", result.before);
  printSnapshot("After", result.after);
  console.log("Result: FOUNDATION VALID");
  return result;
}

async function runModelFamilySchemaMigration(options = {}) {
  const mode = options.mode ?? parseMode(process.argv);
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  const sslMode =
    options.sslMode ?? (process.env.DATABASE_SSL === "disable" ? false : "require");

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  if (mode !== "CHECK" && mode !== "APPLY") {
    throw new Error(`Unsupported migration mode: ${mode}.`);
  }

  const sql = postgres(databaseUrl, {
    ssl: sslMode,
    prepare: false,
    max: 1,
    connect_timeout: 15,
    onnotice: () => {},
  });

  try {
    return mode === "APPLY" ? await runApply(sql) : await runCheck(sql);
  } finally {
    await sql.end({ timeout: 1 });
  }
}

try {
  await runModelFamilySchemaMigration();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

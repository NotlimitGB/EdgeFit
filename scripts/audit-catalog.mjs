import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
const sslMode = process.env.DATABASE_SSL === "disable" ? false : "require";
const reportPath =
  process.env.CATALOG_AUDIT_REPORT_PATH ?? "reports/catalog-audit.json";

if (!databaseUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  ssl: sslMode,
  prepare: false,
  max: 1,
  connect_timeout: 15,
});

function toIssue(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      typeof value === "bigint" ? Number(value) : value,
    ]),
  );
}

function buildCheck({ title, severity, rows, count }) {
  return {
    title,
    severity,
    passed: Number(count) === 0,
    count: Number(count),
    sample: rows.map(toIssue),
  };
}

async function writeReport(report) {
  const targetPath = path.resolve(reportPath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return targetPath;
}

async function main() {
  const [summary] = await sql`
    select
      count(*)::int as total_products,
      count(*) filter (where is_active = true)::int as active_products,
      count(*) filter (where affiliate_url like 'https://trial-sport.ru/%')::int as trial_sport_links,
      count(*) filter (
        where affiliate_url like 'https://www.traektoria.ru/%'
           or affiliate_url like 'https://traektoria.ru/%'
      )::int as traektoria_links
    from products
  `;

  const sourceCounts = await sql`
    select
      coalesce(nullif(trim(source_name), ''), 'unknown') as source_name,
      count(*)::int as total_products,
      count(*) filter (where is_active = true)::int as active_products
    from products
    group by coalesce(nullif(trim(source_name), ''), 'unknown')
    order by active_products desc, source_name
  `;

  const [brokenAdultSizeCount] = await sql`
    select count(*)::int as count
    from product_sizes ps
    join products p on p.id = ps.product_id
    where ps.size_cm < 100
      and ps.waist_width_mm >= 235
  `;
  const brokenAdultSizes = await sql`
    select
      p.slug,
      p.brand,
      p.model_name,
      ps.size_cm::float8 as size_cm,
      ps.size_label,
      ps.waist_width_mm,
      p.affiliate_url
    from product_sizes ps
    join products p on p.id = ps.product_id
    where ps.size_cm < 100
      and ps.waist_width_mm >= 235
    order by p.brand, p.model_name, ps.size_cm
    limit 50
  `;

  const [productsWithoutSizesCount] = await sql`
    select count(*)::int as count
    from products p
    where p.is_active = true
      and not exists (
        select 1
        from product_sizes ps
        where ps.product_id = p.id
      )
  `;
  const productsWithoutSizes = await sql`
    select p.slug, p.brand, p.model_name, p.source_name, p.affiliate_url
    from products p
    where p.is_active = true
      and not exists (
        select 1
        from product_sizes ps
        where ps.product_id = p.id
      )
    order by p.brand, p.model_name
    limit 50
  `;

  const [productsWithoutAvailableSizesCount] = await sql`
    select count(*)::int as count
    from products p
    where p.is_active = true
      and not exists (
        select 1
        from product_sizes ps
        where ps.product_id = p.id
          and ps.is_available = true
      )
  `;
  const productsWithoutAvailableSizes = await sql`
    select p.slug, p.brand, p.model_name, p.source_name, p.affiliate_url
    from products p
    where p.is_active = true
      and not exists (
        select 1
        from product_sizes ps
        where ps.product_id = p.id
          and ps.is_available = true
      )
    order by p.brand, p.model_name
    limit 50
  `;

  const [productsWithBadPriceCount] = await sql`
    select count(*)::int as count
    from products p
    where p.is_active = true
      and p.price_from <= 0
  `;
  const productsWithBadPrice = await sql`
    select p.slug, p.brand, p.model_name, p.source_name, p.price_from, p.affiliate_url
    from products p
    where p.is_active = true
      and p.price_from <= 0
    order by p.brand, p.model_name
    limit 50
  `;

  const [productsWithMissingImageCount] = await sql`
    select count(*)::int as count
    from products p
    where p.is_active = true
      and trim(coalesce(p.image_url, '')) = ''
  `;
  const productsWithMissingImage = await sql`
    select p.slug, p.brand, p.model_name, p.source_name, p.affiliate_url
    from products p
    where p.is_active = true
      and trim(coalesce(p.image_url, '')) = ''
    order by p.brand, p.model_name
    limit 50
  `;

  const [productsWithNonStoreLinkCount] = await sql`
    select count(*)::int as count
    from products p
    where p.is_active = true
      and p.affiliate_url not like 'https://trial-sport.ru/%'
      and p.affiliate_url not like 'https://www.traektoria.ru/%'
      and p.affiliate_url not like 'https://traektoria.ru/%'
  `;
  const productsWithNonStoreLink = await sql`
    select p.slug, p.brand, p.model_name, p.source_name, p.affiliate_url
    from products p
    where p.is_active = true
      and p.affiliate_url not like 'https://trial-sport.ru/%'
      and p.affiliate_url not like 'https://www.traektoria.ru/%'
      and p.affiliate_url not like 'https://traektoria.ru/%'
    order by p.brand, p.model_name
    limit 50
  `;

  const checks = {
    brokenAdultSizes: buildCheck({
      title: "No adult boards with corrupted short size labels like 58/88",
      severity: "error",
      count: brokenAdultSizeCount.count,
      rows: brokenAdultSizes,
    }),
    productsWithoutSizes: buildCheck({
      title: "Active products have at least one size",
      severity: "error",
      count: productsWithoutSizesCount.count,
      rows: productsWithoutSizes,
    }),
    productsWithoutAvailableSizes: buildCheck({
      title: "Active products have at least one available store size",
      severity: "warning",
      count: productsWithoutAvailableSizesCount.count,
      rows: productsWithoutAvailableSizes,
    }),
    productsWithBadPrice: buildCheck({
      title: "Active products have a positive price",
      severity: "error",
      count: productsWithBadPriceCount.count,
      rows: productsWithBadPrice,
    }),
    productsWithMissingImage: buildCheck({
      title: "Active products have a main image",
      severity: "warning",
      count: productsWithMissingImageCount.count,
      rows: productsWithMissingImage,
    }),
    productsWithNonStoreLink: buildCheck({
      title: "Active products point directly to Trial Sport or Traektoria",
      severity: "warning",
      count: productsWithNonStoreLinkCount.count,
      rows: productsWithNonStoreLink,
    }),
  };

  const report = {
    generatedAt: new Date().toISOString(),
    summary: toIssue(summary),
    sourceCounts: sourceCounts.map(toIssue),
    checks,
  };

  const targetPath = await writeReport(report);
  const failedChecks = Object.values(checks).filter(
    (check) => check.severity === "error" && !check.passed,
  );
  const warningChecks = Object.values(checks).filter(
    (check) => check.severity === "warning" && !check.passed,
  );

  console.log(`Catalog audit report: ${targetPath}`);
  console.log(
    `Products: ${summary.active_products} active / ${summary.total_products} total.`,
  );

  for (const check of Object.values(checks)) {
    const marker = check.passed ? "OK" : check.severity.toUpperCase();
    console.log(`${marker}: ${check.title} (${check.count})`);
  }

  if (warningChecks.length > 0) {
    console.log(
      `Warnings do not fail the audit, but they are worth reviewing before production: ${warningChecks.length}.`,
    );
  }

  if (failedChecks.length > 0) {
    process.exitCode = 1;
  }
}

try {
  await main();
} finally {
  await sql.end({ timeout: 1 });
}

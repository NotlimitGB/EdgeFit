import postgres from "postgres";
import { normalizeCatalogWaistWidths } from "./lib/catalog-repair.mjs";

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
    const repairedSizes = await normalizeCatalogWaistWidths(sql);

    console.log(`Waist widths repaired: ${repairedSizes.length}`);

    for (const size of repairedSizes.slice(0, 50)) {
      console.log(
        `- ${size.sizeLabel ?? size.sizeCm}: ${size.oldWaistWidthMm} -> ${size.waistWidthMm} mm`,
      );
    }

    if (repairedSizes.length > 50) {
      console.log(`... and ${repairedSizes.length - 50} more`);
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

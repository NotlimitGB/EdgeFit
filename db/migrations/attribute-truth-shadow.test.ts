import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "db",
  "migrations",
  "20260830_025b_i3a_attribute_truth_shadow.sql",
);
const schemaPath = join(process.cwd(), "db", "schema.sql");
const migration = readFileSync(migrationPath, "utf8");
const schema = readFileSync(schemaPath, "utf8");

const expectedProductColumns = [
  "truth_model_version",
  "truth_riding_styles",
  "truth_skill_level_min",
  "truth_skill_level_max",
  "truth_board_line",
  "truth_flex",
  "truth_shape_type",
  "truth_camber_profile",
  "truth_attribute_evidence",
] as const;

const expectedSizeColumns = [
  "truth_waist_width_mm",
  "truth_width_type",
] as const;

describe("025B-I3A attribute truth shadow migration", () => {
  it("adds the complete nullable shadow shape to migration and fresh schema", () => {
    for (const column of [...expectedProductColumns, ...expectedSizeColumns]) {
      expect(migration).toContain(column);
      expect(schema).toContain(column);
    }
  });

  it("contains version, evidence, range, geometry, and unmigrated-row checks", () => {
    for (const constraint of [
      "chk_products_truth_version",
      "chk_products_truth_evidence_object",
      "chk_products_truth_riding_styles_nonempty",
      "chk_products_truth_skill_range",
      "chk_products_truth_flex",
      "chk_products_truth_coherence",
      "chk_product_sizes_truth_version",
      "chk_product_sizes_truth_evidence_object",
      "chk_product_sizes_truth_geometry",
      "chk_product_sizes_truth_coherence",
    ]) {
      expect(migration).toContain(constraint);
      expect(schema).toContain(constraint);
    }

    expect(migration).toMatch(/truth_model_version\s*=\s*2/i);
    expect(migration).toMatch(/jsonb_typeof\(truth_attribute_evidence\)/i);
    expect(migration).toMatch(/cardinality\(truth_riding_styles\)\s*>\s*0/i);
    expect(migration).toMatch(/truth_flex\s+between\s+1\s+and\s+10/i);
    expect(migration).toMatch(/truth_waist_width_mm\s+between\s+120\s+and\s+340/i);
  });

  it("is inert additive DDL without data mutation or legacy weakening", () => {
    expect(migration).toMatch(/alter\s+table\s+products/i);
    expect(migration).toMatch(/alter\s+table\s+product_sizes/i);
    expect(migration).toMatch(/add\s+column\s+if\s+not\s+exists/i);

    expect(migration).not.toMatch(/\b(insert|update|delete|truncate|drop)\b/i);
    expect(migration).not.toMatch(/alter\s+column/i);
    expect(migration).not.toMatch(/model_families/i);
    expect(migration).not.toMatch(/\b(backfill|seed|execute|runner)\b/i);
  });
});

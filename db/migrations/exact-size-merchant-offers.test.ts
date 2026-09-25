import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "db", "migrations", "20260925_030p_d_exact_size_merchant_offers.sql"),
  "utf8",
);
const schema = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8");

function normalizeSql(value: string) {
  return value.replace(/--[^\r\n]*/gu, "").replace(/\s+/gu, " ").trim().toLowerCase();
}

describe("030P-D exact-size merchant offer schema", () => {
  it("mirrors the additive migration in the fresh database schema", () => {
    const normalizedMigration = normalizeSql(migration);
    expect(normalizeSql(schema)).toContain(normalizedMigration);
    for (const table of ["merchants", "merchant_products", "merchant_offers"]) {
      expect(migration).toMatch(new RegExp(`create table if not exists ${table}\\s*\\(`, "iu"));
      expect(schema).toMatch(new RegExp(`create table if not exists ${table}\\s*\\(`, "iu"));
    }
  });

  it("represents merchant, source-product, source-rights, price-scope, availability, and timestamp contracts", () => {
    for (const field of [
      "partner_status",
      "source_product_key",
      "brand_raw",
      "model_raw",
      "season_raw",
      "variant_raw",
      "manufacturer_sku",
      "gtin",
      "source_kind",
      "commercial_rights_status",
      "canonical_size_identity_key",
      "merchant_size_sku",
      "price_amount",
      "price_scope",
      "availability_status",
      "reconciliation_status",
      "feed_generated_at",
      "merchant_updated_at",
      "source_received_at",
      "observed_at",
      "feed_version",
      "checksum",
    ]) {
      expect(migration).toContain(field);
    }
    expect(migration).toMatch(/commercial_rights_status text not null default 'unknown'/iu);
    expect(migration).toMatch(/commercial_rights_status <> 'authorized'[\s\S]*rights_evidence_ref is not null[\s\S]*length\(trim\(rights_evidence_ref\)\) > 0/iu);
    expect(migration).toMatch(/availability_status text not null default 'unknown'/iu);
    expect(migration).toMatch(/source_kind in \([\s\S]*'legacy_import'[\s\S]*'public_reference'/iu);
  });

  it("prevents duplicate current source identities while preserving product and exact-size price scope", () => {
    expect(migration).toMatch(/unique \(merchant_product_id, source_identity_key\)/iu);
    expect(migration).toMatch(/on merchant_offers\(merchant_id, merchant_size_sku\)[\s\S]*where offer_scope = 'exact_size' and merchant_size_sku is not null/iu);
    expect(migration).toMatch(/on merchant_offers\(merchant_product_id\)[\s\S]*where offer_scope = 'product'/iu);
    expect(migration).toMatch(/price_scope = offer_scope/iu);
    expect(migration).toMatch(/price_amount is not null\s+and price_amount > 0/iu);
    expect(migration).toMatch(/price_amount > 0/iu);
    expect(migration).toMatch(/canonical_size_identity_key is not null/iu);
    expect(migration).toMatch(/reconciliation_status is not null\s+and reconciliation_status in/iu);
    expect(migration).toMatch(/reconciliation_status = 'conflict'[\s\S]*cardinality\(reconciliation_codes\) > 0/iu);
  });

  it("requires source-side size evidence and rejects canonical-derived exact-size identities", () => {
    expect(migration).toMatch(/chk_merchant_offers_exact_size_source_evidence[\s\S]*offer_scope <> 'exact_size'[\s\S]*merchant_size_sku[\s\S]*raw_size_label[\s\S]*source_size_cm[\s\S]*merchant_size_url/iu);
    expect(migration).toContain("lower(trim(source_identity_key)) not like 'canonical-size:%'");
    expect(migration).toContain("source_identity_key ~* '^sku:[^[:space:]].*'");
    expect(migration).toContain("source_identity_key ~* '^variant:[^[:space:]].*'");
    expect(migration).toContain("source_identity_key ~* '^url:https?://[^[:space:]].*'");
    expect(migration).toContain("merchant_size_sku is not null");
    expect(migration).toContain("merchant_size_url is not null");
    expect(schema).toContain("chk_merchant_offers_exact_size_source_evidence");
    expect(schema).toContain("chk_merchant_offers_source_identity_namespace");
  });

  it("is additive structure-only DDL and contains no personal data or affiliate economics", () => {
    expect(migration).not.toMatch(/^\s*(insert|update|delete|truncate|drop|alter)\b/gimu);
    for (const forbidden of [
      "session_id",
      "email",
      "height_cm",
      "weight_kg",
      "boot_size",
      "stance",
      "skill_level",
      "riding_preferences",
      "saved_result_token",
      "analytics_id",
      "affiliate_commission",
    ]) {
      expect(migration.toLowerCase()).not.toContain(forbidden);
    }
    expect(migration).not.toMatch(/price_from|is_available/iu);
  });
});

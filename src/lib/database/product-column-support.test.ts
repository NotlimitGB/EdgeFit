import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildProductColumnSupport,
  type SchemaColumnRow,
} from "@/lib/database/product-column-support";

const legacyProductColumns = [
  "season_label",
  "gallery_images",
  "shape_type",
  "camber_profile",
  "data_status",
  "source_name",
  "source_url",
  "source_checked_at",
];

const productFamilyColumns = [
  "family_id",
  "family_member_role",
  "family_match_method",
  "family_match_confidence",
  "family_manual_override",
  "family_match_reason",
  "family_matched_at",
];

const modelFamilyColumns = [
  "id",
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
  "created_at",
  "updated_at",
];

function rowsFor(tableName: string, columns: readonly string[]): SchemaColumnRow[] {
  return columns.map((columnName) => ({
    table_name: tableName,
    column_name: columnName,
  }));
}

function completeRows() {
  return [
    ...rowsFor("products", [...legacyProductColumns, ...productFamilyColumns]),
    ...rowsFor("product_sizes", ["size_label", "is_available"]),
    ...rowsFor("model_families", modelFamilyColumns),
  ];
}

describe("buildProductColumnSupport", () => {
  it("preserves legacy capability detection without a family foundation", () => {
    const support = buildProductColumnSupport([
      ...rowsFor("products", legacyProductColumns),
      ...rowsFor("product_sizes", ["size_label", "is_available"]),
    ]);

    expect(support).toEqual({
      seasonLabel: true,
      galleryImages: true,
      shapeType: true,
      camberProfile: true,
      dataStatus: true,
      sourceName: true,
      sourceUrl: true,
      sourceCheckedAt: true,
      sizeLabel: true,
      sizeAvailable: true,
      modelFamilies: false,
      familyId: false,
      familyMemberRole: false,
      familyMatchMethod: false,
      familyMatchConfidence: false,
      familyManualOverride: false,
      familyMatchReason: false,
      familyMatchedAt: false,
    });
  });

  it("detects the complete family table and every membership column", () => {
    const support = buildProductColumnSupport(completeRows());

    expect(support).toMatchObject({
      modelFamilies: true,
      familyId: true,
      familyMemberRole: true,
      familyMatchMethod: true,
      familyMatchConfidence: true,
      familyManualOverride: true,
      familyMatchReason: true,
      familyMatchedAt: true,
    });
  });

  it("does not report a partial model_families table as complete", () => {
    const rows = completeRows().filter(
      (row) =>
        !(row.table_name === "model_families" && row.column_name === "updated_at"),
    );

    expect(buildProductColumnSupport(rows).modelFamilies).toBe(false);
  });

  it("reports a missing Product membership column independently", () => {
    const rows = completeRows().filter(
      (row) =>
        !(row.table_name === "products" && row.column_name === "family_match_reason"),
    );
    const support = buildProductColumnSupport(rows);

    expect(support).toMatchObject({
      modelFamilies: true,
      familyId: true,
      familyMemberRole: true,
      familyMatchMethod: true,
      familyMatchConfidence: true,
      familyManualOverride: true,
      familyMatchReason: false,
      familyMatchedAt: true,
    });
  });
});

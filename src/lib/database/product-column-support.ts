import "server-only";
import type { Sql } from "postgres";

export interface ProductColumnSupport {
  seasonLabel: boolean;
  galleryImages: boolean;
  shapeType: boolean;
  camberProfile: boolean;
  dataStatus: boolean;
  sourceName: boolean;
  sourceUrl: boolean;
  sourceCheckedAt: boolean;
  sizeLabel: boolean;
  sizeAvailable: boolean;
  modelFamilies: boolean;
  familyId: boolean;
  familyMemberRole: boolean;
  familyMatchMethod: boolean;
  familyMatchConfidence: boolean;
  familyManualOverride: boolean;
  familyMatchReason: boolean;
  familyMatchedAt: boolean;
}

export interface SchemaColumnRow {
  table_name: string;
  column_name: string;
}

const REQUIRED_MODEL_FAMILY_COLUMNS = [
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
] as const;

export function buildProductColumnSupport(
  rows: readonly SchemaColumnRow[],
): ProductColumnSupport {
  const columnsByTable = new Map<string, Set<string>>();

  for (const row of rows) {
    const columns = columnsByTable.get(row.table_name) ?? new Set<string>();
    columns.add(row.column_name);
    columnsByTable.set(row.table_name, columns);
  }

  const productColumns = columnsByTable.get("products") ?? new Set<string>();
  const sizeColumns = columnsByTable.get("product_sizes") ?? new Set<string>();
  const familyColumns = columnsByTable.get("model_families") ?? new Set<string>();

  return {
    seasonLabel: productColumns.has("season_label"),
    galleryImages: productColumns.has("gallery_images"),
    shapeType: productColumns.has("shape_type"),
    camberProfile: productColumns.has("camber_profile"),
    dataStatus: productColumns.has("data_status"),
    sourceName: productColumns.has("source_name"),
    sourceUrl: productColumns.has("source_url"),
    sourceCheckedAt: productColumns.has("source_checked_at"),
    sizeLabel: sizeColumns.has("size_label"),
    sizeAvailable: sizeColumns.has("is_available"),
    modelFamilies: REQUIRED_MODEL_FAMILY_COLUMNS.every((column) =>
      familyColumns.has(column),
    ),
    familyId: productColumns.has("family_id"),
    familyMemberRole: productColumns.has("family_member_role"),
    familyMatchMethod: productColumns.has("family_match_method"),
    familyMatchConfidence: productColumns.has("family_match_confidence"),
    familyManualOverride: productColumns.has("family_manual_override"),
    familyMatchReason: productColumns.has("family_match_reason"),
    familyMatchedAt: productColumns.has("family_matched_at"),
  };
}

let cachedColumnSupport: ProductColumnSupport | null = null;

export async function getProductColumnSupport(sql: Sql): Promise<ProductColumnSupport> {
  if (cachedColumnSupport) {
    return cachedColumnSupport;
  }

  const rows = await sql<SchemaColumnRow[]>`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and (
        (
          table_name = 'products'
          and column_name in (
            'season_label',
            'gallery_images',
            'shape_type',
            'camber_profile',
            'data_status',
            'source_name',
            'source_url',
            'source_checked_at',
            'family_id',
            'family_member_role',
            'family_match_method',
            'family_match_confidence',
            'family_manual_override',
            'family_match_reason',
            'family_matched_at'
          )
        )
        or (
          table_name = 'product_sizes'
          and column_name in ('size_label', 'is_available')
        )
        or table_name = 'model_families'
      )
  `;

  cachedColumnSupport = buildProductColumnSupport(rows);

  return cachedColumnSupport;
}

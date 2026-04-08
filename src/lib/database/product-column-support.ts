import "server-only";
import type { Sql } from "postgres";

interface ProductColumnSupport {
  shapeType: boolean;
  dataStatus: boolean;
  sourceName: boolean;
  sourceUrl: boolean;
  sourceCheckedAt: boolean;
  sizeLabel: boolean;
}

let cachedColumnSupport: ProductColumnSupport | null = null;

export async function getProductColumnSupport(sql: Sql): Promise<ProductColumnSupport> {
  if (cachedColumnSupport) {
    return cachedColumnSupport;
  }

  const rows = await sql<{ table_name: string; column_name: string }[]>`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and (
        (
          table_name = 'products'
          and column_name in ('shape_type', 'data_status', 'source_name', 'source_url', 'source_checked_at')
        )
        or (
          table_name = 'product_sizes'
          and column_name in ('size_label')
        )
      )
  `;

  const productColumns = new Set(
    rows
      .filter((row) => row.table_name === "products")
      .map((row) => row.column_name),
  );
  const sizeColumns = new Set(
    rows
      .filter((row) => row.table_name === "product_sizes")
      .map((row) => row.column_name),
  );

  cachedColumnSupport = {
    shapeType: productColumns.has("shape_type"),
    dataStatus: productColumns.has("data_status"),
    sourceName: productColumns.has("source_name"),
    sourceUrl: productColumns.has("source_url"),
    sourceCheckedAt: productColumns.has("source_checked_at"),
    sizeLabel: sizeColumns.has("size_label"),
  };

  return cachedColumnSupport;
}

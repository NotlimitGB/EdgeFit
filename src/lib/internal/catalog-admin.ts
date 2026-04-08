import "server-only";
import { getBoardSizeLabel } from "@/lib/board-size";
import { получитьКлиентБазы } from "@/lib/database/client";
import { getProductColumnSupport } from "@/lib/database/product-column-support";
import type { Product, ProductSize } from "@/types/domain";

interface ProductRow {
  id: string;
  slug: string;
  brand: string;
  modelName: string;
  descriptionShort: string;
  descriptionFull: string;
  ridingStyle: Product["ridingStyle"];
  skillLevel: Product["skillLevel"];
  flex: number;
  priceFrom: number;
  imageUrl: string;
  affiliateUrl: string;
  isActive: boolean;
  boardLine: Product["boardLine"];
  shapeType: Product["shapeType"];
  dataStatus: Product["dataStatus"];
  sourceName: string | null;
  sourceUrl: string | null;
  sourceCheckedAt: string | null;
  scenarios: string[];
  notIdealFor: string[];
  sizes: ProductSize[];
}

function normalizeSize(size: ProductSize): ProductSize {
  return {
    sizeCm: Number(size.sizeCm),
    sizeLabel: size.sizeLabel?.trim() || getBoardSizeLabel(size),
    waistWidthMm: Number(size.waistWidthMm),
    recommendedWeightMin: Number(size.recommendedWeightMin),
    recommendedWeightMax:
      size.recommendedWeightMax == null ? null : Number(size.recommendedWeightMax),
    widthType: size.widthType,
  };
}

function normalizeProduct(product: ProductRow): Product {
  return {
    ...product,
    flex: Number(product.flex),
    priceFrom: Number(product.priceFrom),
    shapeType: product.shapeType ?? null,
    dataStatus: product.dataStatus ?? "draft",
    sourceName: product.sourceName?.trim() || null,
    sourceUrl: product.sourceUrl?.trim() || null,
    sourceCheckedAt: product.sourceCheckedAt || null,
    scenarios: Array.isArray(product.scenarios) ? product.scenarios : [],
    notIdealFor: Array.isArray(product.notIdealFor) ? product.notIdealFor : [],
    sizes: Array.isArray(product.sizes) ? product.sizes.map(normalizeSize) : [],
  };
}

export async function getCatalogProductsForInternalEditor() {
  const sql = получитьКлиентБазы();
  const columnSupport = await getProductColumnSupport(sql);
  const shapeTypeSelect = columnSupport.shapeType
    ? sql.unsafe("p.shape_type")
    : sql.unsafe("null::text");
  const dataStatusSelect = columnSupport.dataStatus
    ? sql.unsafe("p.data_status")
    : sql.unsafe("'draft'::text");
  const sourceNameSelect = columnSupport.sourceName
    ? sql.unsafe("p.source_name")
    : sql.unsafe("null::text");
  const sourceUrlSelect = columnSupport.sourceUrl
    ? sql.unsafe("p.source_url")
    : sql.unsafe("null::text");
  const sourceCheckedAtSelect = columnSupport.sourceCheckedAt
    ? sql.unsafe("p.source_checked_at::text")
    : sql.unsafe("null::text");
  const sizeLabelSelect = columnSupport.sizeLabel
    ? sql.unsafe("ps.size_label")
    : sql.unsafe("null::text");

  const rows = await sql<ProductRow[]>`
    select
      p.id::text as "id",
      p.slug as "slug",
      p.brand as "brand",
      p.model_name as "modelName",
      p.description_short as "descriptionShort",
      p.description_full as "descriptionFull",
      p.riding_style as "ridingStyle",
      p.skill_level as "skillLevel",
      p.flex as "flex",
      p.price_from as "priceFrom",
      p.image_url as "imageUrl",
      p.affiliate_url as "affiliateUrl",
      p.is_active as "isActive",
      p.board_line as "boardLine",
      ${shapeTypeSelect} as "shapeType",
      ${dataStatusSelect} as "dataStatus",
      ${sourceNameSelect} as "sourceName",
      ${sourceUrlSelect} as "sourceUrl",
      ${sourceCheckedAtSelect} as "sourceCheckedAt",
      p.scenarios as "scenarios",
      p.not_ideal_for as "notIdealFor",
      coalesce(
        json_agg(
          json_build_object(
            'sizeCm', ps.size_cm::float8,
            'sizeLabel', ${sizeLabelSelect},
            'waistWidthMm', ps.waist_width_mm,
            'recommendedWeightMin', ps.recommended_weight_min,
            'recommendedWeightMax', ps.recommended_weight_max,
            'widthType', ps.width_type
          )
          order by ps.size_cm
        ) filter (where ps.id is not null),
        '[]'::json
      ) as "sizes"
    from products p
    left join product_sizes ps on ps.product_id = p.id
    group by p.id
    order by p.is_active desc, p.brand, p.model_name
  `;

  return rows.map(normalizeProduct);
}

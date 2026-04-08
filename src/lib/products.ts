import "server-only";
import { getBoardSizeLabel } from "@/lib/board-size";
import { получитьДемоМодели } from "@/lib/demo-products";
import { получитьКлиентБазы } from "@/lib/database/client";
import { базаНастроена } from "@/lib/database/config";
import { getProductColumnSupport } from "@/lib/database/product-column-support";
import type { Product, ProductSize } from "@/types/domain";

interface СтрокаМоделиИзБазы {
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

function преобразоватьРазмер(размер: ProductSize): ProductSize {
  return {
    sizeCm: Number(размер.sizeCm),
    sizeLabel: размер.sizeLabel?.trim() || getBoardSizeLabel(размер),
    waistWidthMm: Number(размер.waistWidthMm),
    recommendedWeightMin: Number(размер.recommendedWeightMin),
    recommendedWeightMax:
      размер.recommendedWeightMax == null
        ? null
        : Number(размер.recommendedWeightMax),
    widthType: размер.widthType,
  };
}

function преобразоватьМодель(модель: СтрокаМоделиИзБазы): Product {
  return {
    ...модель,
    flex: Number(модель.flex),
    priceFrom: Number(модель.priceFrom),
    shapeType: модель.shapeType ?? null,
    dataStatus: модель.dataStatus ?? "draft",
    sourceName: модель.sourceName?.trim() || null,
    sourceUrl: модель.sourceUrl?.trim() || null,
    sourceCheckedAt: модель.sourceCheckedAt || null,
    scenarios: Array.isArray(модель.scenarios) ? модель.scenarios : [],
    notIdealFor: Array.isArray(модель.notIdealFor) ? модель.notIdealFor : [],
    sizes: Array.isArray(модель.sizes)
      ? модель.sizes.map(преобразоватьРазмер)
      : [],
  };
}

async function загрузитьМоделиИзБазы() {
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

  const строки = await sql<СтрокаМоделиИзБазы[]>`
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
    where p.is_active = true
    group by p.id
    order by p.brand, p.model_name
  `;

  return строки.map(преобразоватьМодель);
}

export async function получитьВсеМодели() {
  if (!базаНастроена()) {
    return получитьДемоМодели();
  }

  return загрузитьМоделиИзБазы();
}

export async function получитьМодельПоСлагу(слаг: string) {
  const модели = await получитьВсеМодели();
  return модели.find((модель) => модель.slug === слаг);
}

export async function получитьПохожиеМодели(слаг: string, лимит = 3) {
  const модели = await получитьВсеМодели();
  const текущаяМодель = модели.find((модель) => модель.slug === слаг);

  if (!текущаяМодель) {
    return [];
  }

  return модели
    .filter(
      (модель) =>
        модель.slug !== слаг &&
        (модель.ridingStyle === текущаяМодель.ridingStyle ||
          модель.boardLine === текущаяМодель.boardLine),
    )
    .slice(0, лимит);
}

export const getAllProducts = получитьВсеМодели;
export const getProductBySlug = получитьМодельПоСлагу;
export const getRelatedProducts = получитьПохожиеМодели;

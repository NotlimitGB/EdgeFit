import "server-only";
import type { Sql } from "postgres";
import { cache } from "react";
import { getBoardSizeLabel } from "@/lib/board-size";
import { получитьДемоМодели } from "@/lib/demo-products";
import { получитьКлиентБазы } from "@/lib/database/client";
import { базаНастроена } from "@/lib/database/config";
import { getProductColumnSupport } from "@/lib/database/product-column-support";
import type { Product, ProductSize } from "@/types/domain";

interface ProductRow {
  id: string;
  slug: string;
  brand: string;
  modelName: string;
  seasonLabel: string | null;
  descriptionShort: string;
  descriptionFull: string;
  ridingStyle: Product["ridingStyle"];
  skillLevel: Product["skillLevel"];
  flex: number;
  priceFrom: number;
  imageUrl: string;
  galleryImages?: string[];
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

function normalizeGalleryImages(value: unknown) {
  const rawImages =
    typeof value === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : Array.isArray(value)
        ? value
        : [];

  return rawImages
    .map((image) => String(image ?? "").trim())
    .filter(Boolean);
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
    isAvailable: size.isAvailable !== false,
  };
}

function isReliableStoredSize(size: ProductSize) {
  if (!Number.isFinite(size.sizeCm) || !Number.isFinite(size.waistWidthMm)) {
    return false;
  }

  if (size.sizeCm >= 100) {
    return true;
  }

  return size.waistWidthMm < 235;
}

function normalizeProduct(product: ProductRow): Product {
  return {
    ...product,
    flex: Number(product.flex),
    priceFrom: Number(product.priceFrom),
    seasonLabel: product.seasonLabel?.trim() || null,
    shapeType: product.shapeType ?? null,
    dataStatus: product.dataStatus ?? "draft",
    sourceName: product.sourceName?.trim() || null,
    sourceUrl: product.sourceUrl?.trim() || null,
    sourceCheckedAt: product.sourceCheckedAt || null,
    galleryImages: normalizeGalleryImages(product.galleryImages),
    scenarios: Array.isArray(product.scenarios) ? product.scenarios : [],
    notIdealFor: Array.isArray(product.notIdealFor) ? product.notIdealFor : [],
    sizes: Array.isArray(product.sizes)
      ? product.sizes.map(normalizeSize).filter(isReliableStoredSize)
      : [],
  };
}

async function getSelectFragments(sql: Sql) {
  const columnSupport = await getProductColumnSupport(sql);

  return {
    seasonLabelSelect: columnSupport.seasonLabel
      ? sql.unsafe("p.season_label")
      : sql.unsafe("null::text"),
    galleryImagesSelect: columnSupport.galleryImages
      ? sql.unsafe("p.gallery_images")
      : sql.unsafe("'[]'::jsonb"),
    shapeTypeSelect: columnSupport.shapeType
      ? sql.unsafe("p.shape_type")
      : sql.unsafe("null::text"),
    dataStatusSelect: columnSupport.dataStatus
      ? sql.unsafe("p.data_status")
      : sql.unsafe("'draft'::text"),
    sourceNameSelect: columnSupport.sourceName
      ? sql.unsafe("p.source_name")
      : sql.unsafe("null::text"),
    sourceUrlSelect: columnSupport.sourceUrl
      ? sql.unsafe("p.source_url")
      : sql.unsafe("null::text"),
    sourceCheckedAtSelect: columnSupport.sourceCheckedAt
      ? sql.unsafe("p.source_checked_at::text")
      : sql.unsafe("null::text"),
    sizeLabelSelect: columnSupport.sizeLabel
      ? sql.unsafe("ps.size_label")
      : sql.unsafe("null::text"),
    sizeAvailableSelect: columnSupport.sizeAvailable
      ? sql.unsafe("ps.is_available")
      : sql.unsafe("true"),
  };
}

async function runProductQuery(
  sql: Sql,
  options:
    | { kind: "all" }
    | { kind: "by-slug"; slug: string }
    | {
        kind: "related";
        slug: string;
        ridingStyle: Product["ridingStyle"];
        boardLine: Product["boardLine"];
        limit: number;
      },
) {
  const {
    seasonLabelSelect,
    shapeTypeSelect,
    galleryImagesSelect,
    dataStatusSelect,
    sourceNameSelect,
    sourceUrlSelect,
    sourceCheckedAtSelect,
    sizeLabelSelect,
    sizeAvailableSelect,
  } = await getSelectFragments(sql);

  if (options.kind === "by-slug") {
    const rows = await sql<ProductRow[]>`
      select
        p.id::text as "id",
        p.slug as "slug",
        p.brand as "brand",
        p.model_name as "modelName",
        ${seasonLabelSelect} as "seasonLabel",
        p.description_short as "descriptionShort",
        p.description_full as "descriptionFull",
        p.riding_style as "ridingStyle",
        p.skill_level as "skillLevel",
        p.flex as "flex",
        p.price_from as "priceFrom",
        p.image_url as "imageUrl",
        ${galleryImagesSelect} as "galleryImages",
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
              'widthType', ps.width_type,
              'isAvailable', ${sizeAvailableSelect}
            )
            order by ps.size_cm
          ) filter (where ps.id is not null),
          '[]'::json
        ) as "sizes"
      from products p
      left join product_sizes ps on ps.product_id = p.id
      where p.is_active = true
        and p.slug = ${options.slug}
      group by p.id
      limit 1
    `;

    return rows.map(normalizeProduct);
  }

  if (options.kind === "related") {
    const rows = await sql<ProductRow[]>`
      select
        p.id::text as "id",
        p.slug as "slug",
        p.brand as "brand",
        p.model_name as "modelName",
        ${seasonLabelSelect} as "seasonLabel",
        p.description_short as "descriptionShort",
        p.description_full as "descriptionFull",
        p.riding_style as "ridingStyle",
        p.skill_level as "skillLevel",
        p.flex as "flex",
        p.price_from as "priceFrom",
        p.image_url as "imageUrl",
        ${galleryImagesSelect} as "galleryImages",
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
              'widthType', ps.width_type,
              'isAvailable', ${sizeAvailableSelect}
            )
            order by ps.size_cm
          ) filter (where ps.id is not null),
          '[]'::json
        ) as "sizes"
      from products p
      left join product_sizes ps on ps.product_id = p.id
      where p.is_active = true
        and p.slug <> ${options.slug}
        and (
          p.riding_style = ${options.ridingStyle}
          or p.board_line = ${options.boardLine}
        )
      group by p.id
      order by
        (p.riding_style = ${options.ridingStyle}) desc,
        (p.board_line = ${options.boardLine}) desc,
        p.brand,
        p.model_name
      limit ${options.limit}
    `;

    return rows.map(normalizeProduct);
  }

  const rows = await sql<ProductRow[]>`
    select
      p.id::text as "id",
      p.slug as "slug",
      p.brand as "brand",
      p.model_name as "modelName",
      ${seasonLabelSelect} as "seasonLabel",
      p.description_short as "descriptionShort",
      p.description_full as "descriptionFull",
      p.riding_style as "ridingStyle",
      p.skill_level as "skillLevel",
      p.flex as "flex",
      p.price_from as "priceFrom",
      p.image_url as "imageUrl",
      ${galleryImagesSelect} as "galleryImages",
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
            'widthType', ps.width_type,
            'isAvailable', ${sizeAvailableSelect}
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

  return rows.map(normalizeProduct);
}

const loadAllProductsFromDatabase = cache(async () => {
  const sql = получитьКлиентБазы();
  return runProductQuery(sql, { kind: "all" });
});

const loadAllProductSlugsFromDatabase = cache(async () => {
  const sql = получитьКлиентБазы();
  const rows = await sql<{ slug: string }[]>`
    select p.slug as "slug"
    from products p
    where p.is_active = true
    order by p.slug
  `;

  return rows.map((row) => row.slug);
});

const loadProductBySlugFromDatabase = cache(async (slug: string) => {
  const sql = получитьКлиентБазы();
  const [product] = await runProductQuery(sql, { kind: "by-slug", slug });
  return product;
});

const loadRelatedProductsFromDatabase = cache(
  async (
    slug: string,
    ridingStyle: Product["ridingStyle"],
    boardLine: Product["boardLine"],
    limit: number,
  ) => {
    const sql = получитьКлиентБазы();

    return runProductQuery(sql, {
      kind: "related",
      slug,
      ridingStyle,
      boardLine,
      limit,
    });
  },
);

export const получитьВсеМодели = cache(async () => {
  if (!базаНастроена()) {
    return получитьДемоМодели();
  }

  return loadAllProductsFromDatabase();
});

export const получитьМодельПоСлагу = cache(async (слаг: string) => {
  if (!базаНастроена()) {
    return получитьДемоМодели().find((model) => model.slug === слаг);
  }

  return loadProductBySlugFromDatabase(слаг);
});

export const получитьПохожиеМодели = cache(
  async (слаг: string, лимит = 3) => {
    const currentProduct = await получитьМодельПоСлагу(слаг);

    if (!currentProduct) {
      return [];
    }

    if (!базаНастроена()) {
      return получитьДемоМодели()
        .filter(
          (model) =>
            model.slug !== слаг &&
            (model.ridingStyle === currentProduct.ridingStyle ||
              model.boardLine === currentProduct.boardLine),
        )
        .slice(0, лимит);
    }

    return loadRelatedProductsFromDatabase(
      слаг,
      currentProduct.ridingStyle,
      currentProduct.boardLine,
      лимит,
    );
  },
);

export const getAllProductSlugs = cache(async () => {
  if (!базаНастроена()) {
    return получитьДемоМодели().map((model) => model.slug);
  }

  return loadAllProductSlugsFromDatabase();
});

export const getAllProducts = получитьВсеМодели;
export const getProductBySlug = получитьМодельПоСлагу;
export const getRelatedProducts = получитьПохожиеМодели;

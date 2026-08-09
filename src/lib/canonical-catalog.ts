import "server-only";
import type { Sql } from "postgres";
import { cache } from "react";
import {
  buildCanonicalCatalogItems,
  type CanonicalFamilySource,
  type CanonicalOfferSource,
} from "@/lib/canonical-catalog-model";
import { получитьКлиентБазы } from "@/lib/database/client";
import { базаНастроена } from "@/lib/database/config";
import { getProductColumnSupport } from "@/lib/database/product-column-support";
import type { CanonicalCatalogItem } from "@/types/canonical-catalog";

const SCHEMA_ERROR =
  "Canonical catalog requires complete model-family schema support.";

export interface CanonicalOfferIdentity {
  boardSlug: string;
  offerSlug: string;
  familyId: string | null;
}

export type CanonicalBoardRouteResolution =
  | {
      kind: "render";
      item: CanonicalCatalogItem;
    }
  | {
      kind: "redirect";
      item: CanonicalCatalogItem;
      canonicalSlug: string;
    };

interface CanonicalOfferIdentityRow {
  offerSlug: string;
  familyId: string | null;
  familySlug: string | null;
}

interface CanonicalBoardAliasRow {
  offerSlug: string;
  familyId: string;
  familySlug: string | null;
}

async function assertCanonicalCatalogSupport(sql: Sql) {
  const support = await getProductColumnSupport(sql);
  const required = [
    support.modelFamilies,
    support.familyId,
    support.familyMemberRole,
    support.familyMatchMethod,
    support.familyMatchConfidence,
    support.familyManualOverride,
    support.sizeLabel,
    support.sizeAvailable,
  ];

  if (required.some((available) => !available)) {
    throw new Error(SCHEMA_ERROR);
  }

  return support;
}

async function getOfferSelectFragments(sql: Sql) {
  const support = await assertCanonicalCatalogSupport(sql);

  return {
    seasonLabel: support.seasonLabel
      ? sql.unsafe("p.season_label")
      : sql.unsafe("null::text"),
    galleryImages: support.galleryImages
      ? sql.unsafe("p.gallery_images")
      : sql.unsafe("'[]'::jsonb"),
    shapeType: support.shapeType
      ? sql.unsafe("p.shape_type")
      : sql.unsafe("null::text"),
    camberProfile: support.camberProfile
      ? sql.unsafe("p.camber_profile")
      : sql.unsafe("null::text"),
    dataStatus: support.dataStatus
      ? sql.unsafe("p.data_status")
      : sql.unsafe("'draft'::text"),
    sourceName: support.sourceName
      ? sql.unsafe("p.source_name")
      : sql.unsafe("null::text"),
    sourceUrl: support.sourceUrl
      ? sql.unsafe("p.source_url")
      : sql.unsafe("null::text"),
    sourceCheckedAt: support.sourceCheckedAt
      ? sql.unsafe("p.source_checked_at::text")
      : sql.unsafe("null::text"),
  };
}

async function loadFamilyRows(sql: Sql, slug?: string) {
  await assertCanonicalCatalogSupport(sql);

  if (slug != null) {
    return sql<CanonicalFamilySource[]>`
      select
        mf.id::text as "id",
        mf.slug as "slug",
        mf.brand as "brand",
        mf.model_name as "modelName",
        mf.season_label as "seasonLabel",
        mf.description_short as "descriptionShort",
        mf.description_full as "descriptionFull",
        mf.riding_style as "ridingStyle",
        mf.skill_level as "skillLevel",
        mf.flex as "flex",
        mf.board_line as "boardLine",
        mf.shape_type as "shapeType",
        mf.camber_profile as "camberProfile",
        mf.canonical_source_kind as "canonicalSourceKind",
        mf.canonical_source_name as "sourceName",
        mf.canonical_source_url as "sourceUrl",
        mf.canonical_source_checked_at::text as "sourceCheckedAt",
        mf.canonical_data_status as "dataStatus"
      from model_families mf
      where mf.slug = ${slug}
      limit 1
    `;
  }

  return sql<CanonicalFamilySource[]>`
    select
      mf.id::text as "id",
      mf.slug as "slug",
      mf.brand as "brand",
      mf.model_name as "modelName",
      mf.season_label as "seasonLabel",
      mf.description_short as "descriptionShort",
      mf.description_full as "descriptionFull",
      mf.riding_style as "ridingStyle",
      mf.skill_level as "skillLevel",
      mf.flex as "flex",
      mf.board_line as "boardLine",
      mf.shape_type as "shapeType",
      mf.camber_profile as "camberProfile",
      mf.canonical_source_kind as "canonicalSourceKind",
      mf.canonical_source_name as "sourceName",
      mf.canonical_source_url as "sourceUrl",
      mf.canonical_source_checked_at::text as "sourceCheckedAt",
      mf.canonical_data_status as "dataStatus"
    from model_families mf
    order by mf.brand, mf.model_name, mf.season_label, mf.slug
  `;
}

async function loadOfferRows(
  sql: Sql,
  options:
    | { kind: "all" }
    | { kind: "family"; familyId: string }
    | { kind: "singleton"; slug: string },
) {
  const {
    seasonLabel,
    galleryImages,
    shapeType,
    camberProfile,
    dataStatus,
    sourceName,
    sourceUrl,
    sourceCheckedAt,
  } = await getOfferSelectFragments(sql);

  const kind = options.kind;
  const familyId = options.kind === "family" ? options.familyId : "";
  const singletonSlug = options.kind === "singleton" ? options.slug : "";
  return sql<CanonicalOfferSource[]>`
    select
      p.id::text as "id",
      p.slug as "slug",
      p.brand as "brand",
      p.model_name as "modelName",
      ${seasonLabel} as "seasonLabel",
      p.description_short as "descriptionShort",
      p.description_full as "descriptionFull",
      p.riding_style as "ridingStyle",
      p.skill_level as "skillLevel",
      p.flex as "flex",
      p.board_line as "boardLine",
      ${shapeType} as "shapeType",
      ${camberProfile} as "camberProfile",
      ${dataStatus} as "dataStatus",
      p.price_from as "priceFrom",
      p.image_url as "imageUrl",
      ${galleryImages} as "galleryImages",
      p.is_active as "isActive",
      ${sourceName} as "sourceName",
      ${sourceUrl} as "sourceUrl",
      ${sourceCheckedAt} as "sourceCheckedAt",
      p.family_id::text as "familyId",
      p.family_member_role as "memberRole",
      p.family_match_method as "familyMatchMethod",
      p.family_match_confidence as "familyMatchConfidence",
      p.family_manual_override as "familyManualOverride",
      coalesce(
        json_agg(
          json_build_object(
            'id', ps.id::text,
            'sizeCm', ps.size_cm::float8,
            'sizeLabel', ps.size_label,
            'waistWidthMm', ps.waist_width_mm,
            'recommendedWeightMin', ps.recommended_weight_min,
            'recommendedWeightMax', ps.recommended_weight_max,
            'widthType', ps.width_type,
            'isAvailable', ps.is_available
          )
          order by ps.size_cm, ps.size_label, ps.id
        ) filter (where ps.id is not null),
        '[]'::json
      ) as "sizes"
    from products p
    left join product_sizes ps on ps.product_id = p.id
    where
      (
        ${kind} = 'all'
        and (p.family_id is not null or p.is_active = true)
      )
      or (
        ${kind} = 'family'
        and p.family_id::text = ${familyId}
      )
      or (
        ${kind} = 'singleton'
        and p.is_active = true
        and p.family_id is null
        and p.slug = ${singletonSlug}
      )
    group by p.id
    order by p.brand, p.model_name, p.family_member_role, p.slug, p.id
  `;
}

const loadAllCanonicalCatalogItemsFromDatabase = cache(async () => {
  const sql = получитьКлиентБазы();
  const families = await loadFamilyRows(sql);
  const offers = await loadOfferRows(sql, { kind: "all" });
  return buildCanonicalCatalogItems(families, offers);
});

const loadCanonicalCatalogItemBySlugFromDatabase = cache(
  async (slug: string) => {
    const sql = получитьКлиентБазы();
    const [family] = await loadFamilyRows(sql, slug);

    if (family) {
      const familyOffers = await loadOfferRows(sql, {
        kind: "family",
        familyId: family.id,
      });
      const [familyItem] = buildCanonicalCatalogItems([family], familyOffers);
      if (familyItem) {
        return familyItem;
      }
    }

    const singletonOffers = await loadOfferRows(sql, {
      kind: "singleton",
      slug,
    });
    const [singletonItem] = buildCanonicalCatalogItems([], singletonOffers);
    return singletonItem;
  },
);

const loadCanonicalBoardAliasBySlugFromDatabase = cache(
  async (slug: string): Promise<CanonicalBoardAliasRow | undefined> => {
    const sql = получитьКлиентБазы();
    await assertCanonicalCatalogSupport(sql);

    const [alias] = await sql<CanonicalBoardAliasRow[]>`
      select
        p.slug as "offerSlug",
        p.family_id::text as "familyId",
        mf.slug as "familySlug"
      from products p
      left join model_families mf on mf.id = p.family_id
      where p.slug = ${slug}
        and p.family_id is not null
      limit 1
    `;

    if (alias && alias.familySlug == null) {
      throw new Error(
        `Canonical board alias ${alias.offerSlug} references missing family ${alias.familyId}.`,
      );
    }

    return alias;
  },
);

const loadCanonicalOfferIdentityBySlugFromDatabase = cache(
  async (slug: string): Promise<CanonicalOfferIdentity | undefined> => {
    const sql = получитьКлиентБазы();
    const support = await getProductColumnSupport(sql);

    if (!support.modelFamilies || !support.familyId) {
      const [legacyOffer] = await sql<{ offerSlug: string }[]>`
        select p.slug as "offerSlug"
        from products p
        where p.slug = ${slug}
          and p.is_active = true
        limit 1
      `;

      return legacyOffer
        ? {
            boardSlug: legacyOffer.offerSlug,
            offerSlug: legacyOffer.offerSlug,
            familyId: null,
          }
        : undefined;
    }

    const [offer] = await sql<CanonicalOfferIdentityRow[]>`
      select
        p.slug as "offerSlug",
        p.family_id::text as "familyId",
        mf.slug as "familySlug"
      from products p
      left join model_families mf on mf.id = p.family_id
      where p.slug = ${slug}
        and p.is_active = true
      limit 1
    `;

    if (!offer) {
      return undefined;
    }

    if (offer.familyId != null && offer.familySlug == null) {
      throw new Error(
        `Canonical offer ${offer.offerSlug} references missing family ${offer.familyId}.`,
      );
    }

    return {
      boardSlug: offer.familySlug ?? offer.offerSlug,
      offerSlug: offer.offerSlug,
      familyId: offer.familyId,
    };
  },
);

export const getAllCanonicalCatalogItems = cache(async () => {
  if (!базаНастроена()) {
    return [];
  }

  return loadAllCanonicalCatalogItemsFromDatabase();
});

export const getCanonicalCatalogItemBySlug = cache(async (slug: string) => {
  if (!базаНастроена()) {
    return undefined;
  }

  return loadCanonicalCatalogItemBySlugFromDatabase(slug);
});

export const getAllCanonicalBoardSlugs = cache(async () => {
  const items = await getAllCanonicalCatalogItems();
  return items.map((item) => item.slug);
});

export const resolveCanonicalBoardRouteBySlug = cache(
  async (slug: string): Promise<CanonicalBoardRouteResolution | undefined> => {
    const exactItem = await getCanonicalCatalogItemBySlug(slug);

    if (exactItem) {
      return {
        kind: "render",
        item: exactItem,
      };
    }

    if (!базаНастроена()) {
      return undefined;
    }

    const alias = await loadCanonicalBoardAliasBySlugFromDatabase(slug);
    if (!alias?.familySlug) {
      return undefined;
    }

    const familyItem = await loadCanonicalCatalogItemBySlugFromDatabase(
      alias.familySlug,
    );
    if (!familyItem) {
      return undefined;
    }

    return {
      kind: "redirect",
      item: familyItem,
      canonicalSlug: familyItem.slug,
    };
  },
);

export const getCanonicalOfferIdentityBySlug = cache(async (slug: string) => {
  if (!базаНастроена()) {
    return undefined;
  }

  return loadCanonicalOfferIdentityBySlugFromDatabase(slug);
});

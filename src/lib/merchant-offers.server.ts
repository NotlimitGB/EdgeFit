import "server-only";
import { базаНастроена } from "@/lib/database/config";
import { получитьКлиентБазы } from "@/lib/database/client";
import type { Sql } from "postgres";
import type { CanonicalSizeIdentity, ExactSizeMerchantOfferSnapshot } from "./merchant-offers";

interface MerchantOfferRow {
  id: string;
  merchantSlug: string;
  merchantStatus: ExactSizeMerchantOfferSnapshot["merchantStatus"];
  sourceStatus: ExactSizeMerchantOfferSnapshot["sourceStatus"];
  sourceKind: ExactSizeMerchantOfferSnapshot["sourceKind"];
  commercialRightsStatus: ExactSizeMerchantOfferSnapshot["commercialRightsStatus"];
  sourceIdentityKey: string;
  merchantSizeSku: string | null;
  canonicalBoardKind: CanonicalSizeIdentity["boardKind"];
  canonicalBoardId: string;
  canonicalBoardSlug: string;
  canonicalSizeIdentityKey: string;
  canonicalSizeCm: number;
  displaySizeLabel: string;
  availabilityStatus: ExactSizeMerchantOfferSnapshot["availabilityStatus"];
  merchantProductUrl: string;
  merchantSizeUrl: string | null;
  sourceUrl: string;
  feedVersion: string | null;
  checksum: string | null;
  feedGeneratedAt: Date | null;
  merchantUpdatedAt: Date | null;
  sourceReceivedAt: Date | null;
  observedAt: Date | null;
  reconciliationStatus: ExactSizeMerchantOfferSnapshot["reconciliationStatus"];
  reconciliationCodes: string[];
  priceAmount: number | null;
  currency: string | null;
  priceScope: "PRODUCT" | "EXACT_SIZE" | null;
  priceObservedAt: Date | null;
  priceFeedGeneratedAt: Date | null;
  priceMerchantUpdatedAt: Date | null;
  priceSourceReceivedAt: Date | null;
  priceSourceUrl: string | null;
}

export async function getMerchantOffersForCanonicalSize(
  identity: CanonicalSizeIdentity,
  sql?: Sql,
): Promise<ExactSizeMerchantOfferSnapshot[]> {
  if (!базаНастроена()) return [];
  const database = sql ?? получитьКлиентБазы();

  const rows = await database<MerchantOfferRow[]>`
    select
      offer.id::text as "id",
      merchant.slug as "merchantSlug",
      merchant.status as "merchantStatus",
      product.source_status as "sourceStatus",
      product.source_kind as "sourceKind",
      product.commercial_rights_status as "commercialRightsStatus",
      offer.source_identity_key as "sourceIdentityKey",
      offer.merchant_size_sku as "merchantSizeSku",
      offer.canonical_board_kind as "canonicalBoardKind",
      offer.canonical_board_id::text as "canonicalBoardId",
      offer.canonical_board_slug as "canonicalBoardSlug",
      offer.canonical_size_identity_key as "canonicalSizeIdentityKey",
      offer.canonical_size_cm::float8 as "canonicalSizeCm",
      offer.display_size_label as "displaySizeLabel",
      offer.availability_status as "availabilityStatus",
      offer.merchant_product_url as "merchantProductUrl",
      offer.merchant_size_url as "merchantSizeUrl",
      offer.source_url as "sourceUrl",
      offer.feed_version as "feedVersion",
      offer.checksum as "checksum",
      offer.feed_generated_at as "feedGeneratedAt",
      offer.merchant_updated_at as "merchantUpdatedAt",
      offer.source_received_at as "sourceReceivedAt",
      offer.observed_at as "observedAt",
      offer.reconciliation_status as "reconciliationStatus",
      offer.reconciliation_codes as "reconciliationCodes",
      case when offer.price_amount is not null
        then offer.price_amount else product_offer.price_amount end::float8 as "priceAmount",
      case when offer.price_amount is not null
        then offer.currency else product_offer.currency end as "currency",
      case when offer.price_amount is not null
        then offer.price_scope else product_offer.price_scope end as "priceScope",
      case when offer.price_amount is not null
        then offer.observed_at else product_offer.observed_at end as "priceObservedAt",
      case when offer.price_amount is not null
        then offer.feed_generated_at else product_offer.feed_generated_at end as "priceFeedGeneratedAt",
      case when offer.price_amount is not null
        then offer.merchant_updated_at else product_offer.merchant_updated_at end as "priceMerchantUpdatedAt",
      case when offer.price_amount is not null
        then offer.source_received_at else product_offer.source_received_at end as "priceSourceReceivedAt",
      case when offer.price_amount is not null
        then offer.source_url else product_offer.source_url end as "priceSourceUrl"
    from merchant_offers offer
    join merchant_products product
      on product.id = offer.merchant_product_id
      and product.merchant_id = offer.merchant_id
    join merchants merchant on merchant.id = offer.merchant_id
    left join merchant_offers product_offer
      on product_offer.merchant_product_id = offer.merchant_product_id
      and product_offer.offer_scope = 'PRODUCT'
    where offer.offer_scope = 'EXACT_SIZE'
      and offer.reconciliation_status = 'MATCHED'
      and offer.canonical_board_kind = ${identity.boardKind}
      and offer.canonical_board_id = ${identity.boardId}::uuid
      and offer.canonical_board_slug = ${identity.boardSlug}
      and offer.canonical_size_identity_key = ${identity.identityKey}
      and offer.canonical_size_cm = ${identity.sizeCm}
      and offer.display_size_label = ${identity.displaySizeLabel}
    order by merchant.slug, offer.id
  `;

  return rows.map((row) => ({
    id: row.id,
    merchantSlug: row.merchantSlug,
    merchantStatus: row.merchantStatus,
    sourceStatus: row.sourceStatus,
    sourceKind: row.sourceKind,
    commercialRightsStatus: row.commercialRightsStatus,
    sourceIdentityKey: row.sourceIdentityKey,
    merchantSizeSku: row.merchantSizeSku,
    identity: {
      boardKind: row.canonicalBoardKind,
      boardId: row.canonicalBoardId,
      boardSlug: row.canonicalBoardSlug,
      sizeCm: row.canonicalSizeCm,
      displaySizeLabel: row.displaySizeLabel,
      identityKey: row.canonicalSizeIdentityKey,
    },
    availabilityStatus: row.availabilityStatus,
    merchantProductUrl: row.merchantProductUrl,
    merchantSizeUrl: row.merchantSizeUrl,
    sourceUrl: row.sourceUrl,
    feedVersion: row.feedVersion,
    checksum: row.checksum,
    feedGeneratedAt: row.feedGeneratedAt,
    merchantUpdatedAt: row.merchantUpdatedAt,
    sourceReceivedAt: row.sourceReceivedAt,
    observedAt: row.observedAt,
    reconciliationStatus: row.reconciliationStatus,
    reconciliationCodes: row.reconciliationCodes,
    price:
      row.priceAmount == null || row.currency == null || row.priceScope == null
        ? null
        : {
            amount: row.priceAmount,
            currency: row.currency.trim(),
            scope: row.priceScope,
            observedAt: row.priceObservedAt,
            feedGeneratedAt: row.priceFeedGeneratedAt,
            merchantUpdatedAt: row.priceMerchantUpdatedAt,
            sourceReceivedAt: row.priceSourceReceivedAt,
            sourceUrl: row.priceSourceUrl ?? row.sourceUrl,
          },
  }));
}

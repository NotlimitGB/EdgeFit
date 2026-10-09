import { evaluateCurrentExactSizeOffer, type CanonicalSizeIdentity,
  type ExactSizeMerchantOfferSnapshot, type MerchantFreshnessPolicies } from "./merchant-offers";

/** Pure future presentation contract. No public loader, DB, navigation or tracking. */
export function projectMerchantOffer(offer: ExactSizeMerchantOfferSnapshot,
  identity: CanonicalSizeIdentity, now: Date, policies: MerchantFreshnessPolicies | null) {
  const evaluated = evaluateCurrentExactSizeOffer(offer, identity, now, policies);
  const priceLabel = {
    FRESH: "Цена по недавнему наблюдению",
    AGING: "Ранее наблюдавшаяся цена",
    STALE: "Устаревшее наблюдение цены",
    UNKNOWN: "Текущая цена не подтверждена",
  }[evaluated.priceFreshness];
  const stockLabel = evaluated.availabilityFreshness === "UNKNOWN"
    ? "Текущее наличие не подтверждено"
    : evaluated.availabilityFreshness === "STALE"
      ? "Наблюдение наличия устарело"
      : { IN_STOCK: "При проверке ростовка была в наличии",
        OUT_OF_STOCK: "При проверке ростовки не было в наличии",
        PREORDER: "При проверке ростовка была доступна по предзаказу",
        UNKNOWN: "Текущее наличие не подтверждено" }[offer.availabilityStatus];
  return {
    merchantSlug: offer.merchantSlug,
    price: { freshness: evaluated.priceFreshness, label: priceLabel,
      amount: evaluated.priceFreshness === "UNKNOWN" ? null : offer.price?.amount ?? null,
      currency: offer.price?.currency ?? null, scope: offer.price?.scope ?? null,
      scopeLabel: offer.price?.scope === "PRODUCT" ? "Цена товара, не конкретной ростовки" : "Цена ростовки",
      observedAt: evaluated.priceFreshness === "UNKNOWN" ? null : offer.price?.observedAt ?? null },
    availability: { freshness: evaluated.availabilityFreshness, label: stockLabel,
      status: evaluated.availabilityFreshness === "FRESH" ? offer.availabilityStatus : "UNKNOWN",
      observedStatus: evaluated.availabilityFreshness === "UNKNOWN" ? "UNKNOWN" : offer.availabilityStatus,
      scope: offer.availability?.scope ?? null,
      observedAt: evaluated.availabilityFreshness === "UNKNOWN" ? null : offer.availability?.observedAt ?? null },
    purchaseReady: evaluated.purchaseReady,
    cta: "Проверить в магазине",
    reminder: "Перед покупкой проверь цену и наличие у продавца.",
  };
}

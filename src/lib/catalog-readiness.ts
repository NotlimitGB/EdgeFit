import type { Product } from "@/types/domain";

const placeholderShopPattern = /example\.(com|org|net)/iu;

export function hasCatalogSource(product: Product) {
  return Boolean(product.sourceName?.trim() && product.sourceUrl?.trim());
}

export function isStoreSpecificationSource(url: string | null | undefined) {
  const value = url?.trim();

  if (!value) {
    return false;
  }

  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      hostname === "trial-sport.ru" ||
      hostname === "www.trial-sport.ru" ||
      hostname === "traektoria.ru" ||
      hostname === "www.traektoria.ru"
    );
  } catch {
    return false;
  }
}

export function hasTrustedFlex(product: Product) {
  return (
    product.dataStatus === "verified" &&
    hasCatalogSource(product) &&
    !isStoreSpecificationSource(product.sourceUrl)
  );
}

export function hasPlaceholderAffiliateLink(product: Product) {
  return placeholderShopPattern.test(product.affiliateUrl);
}

export function hasAffiliateLink(product: Product) {
  return Boolean(product.affiliateUrl?.trim());
}

export function isVerifiedProduct(product: Product) {
  return product.dataStatus === "verified";
}

export function isReadyForCatalog(product: Product) {
  return (
    isVerifiedProduct(product) &&
    hasCatalogSource(product) &&
    hasAffiliateLink(product) &&
    !hasPlaceholderAffiliateLink(product)
  );
}

export function getProductCatalogIssues(product: Product) {
  const issues: string[] = [];

  if (!isVerifiedProduct(product)) {
    issues.push("Модель ещё не отмечена как проверенная.");
  }

  if (!hasCatalogSource(product)) {
    issues.push("Не указан источник характеристик.");
  }

  if (!hasAffiliateLink(product)) {
    issues.push("Не указана ссылка в магазин.");
  }

  if (hasPlaceholderAffiliateLink(product)) {
    issues.push("В карточке пока стоит временная ссылка в магазин.");
  }

  return issues;
}

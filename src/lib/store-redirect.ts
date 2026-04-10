import { getBoardSizeLabel } from "@/lib/board-size";
import type { Product } from "@/types/domain";
import type { ProductSize, WidthType } from "@/types/domain";

interface BuildStoreRedirectHrefArgs {
  productSlug: string;
  from?: string;
  placement?: string;
  sizeCm?: number;
  sizeLabel?: string | null;
  widthType?: WidthType;
}

const PREFERRED_STORE_HOSTS = new Set([
  "trial-sport.ru",
  "www.trial-sport.ru",
  "traektoria.ru",
  "www.traektoria.ru",
]);

function getHostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function normalizeStoreSearchQuery(value: string) {
  return String(value ?? "")
    .replace(/\b20\d{2}(?:\/20\d{2})?\b/gu, " ")
    .replace(/\b(?:snowboard|сноуборд)\b/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function isPreferredStoreUrl(value?: string | null) {
  if (!value?.trim()) {
    return false;
  }

  const hostname = getHostname(value);

  return hostname ? PREFERRED_STORE_HOSTS.has(hostname) : false;
}

export function buildTrialSportSearchUrl(query: string) {
  const normalizedQuery = normalizeStoreSearchQuery(query);
  const searchParams = new URLSearchParams({
    q: normalizedQuery,
  });

  return `https://trial-sport.ru/search/?${searchParams.toString()}`;
}

export function resolveProductStoreUrl(
  product: Pick<Product, "affiliateUrl" | "brand" | "modelName">,
) {
  if (isPreferredStoreUrl(product.affiliateUrl)) {
    return product.affiliateUrl;
  }

  return buildTrialSportSearchUrl(`${product.brand} ${product.modelName}`);
}

export function buildStoreRedirectHref(
  productSlugOrArgs: string | BuildStoreRedirectHrefArgs,
  maybeArgs: Omit<BuildStoreRedirectHrefArgs, "productSlug"> = {},
) {
  const {
    productSlug,
    from,
    placement,
    sizeCm,
    sizeLabel,
    widthType,
  } =
    typeof productSlugOrArgs === "string"
      ? { productSlug: productSlugOrArgs, ...maybeArgs }
      : productSlugOrArgs;
  const searchParams = new URLSearchParams();

  if (from) {
    searchParams.set("from", from);
  }

  if (placement) {
    searchParams.set("placement", placement);
  }

  if (sizeCm != null) {
    searchParams.set("sizeCm", String(sizeCm));
  }

  if (sizeLabel) {
    searchParams.set("sizeLabel", sizeLabel);
  }

  if (widthType) {
    searchParams.set("widthType", widthType);
  }

  const query = searchParams.toString();

  return query ? `/go/${productSlug}?${query}` : `/go/${productSlug}`;
}

export function buildStoreRedirectHrefForSize(
  productSlug: string,
  size?: ProductSize,
  args: Omit<BuildStoreRedirectHrefArgs, "productSlug" | "sizeCm" | "sizeLabel" | "widthType"> = {},
) {
  return buildStoreRedirectHref({
    productSlug,
    sizeCm: size?.sizeCm,
    sizeLabel: size ? getBoardSizeLabel(size) : null,
    widthType: size?.widthType,
    ...args,
  });
}

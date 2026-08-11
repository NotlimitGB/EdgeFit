import { getBoardSizeLabel } from "@/lib/board-size";
import type { Product } from "@/types/domain";
import type { ProductSize, WidthType } from "@/types/domain";

interface BuildStoreRedirectHrefArgs {
  productSlug: string;
  from?: string;
  placement?: string;
  sizeCm?: number;
  sizeLabel?: string | null;
  sourceSizeLabel?: string | null;
  widthType?: WidthType;
}

type SupportedStoreDestination = {
  merchantLabel: "Trial Sport" | "Траектория";
  actionLabel: string;
};

export type StoreDestinationMode = "direct" | "fallback-search" | "saved";

export interface StoreDestinationPresentation {
  mode: StoreDestinationMode;
  merchantLabel: SupportedStoreDestination["merchantLabel"] | null;
  actionLabel: string;
  priceLabel: "Ориентир цены";
  note?: string;
}

const SUPPORTED_STORE_DESTINATIONS: Readonly<
  Record<string, SupportedStoreDestination>
> = {
  "trial-sport.ru": {
    merchantLabel: "Trial Sport",
    actionLabel: "Открыть в Trial Sport",
  },
  "www.trial-sport.ru": {
    merchantLabel: "Trial Sport",
    actionLabel: "Открыть в Trial Sport",
  },
  "traektoria.ru": {
    merchantLabel: "Траектория",
    actionLabel: "Открыть в Траектории",
  },
  "www.traektoria.ru": {
    merchantLabel: "Траектория",
    actionLabel: "Открыть в Траектории",
  },
};

function getHostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function getSupportedStoreDestination(value?: string | null) {
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    return null;
  }

  const hostname = getHostname(normalizedValue);
  return hostname ? SUPPORTED_STORE_DESTINATIONS[hostname] ?? null : null;
}

function normalizeStoreSearchQuery(value: string) {
  return String(value ?? "")
    .replace(/\b20\d{2}(?:\/20\d{2})?\b/gu, " ")
    .replace(/\b(?:snowboard|сноуборд)\b/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function isPreferredStoreUrl(value?: string | null) {
  return getSupportedStoreDestination(value) != null;
}

export function getStoreDestinationPresentation(
  affiliateUrl: string | null | undefined,
  resultMode: "session" | "saved" = "session",
): StoreDestinationPresentation {
  if (resultMode === "saved") {
    return {
      mode: "saved",
      merchantLabel: null,
      actionLabel: "Проверить в магазине",
      priceLabel: "Ориентир цены",
    };
  }

  const supportedDestination = getSupportedStoreDestination(affiliateUrl);
  if (supportedDestination) {
    return {
      mode: "direct",
      merchantLabel: supportedDestination.merchantLabel,
      actionLabel: supportedDestination.actionLabel,
      priceLabel: "Ориентир цены",
      note: "Актуальные цену и наличие проверь в магазине.",
    };
  }

  return {
    mode: "fallback-search",
    merchantLabel: "Trial Sport",
    actionLabel: "Искать в Trial Sport",
    priceLabel: "Ориентир цены",
    note: "Откроется поиск модели в магазине. Актуальные цену и наличие проверь там.",
  };
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
    sourceSizeLabel,
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

  if (sourceSizeLabel) {
    searchParams.set("sourceSizeLabel", sourceSizeLabel);
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
  args: Omit<
    BuildStoreRedirectHrefArgs,
    "productSlug" | "sizeCm" | "sizeLabel" | "widthType"
  > = {},
) {
  return buildStoreRedirectHref({
    productSlug,
    sizeCm: size?.sizeCm,
    sizeLabel: size ? getBoardSizeLabel(size) : null,
    widthType: size?.widthType,
    ...args,
  });
}

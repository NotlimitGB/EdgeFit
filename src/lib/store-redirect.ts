import { getBoardSizeLabel } from "@/lib/board-size";
import type { ProductSize, WidthType } from "@/types/domain";

interface BuildStoreRedirectHrefArgs {
  productSlug: string;
  from?: string;
  placement?: string;
  sizeCm?: number;
  sizeLabel?: string | null;
  widthType?: WidthType;
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

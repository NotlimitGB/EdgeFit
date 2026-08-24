import { getBoardSizeLabel } from "@/lib/board-size";
import {
  getStoreDestinationPresentation,
  getStoreDestinationProvenance,
  resolveProductStoreUrl,
  type StoreDestinationMode,
} from "@/lib/store-redirect";
import type { Product, ProductSize, WidthType } from "@/types/domain";

export type ExactSizeOfferStatus =
  | "confirmed_available"
  | "not_confirmed"
  | "search_only";

export interface ExactSizeRecommendation {
  sizeCm: number;
  sizeLabel?: string | null;
  widthType: WidthType;
}

export interface ExactSizeOfferIntelligence {
  status: ExactSizeOfferStatus;
  recommendedSizeLabel: string | null;
  merchantLabel: string | null;
  storeCode: string | null;
  sourceProductId: string | null;
  destinationUrl: string;
  destinationMode: StoreDestinationMode;
  exactSizeMatched: boolean;
}

interface GetExactSizeOfferIntelligenceArgs {
  product: Pick<
    Product,
    "affiliateUrl" | "brand" | "modelName" | "sizes"
  >;
  recommendedSize: ExactSizeRecommendation | null;
  resultMode?: "session" | "saved";
}

function hasExactSizeIdentity(
  candidate: ProductSize,
  recommendedSize: ExactSizeRecommendation,
) {
  return (
    candidate.sizeCm === recommendedSize.sizeCm &&
    candidate.widthType === recommendedSize.widthType &&
    getBoardSizeLabel(candidate) === getBoardSizeLabel(recommendedSize)
  );
}

export function getExactSizeOfferIntelligence({
  product,
  recommendedSize,
  resultMode = "session",
}: GetExactSizeOfferIntelligenceArgs): ExactSizeOfferIntelligence {
  const destinationUrl = resolveProductStoreUrl(product);
  const destination = getStoreDestinationProvenance(destinationUrl);
  const presentation = getStoreDestinationPresentation(
    product.affiliateUrl,
    resultMode,
  );
  const exactMatches = recommendedSize
    ? product.sizes.filter((size) =>
        hasExactSizeIdentity(size, recommendedSize),
      )
    : [];
  const exactSizeMatched = exactMatches.length === 1;
  const recommendedSizeLabel = recommendedSize
    ? getBoardSizeLabel(recommendedSize)
    : null;

  let status: ExactSizeOfferStatus = "not_confirmed";

  if (presentation.mode !== "direct") {
    status = "search_only";
  } else if (
    destination.storeCode &&
    destination.sourceProductId &&
    exactSizeMatched &&
    exactMatches[0]?.isAvailable === true
  ) {
    status = "confirmed_available";
  }

  return {
    status,
    recommendedSizeLabel,
    merchantLabel: presentation.merchantLabel,
    storeCode: destination.storeCode,
    sourceProductId: destination.sourceProductId,
    destinationUrl,
    destinationMode: presentation.mode,
    exactSizeMatched,
  };
}

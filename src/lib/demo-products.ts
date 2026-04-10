import boardsSeed from "@/data/seed/boards.seed.json";
import type { Product } from "@/types/domain";

function normalizeDemoProduct(product: Product): Product {
  return {
    ...product,
    shapeType: product.shapeType ?? null,
    dataStatus: product.dataStatus ?? "draft",
    sourceName: product.sourceName?.trim() || null,
    sourceUrl: product.sourceUrl?.trim() || null,
    sourceCheckedAt: product.sourceCheckedAt || null,
    sizes: product.sizes.map((size) => ({
      ...size,
      sizeLabel: size.sizeLabel?.trim() || null,
      isAvailable: size.isAvailable !== false,
    })),
  };
}

const демоМодели = (boardsSeed as Product[]).map(normalizeDemoProduct);

export function получитьДемоМодели() {
  return демоМодели.filter((модель) => модель.isActive);
}

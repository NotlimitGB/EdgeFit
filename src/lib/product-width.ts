import type { Product, WidthType } from "@/types/domain";

export function получитьОсновнойТипШирины(модель: Product): WidthType {
  const ширины = модель.sizes.map((размер) => размер.widthType);

  if (ширины.includes("wide")) {
    return "wide";
  }

  if (ширины.includes("mid-wide")) {
    return "mid-wide";
  }

  return "regular";
}

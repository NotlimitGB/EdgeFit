import type { ProductSize } from "@/types/domain";

export function formatBoardSizeValue(sizeCm: number) {
  return String(Number(sizeCm));
}

export function getBoardSizeLabel(
  size: Pick<ProductSize, "sizeCm" | "sizeLabel">,
) {
  const sizeLabel = size.sizeLabel?.trim();

  if (sizeLabel) {
    return sizeLabel;
  }

  return formatBoardSizeValue(size.sizeCm);
}


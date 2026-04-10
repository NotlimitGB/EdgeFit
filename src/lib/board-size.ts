import type { ProductSize } from "@/types/domain";

export function formatBoardSizeValue(sizeCm: number) {
  return String(Number(sizeCm));
}

function normalizeBoardSizeLabel(sizeLabel: string) {
  return sizeLabel
    .replace(/\s*(?:cm|\u0441\u043c)\.?$/iu, "")
    .replace(/\s+/gu, "")
    .trim();
}

export function getBoardSizeLabel(
  size: Pick<ProductSize, "sizeCm" | "sizeLabel">,
) {
  const sizeLabel = normalizeBoardSizeLabel(size.sizeLabel?.trim() ?? "");

  if (sizeLabel) {
    return sizeLabel;
  }

  return formatBoardSizeValue(size.sizeCm);
}

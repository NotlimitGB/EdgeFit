import { getBoardSizeLabel } from "@/lib/board-size";
import type { Product, ProductSize } from "@/types/domain";

function pluralizeSize(count: number) {
  const remainder10 = count % 10;
  const remainder100 = count % 100;

  if (remainder10 === 1 && remainder100 !== 11) {
    return "размер";
  }

  if (
    remainder10 >= 2 &&
    remainder10 <= 4 &&
    (remainder100 < 12 || remainder100 > 14)
  ) {
    return "размера";
  }

  return "размеров";
}

export function getAvailableSizes(
  product: Pick<Product, "sizes">,
): ProductSize[] {
  return product.sizes.filter((size) => size.isAvailable !== false);
}

export function getAvailableSizeCount(product: Pick<Product, "sizes">) {
  return getAvailableSizes(product).length;
}

export function getAllSizeCount(product: Pick<Product, "sizes">) {
  return product.sizes.length;
}

export function getAvailabilityHeadline(product: Pick<Product, "sizes">) {
  const sizeCount = getAvailableSizeCount(product);

  if (sizeCount === 0) {
    return "Сейчас нет доступных размеров";
  }

  return `В наличии ${sizeCount} ${pluralizeSize(sizeCount)}`;
}

export function getAvailabilitySizePreview(
  product: Pick<Product, "sizes">,
  limit = 4,
) {
  const sizeLabels = getAvailableSizes(product)
    .map((size) => getBoardSizeLabel(size))
    .filter(Boolean);

  if (sizeLabels.length === 0) {
    return "Наличие лучше уточнить перед переходом в магазин.";
  }

  if (sizeLabels.length <= limit) {
    return sizeLabels.join(", ");
  }

  return `${sizeLabels.slice(0, limit).join(", ")} + ещё ${sizeLabels.length - limit}`;
}

export function getAvailabilityDescription(product: Pick<Product, "sizes">) {
  const sizeCount = getAvailableSizeCount(product);
  const allSizeCount = getAllSizeCount(product);

  if (sizeCount === 0) {
    return "Модель можно оставить в закладках, но доступные размеры в магазине сейчас не подтверждены.";
  }

  if (allSizeCount <= sizeCount) {
    return `Сейчас в наличии: ${getAvailabilitySizePreview(product)}.`;
  }

  return `Показываем полную размерную сетку модели и отдельно отмечаем, что реально доступно сейчас. В наличии: ${getAvailabilitySizePreview(product)}.`;
}

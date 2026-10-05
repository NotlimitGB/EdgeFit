import { isUnsafeCatalogNarrative } from "@/lib/public-narrative";
import type { CanonicalCatalogItem } from "@/types/canonical-catalog";

export function getSafeCatalogDescription(board: CanonicalCatalogItem) {
  const stored = board.canonicalSpecs.descriptionShort?.trim();
  if (stored && !isUnsafeCatalogNarrative(stored)) return stored;
  const identity = `${board.brand.trim()} ${board.modelName.trim()}`;
  const season = board.seasonLabel?.trim();
  const labels = [...new Set(board.sizes.filter((size) => size.offerIsActive)
    .map((size) => size.displaySizeLabel.trim()).filter(Boolean))];
  const sizes = labels.length ? ` Ростовки: ${labels.slice(0, 3).join(", ")}${labels.length > 3 ? " и другие" : ""}.` : "";
  return `${identity}${season ? `, сезон ${season}` : ""}.${sizes}`;
}

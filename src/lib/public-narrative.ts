export function hasAdjacentDuplicateWord(value: string) {
  return /(?:^|[^\p{L}\p{N}])([\p{L}\p{N}]+)\s+\1(?=$|[^\p{L}\p{N}])/u.test(
    value.toLocaleLowerCase("ru-RU"),
  );
}

/** Existing board policy, shared without changing board-detail behavior. */
export function isUnsafeStoredNarrative(value: string) {
  const normalized = value.toLocaleLowerCase("ru-RU");
  return /из\s+каталога/u.test(normalized) || /в\s+карточке\s+магазина/u.test(normalized) ||
    /триал\s*[-–—]\s*спорт/u.test(normalized) || /траектория/u.test(normalized) ||
    hasAdjacentDuplicateWord(normalized);
}

export function isUnsafeCatalogNarrative(value: string) {
  return isUnsafeStoredNarrative(value) ||
    /\bsku\b|артикул|магазин|куп(?:и|ить|ите)|скидк|распродаж|лучш(?:ий|ая|ее)|гарантир/iu.test(value);
}

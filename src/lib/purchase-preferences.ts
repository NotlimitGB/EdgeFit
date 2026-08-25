import { z } from "zod";

export const purchasePreferencesSchema = z.strictObject({
  budgetMaxRub: z.number().int().min(1).max(1_000_000).nullable(),
});

export type PurchasePreferences = z.infer<typeof purchasePreferencesSchema>;

export const EMPTY_PURCHASE_PREFERENCES: PurchasePreferences = {
  budgetMaxRub: null,
};

export type BudgetRelation =
  | "budget_not_set"
  | "within_catalog_estimate"
  | "over_catalog_estimate"
  | "price_unknown";

export function getBudgetRelation(
  priceFrom: number,
  budgetMaxRub: number | null,
): BudgetRelation {
  if (budgetMaxRub == null) {
    return "budget_not_set";
  }

  if (!Number.isFinite(priceFrom) || priceFrom <= 0) {
    return "price_unknown";
  }

  return priceFrom <= budgetMaxRub
    ? "within_catalog_estimate"
    : "over_catalog_estimate";
}

export function parseBudgetDraftValue(value: string) {
  if (value === "") {
    return purchasePreferencesSchema.safeParse(EMPTY_PURCHASE_PREFERENCES);
  }

  if (!/^-?\d+$/u.test(value)) {
    return purchasePreferencesSchema.safeParse({ budgetMaxRub: Number.NaN });
  }

  return purchasePreferencesSchema.safeParse({ budgetMaxRub: Number(value) });
}

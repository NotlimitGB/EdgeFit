import { describe, expect, it } from "vitest";
import {
  getBudgetRelation,
  purchasePreferencesSchema,
} from "@/lib/purchase-preferences";

describe("purchase preferences", () => {
  it.each([
    [null, "budget_not_set"],
    [60_000, "within_catalog_estimate"],
  ] as const)("classifies a 50,000 reference against %s", (budget, expected) => {
    expect(getBudgetRelation(50_000, budget)).toBe(expected);
  });

  it("uses cautious product-level relation states", () => {
    expect(getBudgetRelation(60_000, 60_000)).toBe("within_catalog_estimate");
    expect(getBudgetRelation(70_000, 60_000)).toBe("over_catalog_estimate");
    expect(getBudgetRelation(0, 60_000)).toBe("price_unknown");
    expect(getBudgetRelation(Number.NaN, 60_000)).toBe("price_unknown");
  });

  it("accepts only nullable integer ruble budgets within the contract", () => {
    expect(purchasePreferencesSchema.safeParse({ budgetMaxRub: null }).success).toBe(true);
    expect(purchasePreferencesSchema.safeParse({ budgetMaxRub: 1 }).success).toBe(true);
    expect(purchasePreferencesSchema.safeParse({ budgetMaxRub: 1_000_000 }).success).toBe(true);
    expect(purchasePreferencesSchema.safeParse({ budgetMaxRub: 0 }).success).toBe(false);
    expect(purchasePreferencesSchema.safeParse({ budgetMaxRub: 1.5 }).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { getCatalogBrands, normalizeCatalogBrand } from "./catalog-brand";

describe("catalog brand presentation", () => {
  it("normalizes only explicit CAPiTA aliases and trims", () => {
    expect(normalizeCatalogBrand(" Capita ")).toBe("CAPiTA");
    expect(normalizeCatalogBrand("CAPiTA")).toBe("CAPiTA");
    expect(normalizeCatalogBrand(" capita ")).toBe("capita");
    expect(normalizeCatalogBrand(" YES. ")).toBe("YES.");
    expect(getCatalogBrands(["Capita", "CAPiTA", "Burton", "", " "])).toEqual(["Burton", "CAPiTA"]);
    expect(getCatalogBrands(["Unknown", "unknown"])).toHaveLength(2);
  });
});

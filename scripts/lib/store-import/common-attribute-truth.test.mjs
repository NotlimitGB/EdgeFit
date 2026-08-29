import { describe, expect, it } from "vitest";
import {
  createAttributeTruthObservation,
  resolveFlex,
  resolveRidingStyle,
  resolveSkillLevel,
} from "./common.mjs";
import { getBoardLineEvidence } from "./source-identity.mjs";

describe("merchant attribute truth resolvers", () => {
  it.each([
    ["All Mountain", "all-mountain"],
    ["универсальная модель", "all-mountain"],
    ["Park / freestyle", "park"],
    ["Фрирайд", "freeride"],
  ])("resolves one explicit riding-style group from %j", (source, value) => {
    expect(resolveRidingStyle(source)).toEqual({ value, evidence: "known" });
  });

  it.each([
    ["", "missing"],
    ["touring", "unrecognized"],
    ["all-mountain и фрирайд", "ambiguous"],
  ])("fails riding style %j closed as %s", (source, evidence) => {
    expect(resolveRidingStyle(source)).toEqual({ value: null, evidence });
  });

  it.each([
    ["1", 1],
    ["7.6", 8],
    ["мягкая", 3],
    ["средняя", 5],
    ["жесткая", 8],
  ])("resolves explicit flex %j", (source, value) => {
    expect(resolveFlex(source)).toEqual({ value, evidence: "known" });
  });

  it.each([
    ["", "missing"],
    ["11", "unrecognized"],
    ["0", "unrecognized"],
    ["variable", "unrecognized"],
    ["мягкая-средняя", "ambiguous"],
  ])("fails flex %j closed as %s", (source, evidence) => {
    expect(resolveFlex(source)).toEqual({ value: null, evidence });
  });

  it("uses explicit skill evidence before a known flex derivation", () => {
    expect(
      resolveSkillLevel({
        levelText: "для экспертов",
        flexResolution: { value: 3, evidence: "known" },
      }),
    ).toEqual({ value: "advanced", evidence: "known" });
    expect(
      resolveSkillLevel({
        levelText: "",
        flexResolution: { value: 3, evidence: "known" },
      }),
    ).toEqual({ value: "beginner", evidence: "derived_from_known_flex" });
  });

  it("does not derive skill from unresolved flex", () => {
    expect(
      resolveSkillLevel({
        levelText: "",
        flexResolution: { value: null, evidence: "missing" },
      }),
    ).toEqual({ value: null, evidence: "missing" });
  });

  it.each([
    ["мужская модель", "men", "known"],
    ["женская модель", "women", "known"],
    ["унисекс", "unisex", "known"],
    ["", "unisex", "missing"],
    ["обычная модель", "unisex", "missing"],
  ])("keeps board-line evidence explicit for %j", (source, boardLine, evidence) => {
    expect(getBoardLineEvidence(source)).toEqual({ boardLine, evidence });
  });

  it("creates a sorted allowlisted observation without raw source text", () => {
    expect(
      createAttributeTruthObservation({
        storeCode: "trial-sport",
        sourceProductId: "1001",
        availability: "available",
        unresolvedAttributes: [
          "waist_width",
          "raw merchant field",
          "flex",
          "riding_style",
          "flex",
        ],
      }),
    ).toEqual({
      storeCode: "trial-sport",
      sourceProductId: "1001",
      availability: "available",
      status: "safe_unimportable",
      reason: "attribute_truth_unresolved",
      unresolvedAttributes: ["riding_style", "flex", "waist_width"],
    });
  });
});

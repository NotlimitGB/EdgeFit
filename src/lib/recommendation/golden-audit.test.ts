import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALGORITHM_VERSION } from "./engine";
import {
  goldenRecommendationCases,
  goldenRecommendationInvariants,
  type GoldenRecommendationInvariantRule,
} from "./golden-dataset";
import {
  auditBootDrag,
  auditInvariantRule,
  auditLength,
  auditShape,
  auditSupportProfile,
  auditWaist,
  auditWidth,
  currentGoldenAudit,
  renderGoldenAuditMarkdown,
  runGoldenRecommendationAudit,
  type GoldenObservableActual,
} from "./golden-audit";

const baseActual: GoldenObservableActual = {
  lengthRange: { min: 152, max: 158 },
  recommendedWidthType: "regular",
  targetWaistWidthMm: 250,
  bootDragRisk: "low",
  primaryShape: "directional-twin",
};

function normalizeMarkdown(value: string) {
  return value.replace(/\r\n/g, "\n").trimEnd();
}

describe("golden recommendation audit", () => {
  it("audits all golden cases and invariants against the current version", () => {
    expect(currentGoldenAudit.absoluteResults).toHaveLength(36);
    expect(currentGoldenAudit.invariantResults).toHaveLength(12);
    expect(currentGoldenAudit.algorithmVersion).toBe(ALGORITHM_VERSION);
    expect(
      currentGoldenAudit.absoluteResults.every(
        ({ algorithmVersion }) => algorithmVersion === ALGORITHM_VERSION,
      ),
    ).toBe(true);

    expect(
      new Set(currentGoldenAudit.absoluteResults.map(({ caseId }) => caseId)),
    ).toEqual(new Set(goldenRecommendationCases.map(({ id }) => id)));
    expect(
      new Set(
        currentGoldenAudit.invariantResults.map(({ invariantId }) => invariantId),
      ),
    ).toEqual(new Set(goldenRecommendationInvariants.map(({ id }) => id)));
  });

  it("is deterministic for identical inputs", () => {
    expect(runGoldenRecommendationAudit()).toEqual(runGoldenRecommendationAudit());
  });

  it("does not mutate the upstream golden dataset", () => {
    const beforeCases = JSON.stringify(goldenRecommendationCases);
    const beforeInvariants = JSON.stringify(goldenRecommendationInvariants);

    runGoldenRecommendationAudit();

    expect(JSON.stringify(goldenRecommendationCases)).toBe(beforeCases);
    expect(JSON.stringify(goldenRecommendationInvariants)).toBe(beforeInvariants);
  });

  describe("absolute status logic", () => {
    it("classifies length inside as PASS and any outside range as REVIEW", () => {
      const expected = { saneMinCm: 150, saneMaxCm: 160 };

      expect(auditLength(expected, { min: 151, max: 159 }).status).toBe("PASS");
      expect(auditLength(expected, { min: 149, max: 159 }).status).toBe(
        "REVIEW",
      );
      expect(auditLength(expected, { min: 151, max: 161 }).status).toBe(
        "REVIEW",
      );
      expect(auditLength(expected, { min: 149, max: 161 }).reason).toContain(
        "below and above",
      );
    });

    it("classifies width as allowed, too narrow, or too wide", () => {
      expect(auditWidth(["regular", "mid-wide"], "regular").status).toBe(
        "PASS",
      );
      expect(auditWidth(["mid-wide", "wide"], "regular").status).toBe("FAIL");
      expect(auditWidth(["regular"], "mid-wide").status).toBe("REVIEW");
    });

    it("classifies waist as inside, too low, or too high", () => {
      const expected = { min: 248, max: 260 };

      expect(auditWaist(expected, 252).status).toBe("PASS");
      expect(auditWaist(expected, 247).status).toBe("FAIL");
      expect(auditWaist(expected, 261).status).toBe("REVIEW");
    });

    it("classifies boot-drag risk as allowed, under-warning, or over-warning", () => {
      expect(auditBootDrag(["low", "medium"], "medium").status).toBe("PASS");
      expect(auditBootDrag(["medium", "high"], "low").status).toBe("FAIL");
      expect(auditBootDrag(["low"], "medium").status).toBe("REVIEW");
    });

    it("classifies shape mismatch as REVIEW", () => {
      expect(auditShape(["twin", "directional-twin"], "twin").status).toBe(
        "PASS",
      );
      expect(auditShape(["twin"], "directional").status).toBe("REVIEW");
    });

    it("always keeps support profile NOT_OBSERVABLE", () => {
      const check = auditSupportProfile(["balanced"]);

      expect(check.status).toBe("NOT_OBSERVABLE");
      expect(check.actual).toBeNull();
      expect(check.priority).toBe("P3-observability");
    });
  });

  describe("pairwise rule logic", () => {
    const evaluate = (
      rule: GoldenRecommendationInvariantRule,
      right: GoldenObservableActual,
    ) => auditInvariantRule(rule, baseActual, right);

    it("covers both length directions", () => {
      expect(
        evaluate("length_not_shorter", {
          ...baseActual,
          lengthRange: { min: 153, max: 159 },
        }).status,
      ).toBe("PASS");
      expect(
        evaluate("length_not_shorter", {
          ...baseActual,
          lengthRange: { min: 151, max: 159 },
        }).status,
      ).toBe("FAIL");
      expect(
        evaluate("length_not_longer", {
          ...baseActual,
          lengthRange: { min: 151, max: 157 },
        }).status,
      ).toBe("PASS");
      expect(
        evaluate("length_not_longer", {
          ...baseActual,
          lengthRange: { min: 153, max: 157 },
        }).status,
      ).toBe("FAIL");
    });

    it("covers waist, width and boot-drag monotonicity", () => {
      expect(
        evaluate("waist_not_narrower", {
          ...baseActual,
          targetWaistWidthMm: 251,
        }).status,
      ).toBe("PASS");
      expect(
        evaluate("waist_not_narrower", {
          ...baseActual,
          targetWaistWidthMm: 249,
        }).status,
      ).toBe("FAIL");
      expect(
        evaluate("width_not_narrower", {
          ...baseActual,
          recommendedWidthType: "mid-wide",
        }).status,
      ).toBe("PASS");
      expect(
        auditInvariantRule(
          "width_not_narrower",
          { ...baseActual, recommendedWidthType: "wide" },
          baseActual,
        ).status,
      ).toBe("FAIL");
      expect(
        evaluate("boot_drag_not_lower", {
          ...baseActual,
          bootDragRisk: "medium",
        }).status,
      ).toBe("PASS");
      expect(
        auditInvariantRule(
          "boot_drag_not_lower",
          { ...baseActual, bootDragRisk: "medium" },
          baseActual,
        ).status,
      ).toBe("FAIL");
    });

    it("requires exact observable equality for physical-fit invariance", () => {
      expect(evaluate("same_physical_fit_expectation", baseActual).status).toBe(
        "PASS",
      );

      const changed = evaluate("same_physical_fit_expectation", {
        ...baseActual,
        primaryShape: "directional",
      });
      expect(changed.status).toBe("FAIL");
      expect(changed.differingFields).toEqual(["primaryShape"]);
      expect(changed.priority).toBe("P2-profile");
    });

    it("keeps support stability NOT_OBSERVABLE", () => {
      expect(evaluate("support_not_less_stable", baseActual)).toMatchObject({
        status: "NOT_OBSERVABLE",
        priority: "P3-observability",
      });
    });
  });

  it("derives reconciled summary counts from detailed results", () => {
    const { summary } = currentGoldenAudit;

    expect(
      summary.absoluteCases.pass +
        summary.absoluteCases.review +
        summary.absoluteCases.fail,
    ).toBe(summary.absoluteCases.total);
    expect(summary.absoluteCases.total).toBe(36);

    expect(
      summary.observableChecks.pass +
        summary.observableChecks.review +
        summary.observableChecks.fail,
    ).toBe(summary.observableChecks.total);
    expect(summary.observableChecks.total).toBe(36 * 5);
    for (const counts of Object.values(summary.observableChecks.byDimension)) {
      expect(counts.pass + counts.review + counts.fail).toBe(counts.total);
      expect(counts.total).toBe(36);
    }

    expect(
      summary.invariants.pass +
        summary.invariants.fail +
        summary.invariants.notObservable,
    ).toBe(summary.invariants.total);
    expect(summary.invariants.total).toBe(12);

    expect(Object.values(summary.failureBreakdown).reduce((a, b) => a + b, 0)).toBe(
      currentGoldenAudit.failures.length,
    );
    expect(Object.values(summary.reviewBreakdown).reduce((a, b) => a + b, 0)).toBe(
      currentGoldenAudit.reviews.length,
    );
    expect(summary.notObservableChecks).toBe(
      currentGoldenAudit.unobservable.length,
    );
    expect(Object.values(summary.priorityBreakdown).reduce((a, b) => a + b, 0)).toBe(
      currentGoldenAudit.failures.length +
        currentGoldenAudit.reviews.length +
        currentGoldenAudit.unobservable.length,
    );
  });

  it("keeps the checked-in evidence document equal to the structured audit", () => {
    const documentUrl = new URL(
      "../../../docs/recommendation-engine-audit-v1.6.0.md",
      import.meta.url,
    );
    const checkedInDocument = readFileSync(documentUrl, "utf8");

    expect(normalizeMarkdown(checkedInDocument)).toBe(
      normalizeMarkdown(renderGoldenAuditMarkdown(currentGoldenAudit)),
    );
  });
});

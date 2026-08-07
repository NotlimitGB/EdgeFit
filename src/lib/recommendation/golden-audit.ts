import type {
  BoardShape,
  BootDragRisk,
  QuizInput,
  WidthType,
} from "@/types/domain";
import { ALGORITHM_VERSION, getRecommendation } from "./engine";
import {
  goldenRecommendationCases,
  goldenRecommendationInvariants,
  type GoldenRecommendationCase,
  type GoldenRecommendationInvariant,
  type GoldenRecommendationInvariantRule,
} from "./golden-dataset";

export type GoldenAuditStatus = "PASS" | "REVIEW" | "FAIL" | "NOT_OBSERVABLE";

export type GoldenAuditPriority =
  | "P0-safety"
  | "P1-fit"
  | "P2-profile"
  | "P3-observability";

export type GoldenAuditDimension =
  | "length"
  | "width"
  | "waist"
  | "bootDrag"
  | "shape"
  | "supportProfile";

export interface GoldenAuditCheck<Expected = unknown, Actual = unknown> {
  readonly status: GoldenAuditStatus;
  readonly expected: Expected;
  readonly actual: Actual;
  readonly reason: string;
  readonly priority: GoldenAuditPriority | null;
}

export interface GoldenObservableActual {
  readonly lengthRange: { readonly min: number; readonly max: number };
  readonly recommendedWidthType: WidthType;
  readonly targetWaistWidthMm: number;
  readonly bootDragRisk: BootDragRisk;
  readonly primaryShape: BoardShape;
}

export interface GoldenCaseAuditResult {
  readonly caseId: string;
  readonly title: string;
  readonly category: GoldenRecommendationCase["category"];
  readonly input: QuizInput;
  readonly algorithmVersion: string;
  readonly actual: GoldenObservableActual;
  readonly checks: {
    readonly length: GoldenAuditCheck;
    readonly width: GoldenAuditCheck;
    readonly waist: GoldenAuditCheck;
    readonly bootDrag: GoldenAuditCheck;
    readonly shape: GoldenAuditCheck;
    readonly supportProfile: GoldenAuditCheck;
  };
  readonly overallStatus: Exclude<GoldenAuditStatus, "NOT_OBSERVABLE">;
  readonly hasUnobservableChecks: boolean;
}

export interface GoldenInvariantAuditResult {
  readonly invariantId: string;
  readonly rule: GoldenRecommendationInvariantRule;
  readonly leftCaseId: string;
  readonly rightCaseId: string;
  readonly status: GoldenAuditStatus;
  readonly actualLeft: GoldenObservableActual;
  readonly actualRight: GoldenObservableActual;
  readonly reason: string;
  readonly priority: GoldenAuditPriority | null;
  readonly differingFields: readonly (keyof GoldenObservableActual)[];
  readonly supportComponent: GoldenAuditCheck | null;
}

export interface GoldenAuditIssue {
  readonly source: "case" | "invariant";
  readonly id: string;
  readonly dimension: GoldenAuditDimension | GoldenRecommendationInvariantRule;
  readonly status: Exclude<GoldenAuditStatus, "PASS">;
  readonly priority: GoldenAuditPriority;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly reason: string;
}

interface StatusCounts {
  readonly total: number;
  readonly pass: number;
  readonly review: number;
  readonly fail: number;
}

interface InvariantStatusCounts {
  readonly total: number;
  readonly pass: number;
  readonly fail: number;
  readonly notObservable: number;
}

interface CheckStatusCounts {
  readonly total: number;
  readonly pass: number;
  readonly review: number;
  readonly fail: number;
}

export interface GoldenAuditSummary {
  readonly overallObservableStatus: Exclude<GoldenAuditStatus, "NOT_OBSERVABLE">;
  readonly absoluteCases: StatusCounts;
  readonly observableChecks: CheckStatusCounts & {
    readonly byDimension: Readonly<
      Record<Exclude<GoldenAuditDimension, "supportProfile">, CheckStatusCounts>
    >;
  };
  readonly notObservableChecks: number;
  readonly invariants: InvariantStatusCounts;
  readonly failureBreakdown: Readonly<
    Record<Exclude<GoldenAuditDimension, "supportProfile"> | "invariants", number>
  >;
  readonly reviewBreakdown: Readonly<
    Record<Exclude<GoldenAuditDimension, "supportProfile">, number>
  >;
  readonly priorityBreakdown: Readonly<Record<GoldenAuditPriority, number>>;
}

export interface GoldenRecommendationAudit {
  readonly algorithmVersion: string;
  readonly absoluteResults: readonly GoldenCaseAuditResult[];
  readonly invariantResults: readonly GoldenInvariantAuditResult[];
  readonly failures: readonly GoldenAuditIssue[];
  readonly reviews: readonly GoldenAuditIssue[];
  readonly unobservable: readonly GoldenAuditIssue[];
  readonly summary: GoldenAuditSummary;
}

const widthRank: Readonly<Record<WidthType, number>> = {
  regular: 0,
  "mid-wide": 1,
  wide: 2,
};

const bootDragRank: Readonly<Record<BootDragRisk, number>> = {
  low: 0,
  medium: 1,
  high: 2,
};

const observableDimensions = [
  "length",
  "width",
  "waist",
  "bootDrag",
  "shape",
] as const;

function pass<Expected, Actual>(
  expected: Expected,
  actual: Actual,
  reason: string,
): GoldenAuditCheck<Expected, Actual> {
  return { status: "PASS", expected, actual, reason, priority: null };
}

function nonPass<Expected, Actual>(
  status: "REVIEW" | "FAIL" | "NOT_OBSERVABLE",
  priority: GoldenAuditPriority,
  expected: Expected,
  actual: Actual,
  reason: string,
): GoldenAuditCheck<Expected, Actual> {
  return { status, expected, actual, reason, priority };
}

export function auditLength(
  expected: GoldenRecommendationCase["expectation"]["length"],
  actual: GoldenObservableActual["lengthRange"],
): GoldenAuditCheck {
  const below = actual.min < expected.saneMinCm;
  const above = actual.max > expected.saneMaxCm;

  if (!below && !above) {
    return pass(expected, actual, "The complete engine length range is inside the golden envelope.");
  }

  const direction = below && above ? "below and above" : below ? "below" : "above";
  return nonPass(
    "REVIEW",
    "P1-fit",
    expected,
    actual,
    `The engine length range extends ${direction} the manufacturer-agnostic golden envelope.`,
  );
}

export function auditWidth(
  expected: readonly WidthType[],
  actual: WidthType,
): GoldenAuditCheck {
  if (expected.includes(actual)) {
    return pass(expected, actual, "The recommended width category is explicitly allowed.");
  }

  const minimumAllowedRank = Math.min(...expected.map((value) => widthRank[value]));
  if (widthRank[actual] < minimumAllowedRank) {
    return nonPass(
      "FAIL",
      "P0-safety",
      expected,
      actual,
      "The engine recommends a narrower width category than every golden-allowed category.",
    );
  }

  return nonPass(
    "REVIEW",
    "P2-profile",
    expected,
    actual,
    "The engine recommends a wider category than every golden-allowed category.",
  );
}

export function auditWaist(
  expected: GoldenRecommendationCase["expectation"]["targetWaistWidthMm"],
  actual: number,
): GoldenAuditCheck {
  if (actual < expected.min) {
    return nonPass(
      "FAIL",
      "P0-safety",
      expected,
      actual,
      "The target waist is below the golden minimum and may provide insufficient width safety buffer.",
    );
  }

  if (actual > expected.max) {
    return nonPass(
      "REVIEW",
      "P2-profile",
      expected,
      actual,
      "The target waist is above the golden maximum and may be unnecessarily wide.",
    );
  }

  return pass(expected, actual, "The target waist is inside the golden interval.");
}

export function auditBootDrag(
  expected: readonly BootDragRisk[],
  actual: BootDragRisk,
): GoldenAuditCheck {
  if (expected.includes(actual)) {
    return pass(expected, actual, "The boot-drag risk is explicitly allowed.");
  }

  const minimumAllowedRank = Math.min(
    ...expected.map((value) => bootDragRank[value]),
  );
  if (bootDragRank[actual] < minimumAllowedRank) {
    return nonPass(
      "FAIL",
      "P0-safety",
      expected,
      actual,
      "The engine reports less boot-drag concern than every golden-allowed risk level.",
    );
  }

  return nonPass(
    "REVIEW",
    "P2-profile",
    expected,
    actual,
    "The engine reports more boot-drag concern than every golden-allowed risk level.",
  );
}

export function auditShape(
  expected: readonly BoardShape[],
  actual: BoardShape,
): GoldenAuditCheck {
  if (expected.includes(actual)) {
    return pass(expected, actual, "The primary shape is explicitly allowed.");
  }

  return nonPass(
    "REVIEW",
    "P2-profile",
    expected,
    actual,
    "The primary shape is outside the allowed contextual shape set.",
  );
}

export function auditSupportProfile(
  expected: GoldenRecommendationCase["expectation"]["supportProfilesAllowed"],
): GoldenAuditCheck {
  return nonPass(
    "NOT_OBSERVABLE",
    "P3-observability",
    expected,
    null,
    "RecommendationResult does not expose an independent rider-level support profile. Task005 must not infer one from input values or catalog products.",
  );
}

function getOverallStatus(
  checks: readonly GoldenAuditCheck[],
): Exclude<GoldenAuditStatus, "NOT_OBSERVABLE"> {
  if (checks.some(({ status }) => status === "FAIL")) return "FAIL";
  if (checks.some(({ status }) => status === "REVIEW")) return "REVIEW";
  return "PASS";
}

function auditCase(goldenCase: GoldenRecommendationCase): GoldenCaseAuditResult {
  const input = { ...goldenCase.input };
  const result = getRecommendation(input, []);
  const actual: GoldenObservableActual = {
    lengthRange: { ...result.lengthRange },
    recommendedWidthType: result.recommendedWidthType,
    targetWaistWidthMm: result.targetWaistWidthMm,
    bootDragRisk: result.bootDragRisk,
    primaryShape: result.shapeProfile.primary,
  };
  const checks = {
    length: auditLength(goldenCase.expectation.length, actual.lengthRange),
    width: auditWidth(
      goldenCase.expectation.widthTypesAllowed,
      actual.recommendedWidthType,
    ),
    waist: auditWaist(
      goldenCase.expectation.targetWaistWidthMm,
      actual.targetWaistWidthMm,
    ),
    bootDrag: auditBootDrag(
      goldenCase.expectation.bootDragRisksAllowed,
      actual.bootDragRisk,
    ),
    shape: auditShape(
      goldenCase.expectation.primaryShapesAllowed,
      actual.primaryShape,
    ),
    supportProfile: auditSupportProfile(
      goldenCase.expectation.supportProfilesAllowed,
    ),
  };

  return {
    caseId: goldenCase.id,
    title: goldenCase.title,
    category: goldenCase.category,
    input,
    algorithmVersion: result.algorithmVersion,
    actual,
    checks,
    overallStatus: getOverallStatus(observableDimensions.map((key) => checks[key])),
    hasUnobservableChecks: true,
  };
}

export interface GoldenInvariantRuleEvaluation {
  readonly status: GoldenAuditStatus;
  readonly reason: string;
  readonly priority: GoldenAuditPriority | null;
  readonly differingFields: readonly (keyof GoldenObservableActual)[];
}

function equalLengthRange(
  left: GoldenObservableActual["lengthRange"],
  right: GoldenObservableActual["lengthRange"],
) {
  return left.min === right.min && left.max === right.max;
}

export function auditInvariantRule(
  rule: GoldenRecommendationInvariantRule,
  left: GoldenObservableActual,
  right: GoldenObservableActual,
): GoldenInvariantRuleEvaluation {
  if (rule === "support_not_less_stable") {
    return {
      status: "NOT_OBSERVABLE",
      reason:
        "RecommendationResult does not expose an independent rider-level support profile, so support stability cannot be compared.",
      priority: "P3-observability",
      differingFields: [],
    };
  }

  if (rule === "same_physical_fit_expectation") {
    const differingFields: (keyof GoldenObservableActual)[] = [];
    if (!equalLengthRange(left.lengthRange, right.lengthRange)) {
      differingFields.push("lengthRange");
    }
    if (left.recommendedWidthType !== right.recommendedWidthType) {
      differingFields.push("recommendedWidthType");
    }
    if (left.targetWaistWidthMm !== right.targetWaistWidthMm) {
      differingFields.push("targetWaistWidthMm");
    }
    if (left.bootDragRisk !== right.bootDragRisk) {
      differingFields.push("bootDragRisk");
    }
    if (left.primaryShape !== right.primaryShape) {
      differingFields.push("primaryShape");
    }

    if (differingFields.length === 0) {
      return {
        status: "PASS",
        reason: "All observable rider-physics fields are exactly equal.",
        priority: null,
        differingFields,
      };
    }

    const hasSafetyDifference = differingFields.some((field) =>
      ["recommendedWidthType", "targetWaistWidthMm", "bootDragRisk"].includes(
        field,
      ),
    );
    const priority: GoldenAuditPriority = hasSafetyDifference
      ? "P0-safety"
      : differingFields.includes("lengthRange")
        ? "P1-fit"
        : "P2-profile";
    return {
      status: "FAIL",
      reason: `Board-line preference changed observable physical fit fields: ${differingFields.join(", ")}.`,
      priority,
      differingFields,
    };
  }

  let holds = false;
  switch (rule) {
    case "length_not_shorter":
      holds =
        right.lengthRange.min >= left.lengthRange.min &&
        right.lengthRange.max >= left.lengthRange.max;
      break;
    case "length_not_longer":
      holds =
        right.lengthRange.min <= left.lengthRange.min &&
        right.lengthRange.max <= left.lengthRange.max;
      break;
    case "waist_not_narrower":
      holds = right.targetWaistWidthMm >= left.targetWaistWidthMm;
      break;
    case "width_not_narrower":
      holds =
        widthRank[right.recommendedWidthType] >=
        widthRank[left.recommendedWidthType];
      break;
    case "boot_drag_not_lower":
      holds =
        bootDragRank[right.bootDragRisk] >= bootDragRank[left.bootDragRisk];
      break;
  }

  const priority: GoldenAuditPriority =
    rule === "length_not_shorter" || rule === "length_not_longer"
      ? "P1-fit"
      : "P0-safety";
  return {
    status: holds ? "PASS" : "FAIL",
    reason: holds
      ? `The actual outputs satisfy ${rule}.`
      : `The actual outputs violate ${rule}.`,
    priority: holds ? null : priority,
    differingFields: [],
  };
}

function auditInvariant(
  invariant: GoldenRecommendationInvariant,
  resultsById: ReadonlyMap<string, GoldenCaseAuditResult>,
  casesById: ReadonlyMap<string, GoldenRecommendationCase>,
): GoldenInvariantAuditResult {
  const left = resultsById.get(invariant.leftCaseId);
  const right = resultsById.get(invariant.rightCaseId);
  const leftGolden = casesById.get(invariant.leftCaseId);
  const rightGolden = casesById.get(invariant.rightCaseId);
  if (!left || !right || !leftGolden || !rightGolden) {
    throw new Error(`Invariant ${invariant.id} references an unknown golden case.`);
  }

  const evaluation = auditInvariantRule(invariant.rule, left.actual, right.actual);
  const supportComponent =
    invariant.rule === "same_physical_fit_expectation"
      ? nonPass(
          "NOT_OBSERVABLE",
          "P3-observability",
          {
            left: leftGolden.expectation.supportProfilesAllowed,
            right: rightGolden.expectation.supportProfilesAllowed,
          },
          null,
          "The support-profile component of physical fit is not exposed by RecommendationResult.",
        )
      : null;

  return {
    invariantId: invariant.id,
    rule: invariant.rule,
    leftCaseId: invariant.leftCaseId,
    rightCaseId: invariant.rightCaseId,
    status: evaluation.status,
    actualLeft: left.actual,
    actualRight: right.actual,
    reason: evaluation.reason,
    priority: evaluation.priority,
    differingFields: evaluation.differingFields,
    supportComponent,
  };
}

function issueFromCheck(
  result: GoldenCaseAuditResult,
  dimension: GoldenAuditDimension,
  check: GoldenAuditCheck,
): GoldenAuditIssue | null {
  if (check.status === "PASS" || !check.priority) return null;
  return {
    source: "case",
    id: result.caseId,
    dimension,
    status: check.status,
    priority: check.priority,
    expected: check.expected,
    actual: check.actual,
    reason: check.reason,
  };
}

function countChecks(
  results: readonly GoldenCaseAuditResult[],
  dimension: Exclude<GoldenAuditDimension, "supportProfile">,
): CheckStatusCounts {
  const checks = results.map((result) => result.checks[dimension]);
  return {
    total: checks.length,
    pass: checks.filter(({ status }) => status === "PASS").length,
    review: checks.filter(({ status }) => status === "REVIEW").length,
    fail: checks.filter(({ status }) => status === "FAIL").length,
  };
}

function buildSummary(
  absoluteResults: readonly GoldenCaseAuditResult[],
  invariantResults: readonly GoldenInvariantAuditResult[],
  failures: readonly GoldenAuditIssue[],
  reviews: readonly GoldenAuditIssue[],
  unobservable: readonly GoldenAuditIssue[],
): GoldenAuditSummary {
  const byDimension = Object.fromEntries(
    observableDimensions.map((dimension) => [
      dimension,
      countChecks(absoluteResults, dimension),
    ]),
  ) as Record<Exclude<GoldenAuditDimension, "supportProfile">, CheckStatusCounts>;
  const observableCounts = Object.values(byDimension).reduce(
    (totals, counts) => ({
      total: totals.total + counts.total,
      pass: totals.pass + counts.pass,
      review: totals.review + counts.review,
      fail: totals.fail + counts.fail,
    }),
    { total: 0, pass: 0, review: 0, fail: 0 },
  );
  const priorities: GoldenAuditPriority[] = [
    "P0-safety",
    "P1-fit",
    "P2-profile",
    "P3-observability",
  ];
  const allIssues = [...failures, ...reviews, ...unobservable];

  return {
    overallObservableStatus:
      failures.length > 0 ? "FAIL" : reviews.length > 0 ? "REVIEW" : "PASS",
    absoluteCases: {
      total: absoluteResults.length,
      pass: absoluteResults.filter(({ overallStatus }) => overallStatus === "PASS")
        .length,
      review: absoluteResults.filter(
        ({ overallStatus }) => overallStatus === "REVIEW",
      ).length,
      fail: absoluteResults.filter(({ overallStatus }) => overallStatus === "FAIL")
        .length,
    },
    observableChecks: { ...observableCounts, byDimension },
    notObservableChecks: unobservable.length,
    invariants: {
      total: invariantResults.length,
      pass: invariantResults.filter(({ status }) => status === "PASS").length,
      fail: invariantResults.filter(({ status }) => status === "FAIL").length,
      notObservable: invariantResults.filter(
        ({ status }) => status === "NOT_OBSERVABLE",
      ).length,
    },
    failureBreakdown: {
      length: failures.filter(
        ({ source, dimension }) => source === "case" && dimension === "length",
      ).length,
      width: failures.filter(
        ({ source, dimension }) => source === "case" && dimension === "width",
      ).length,
      waist: failures.filter(
        ({ source, dimension }) => source === "case" && dimension === "waist",
      ).length,
      bootDrag: failures.filter(
        ({ source, dimension }) => source === "case" && dimension === "bootDrag",
      ).length,
      shape: failures.filter(
        ({ source, dimension }) => source === "case" && dimension === "shape",
      ).length,
      invariants: failures.filter(({ source }) => source === "invariant").length,
    },
    reviewBreakdown: {
      length: reviews.filter(({ dimension }) => dimension === "length").length,
      width: reviews.filter(({ dimension }) => dimension === "width").length,
      waist: reviews.filter(({ dimension }) => dimension === "waist").length,
      bootDrag: reviews.filter(({ dimension }) => dimension === "bootDrag").length,
      shape: reviews.filter(({ dimension }) => dimension === "shape").length,
    },
    priorityBreakdown: Object.fromEntries(
      priorities.map((priority) => [
        priority,
        allIssues.filter((issue) => issue.priority === priority).length,
      ]),
    ) as Record<GoldenAuditPriority, number>,
  };
}

export function runGoldenRecommendationAudit(): GoldenRecommendationAudit {
  const absoluteResults = goldenRecommendationCases.map(auditCase);
  const resultsById = new Map(
    absoluteResults.map((result) => [result.caseId, result]),
  );
  const casesById = new Map(
    goldenRecommendationCases.map((goldenCase) => [goldenCase.id, goldenCase]),
  );
  const invariantResults = goldenRecommendationInvariants.map((invariant) =>
    auditInvariant(invariant, resultsById, casesById),
  );
  const issues = absoluteResults.flatMap((result) =>
    ([...observableDimensions, "supportProfile"] as const)
      .map((dimension) =>
        issueFromCheck(result, dimension, result.checks[dimension]),
      )
      .filter((issue): issue is GoldenAuditIssue => issue !== null),
  );

  for (const result of invariantResults) {
    if (result.status !== "PASS" && result.priority) {
      issues.push({
        source: "invariant",
        id: result.invariantId,
        dimension: result.rule,
        status: result.status,
        priority: result.priority,
        expected: result.rule,
        actual: { left: result.actualLeft, right: result.actualRight },
        reason: result.reason,
      });
    }
    if (result.supportComponent?.priority) {
      issues.push({
        source: "invariant",
        id: result.invariantId,
        dimension: "supportProfile",
        status: "NOT_OBSERVABLE",
        priority: result.supportComponent.priority,
        expected: result.supportComponent.expected,
        actual: result.supportComponent.actual,
        reason: result.supportComponent.reason,
      });
    }
  }

  const failures = issues.filter(({ status }) => status === "FAIL");
  const reviews = issues.filter(({ status }) => status === "REVIEW");
  const unobservable = issues.filter(
    ({ status }) => status === "NOT_OBSERVABLE",
  );

  return {
    algorithmVersion: ALGORITHM_VERSION,
    absoluteResults,
    invariantResults,
    failures,
    reviews,
    unobservable,
    summary: buildSummary(
      absoluteResults,
      invariantResults,
      failures,
      reviews,
      unobservable,
    ),
  };
}

function formatValue(value: unknown) {
  return `\`${JSON.stringify(value)}\``;
}

function issueTable(issues: readonly GoldenAuditIssue[]) {
  if (issues.length === 0) return "No issues recorded.";
  return [
    "| ID | Dimension | Priority | Expected | Actual | Reason |",
    "| --- | --- | --- | --- | --- | --- |",
    ...issues.map(
      (issue) =>
        `| ${issue.id} | ${issue.dimension} | ${issue.priority} | ${formatValue(issue.expected)} | ${formatValue(issue.actual)} | ${issue.reason} |`,
    ),
  ].join("\n");
}

function candidateScope(audit: GoldenRecommendationAudit) {
  const candidates: string[] = [];
  const { failureBreakdown, reviewBreakdown } = audit.summary;
  if (
    failureBreakdown.width +
      failureBreakdown.waist +
      failureBreakdown.bootDrag >
      0 ||
    reviewBreakdown.width + reviewBreakdown.waist + reviewBreakdown.bootDrag > 0
  ) {
    candidates.push(
      "Review waist-width and boot-drag calibration at small-boot and large-boot extremes, preserving model-independent width categories.",
    );
  }
  if (failureBreakdown.length > 0 || reviewBreakdown.length > 0) {
    candidates.push("Review length-range adjustments against the affected rider archetypes.");
  }
  if (failureBreakdown.shape > 0 || reviewBreakdown.shape > 0) {
    candidates.push("Review primary shape direction for the affected intent profiles.");
  }
  if (failureBreakdown.invariants > 0) {
    candidates.push("Review only the production rules implicated by failed pairwise invariants.");
  }
  return candidates.length > 0
    ? candidates.map((candidate) => `- ${candidate}`).join("\n")
    : "- No evidence-backed production correction area was identified.";
}

export function renderGoldenAuditMarkdown(audit: GoldenRecommendationAudit) {
  const { summary } = audit;
  const absoluteFailures = audit.failures.filter(({ source }) => source === "case");
  const absoluteReviews = audit.reviews.filter(({ source }) => source === "case");
  const invariantRows = audit.invariantResults.map(
    (result) =>
      `| ${result.invariantId} | ${result.rule} | ${result.leftCaseId} | ${result.rightCaseId} | ${result.status} | ${result.reason} |`,
  );

  return `# Recommendation Engine Audit v1.6.0

## 1. Executive summary

- Algorithm version: \`${audit.algorithmVersion}\`
- Golden rider cases: ${summary.absoluteCases.total}
- Pairwise invariants: ${summary.invariants.total}
- Overall observable result: **${summary.overallObservableStatus}**

The audit evaluates rider-fit output with an empty catalog. Product ranking, availability and catalog readiness are not involved.

## 2. Status counts

| Status | Absolute cases | Observable checks | Invariants |
| --- | ---: | ---: | ---: |
| PASS | ${summary.absoluteCases.pass} | ${summary.observableChecks.pass} | ${summary.invariants.pass} |
| REVIEW | ${summary.absoluteCases.review} | ${summary.observableChecks.review} | 0 |
| FAIL | ${summary.absoluteCases.fail} | ${summary.observableChecks.fail} | ${summary.invariants.fail} |
| NOT_OBSERVABLE | 0 | 0 | ${summary.invariants.notObservable} |

Total unobservable check-level gaps, including support components: ${summary.notObservableChecks}.

## 3. Absolute failures

${issueTable(absoluteFailures)}

## 4. Absolute reviews

${issueTable(absoluteReviews)}

## 5. Pairwise invariant results

| Invariant | Rule | Left case | Right case | Status | Reason |
| --- | --- | --- | --- | --- | --- |
${invariantRows.join("\n")}

## 6. Observability gaps

Production \`RecommendationResult\` does not expose an independent rider-level support profile. The audit therefore records support-profile expectations as \`NOT_OBSERVABLE\` and does not infer them from skill, aggressiveness, riding style, golden expectations or catalog products.

This includes support checks for all ${summary.absoluteCases.total} absolute cases, the dedicated support invariant, and the support component of both board-line physical-fit invariants.

## 7. Interpretation

A benchmark disagreement does not by itself authorize changing production logic.

\`FAIL\` identifies a clear safety or directional contradiction and is a strong candidate for focused review. \`REVIEW\` identifies a model-dependent or profile trade-off that needs human/domain analysis. Passing all observable checks does not validate the unobservable support dimension.

## 8. Candidate Task006 scope

${candidateScope(audit)}

These are evidence-backed candidate areas only. Task005 does not prescribe or implement production changes.
`;
}

export const currentGoldenAudit = runGoldenRecommendationAudit();

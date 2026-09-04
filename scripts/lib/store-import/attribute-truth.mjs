const RIDING_STYLE_ORDER = ["all-mountain", "park", "freeride"];
const SKILL_LEVEL_ORDER = ["beginner", "intermediate", "advanced"];
const BOARD_LINES = new Set(["men", "women", "unisex"]);
const SHAPES = new Set([
  "twin",
  "asym-twin",
  "directional-twin",
  "directional",
  "tapered-directional",
]);
const CAMBERS = new Set([
  "camber",
  "rocker",
  "flat",
  "hybrid-camber",
  "hybrid-rocker",
]);
const WIDTH_TYPES = new Set(["regular", "mid-wide", "wide"]);
const EVIDENCE_KEYS = new Set([
  "state",
  "provenance",
  "method",
  "sourceName",
  "sourceUrl",
  "observedAt",
  "sourceField",
  "sourceScaleMax",
  "normalizationRule",
]);
const PRODUCT_TRUTH_KEYS = new Set([
  "truthModelVersion",
  "ridingStyles",
  "skillApplicability",
  "boardLine",
  "flex",
  "shapeType",
  "camberProfile",
  "attributeEvidence",
]);
const SIZE_TRUTH_KEYS = new Set([
  "truthModelVersion",
  "waistWidthMm",
  "widthType",
  "attributeEvidence",
]);
const PROVENANCES = new Set(["manual", "official", "merchant", "legacy"]);
const METHODS = new Set(["explicit", "normalized", "derived", "manual-override", "legacy-unverified"]);

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/\s+/gu, " ")
    .trim();
}

function boundedText(value, max = 200) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, max) : null;
}

function boundedUrl(value) {
  const normalized = boundedText(value, 2048);
  if (!normalized) return null;
  try {
    return new URL(normalized).toString();
  } catch {
    return null;
  }
}

export function createAttributeEvidence(
  context,
  { state, method = null, provenance = "merchant", normalizationRule = null } = {},
) {
  return {
    state,
    provenance,
    method,
    sourceName: boundedText(context?.sourceName),
    sourceUrl: boundedUrl(context?.sourceUrl),
    observedAt: boundedText(context?.observedAt, 64),
    sourceField: boundedText(context?.sourceField),
    sourceScaleMax:
      Number.isFinite(context?.sourceScaleMax) && context.sourceScaleMax > 0
        ? context.sourceScaleMax
        : null,
    normalizationRule: boundedText(normalizationRule),
  };
}

function resolution(value, evidence, extras = {}) {
  return { value, evidence, ...extras };
}

function unknown(context, reason) {
  return resolution(
    null,
    createAttributeEvidence(context, { state: "unknown" }),
    { reason },
  );
}

export function unknownTruth(context = {}, reason = "missing") {
  return unknown(context, reason);
}

function ambiguous(context, candidates, reason = "conflicting_values") {
  return resolution(
    null,
    createAttributeEvidence(context, { state: "ambiguous" }),
    { reason, candidates },
  );
}

export function knownTruth(value, context, options = {}) {
  return resolution(
    value,
    createAttributeEvidence(context, {
      state: "known",
      method: options.method ?? "explicit",
      provenance: options.provenance ?? "merchant",
      normalizationRule: options.normalizationRule ?? null,
    }),
  );
}

export function resolveRidingStylesTruth(value, context = {}) {
  const text = normalizeText(value);
  if (!text) return unknown(context, "missing");

  const selected = new Set();
  if (/all[\s-]*mountain/u.test(text) || /универсальн/u.test(text)) {
    selected.add("all-mountain");
  }
  if (/\b(?:park|freestyle)\b/u.test(text) || /фристайл|парк\s*джиб/u.test(text)) {
    selected.add("park");
  }
  if (/\b(?:freeride|pow|powder)\b/u.test(text) || /фрирайд/u.test(text)) {
    selected.add("freeride");
  }

  const styles = RIDING_STYLE_ORDER.filter((style) => selected.has(style));
  if (styles.length === 0) return unknown(context, "unrecognized");
  const explicitCanonical = styles.length === 1 && text === styles[0];
  return knownTruth(styles, context, {
    method: explicitCanonical ? "explicit" : "normalized",
    normalizationRule: explicitCanonical ? null : "riding-style-v1",
  });
}

export function resolveSkillApplicabilityTruth(value, context = {}) {
  const text = normalizeText(value);
  if (!text) return unknown(context, "missing");

  const selected = new Set();
  if (
    /beginner|начина/u.test(text) ||
    /(?:^|[^\p{L}\p{N}_])новичок(?=$|[^\p{L}\p{N}_])/u.test(text)
  ) selected.add("beginner");
  if (/intermediate|продвин/u.test(text)) selected.add("intermediate");
  if (/advanced|expert|эксперт/u.test(text)) selected.add("advanced");
  if (/all\s*levels?|любо(?:й|го)\s+уров/u.test(text)) {
    selected.add("beginner");
    selected.add("advanced");
  }
  const levels = SKILL_LEVEL_ORDER.filter((level) => selected.has(level));
  if (levels.length === 0) return unknown(context, "unrecognized");
  return knownTruth(
    { min: levels[0], max: levels.at(-1) },
    context,
    { method: "normalized", normalizationRule: "skill-range-v1" },
  );
}

export function resolveFlexTruth(value, context = {}) {
  const text = normalizeText(value).replaceAll(",", ".");
  if (!text) return unknown(context, "missing");

  const rangeMatch = text.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)(?:\s|$)/u);
  if (rangeMatch) {
    return ambiguous(context, [Number(rangeMatch[1]), Number(rangeMatch[2])], "range");
  }

  const categoryMatches = [
    /soft|мяг/u.test(text) ? 3 : null,
    /medium|сред/u.test(text) ? 5 : null,
    /hard|stiff|жест/u.test(text) ? 8 : null,
  ].filter((item) => item != null);
  if (categoryMatches.length > 1) {
    return ambiguous(context, categoryMatches, "conflicting_categories");
  }

  const numericMatch = text.match(/^([+-]?\d+(?:\.\d+)?)(?:\s*(?:\/|из)\s*10)?$/u);
  if (numericMatch) {
    const numeric = Number(numericMatch[1]);
    if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 10) {
      return knownTruth(numeric, { ...context, sourceScaleMax: 10 });
    }
    return unknown(context, "out_of_range");
  }

  if (categoryMatches.length === 1) {
    return knownTruth(categoryMatches[0], { ...context, sourceScaleMax: 10 }, {
      method: "normalized",
      normalizationRule: "flex-text-v1",
    });
  }
  return unknown(context, "unrecognized");
}

export function resolveBoardLineTruth(value, context = {}) {
  const text = normalizeText(value);
  if (!text) return unknown(context, "missing");

  const candidates = [
    /\b(?:men|mens|male)\b/u.test(text) || /мужск|мужчин/u.test(text)
      ? "men"
      : null,
    /\b(?:women|womens|female)\b/u.test(text) || /женск|женщин|девоч/u.test(text)
      ? "women"
      : null,
    /\bunisex\b/u.test(text) || /унисекс/u.test(text) ? "unisex" : null,
  ].filter(Boolean);

  if (candidates.length > 1) {
    return ambiguous(context, candidates, "conflicting_values");
  }
  if (candidates.length === 1) {
    const boardLine = candidates[0];
    const explicitCanonical = text === boardLine;
    return knownTruth(boardLine, context, {
      method: explicitCanonical ? "explicit" : "normalized",
      normalizationRule: explicitCanonical ? null : "board-line-v1",
    });
  }
  return unknown(context, /kids?|junior|youth|детск|юниор/u.test(text) ? "unsupported_audience" : "unrecognized");
}

export function resolveShapeTruth(value, context = {}, correctedValue = null) {
  if (correctedValue != null) {
    return knownTruth(correctedValue, context, { provenance: "manual", method: "manual-override" });
  }
  const text = normalizeText(value);
  if (!text) return unknown(context, "missing");
  let shape = null;
  if (/asym/u.test(text)) shape = "asym-twin";
  else if (/directional\s*twin/u.test(text) || (/направлен/u.test(text) && /твин/u.test(text))) shape = "directional-twin";
  else if (/tapered\s*directional/u.test(text) || (/directional/u.test(text) && /taper/u.test(text))) shape = "tapered-directional";
  else if (/true\s*twin/u.test(text) || text === "twin") shape = "twin";
  else if (/directional|направлен/u.test(text)) shape = "directional";
  else if (/twin|твин/u.test(text)) shape = "twin";
  return shape
    ? knownTruth(shape, context, { method: "normalized", normalizationRule: "shape-v1" })
    : unknown(context, "unrecognized");
}

export function resolveCamberTruth(value, context = {}, correctedValue = null) {
  const candidate = correctedValue ?? normalizeText(value);
  if (!candidate) return unknown(context, "missing");
  if (!CAMBERS.has(candidate)) return unknown(context, "unrecognized");
  return knownTruth(candidate, context, correctedValue != null
    ? { provenance: "manual", method: "manual-override" }
    : { method: "explicit" });
}

export function classifyTruthWidthType(waistWidthMm) {
  if (waistWidthMm >= 264) return "wide";
  if (waistWidthMm >= 257) return "mid-wide";
  return "regular";
}

export function buildSizeTruthV2(waistResolution, context = {}) {
  if (waistResolution?.value == null) {
    const evidence = waistResolution?.evidence ?? createAttributeEvidence(context, { state: "unknown" });
    return assertProductSizeTruthV2({
      truthModelVersion: 2,
      waistWidthMm: null,
      widthType: null,
      attributeEvidence: {
        waistWidthMm: evidence,
        widthType: createAttributeEvidence(context, { state: evidence.state }),
      },
    });
  }
  const waist = waistResolution.value;
  return assertProductSizeTruthV2({
    truthModelVersion: 2,
    waistWidthMm: waist,
    widthType: classifyTruthWidthType(waist),
    attributeEvidence: {
      waistWidthMm: waistResolution.evidence,
      widthType: createAttributeEvidence(context, {
        state: "known",
        provenance: waistResolution.evidence.provenance,
        method: "derived",
        normalizationRule: "width-thresholds-257-264",
      }),
    },
  });
}

export function buildProductTruthV2(resolutions) {
  return assertProductTruthV2({
    truthModelVersion: 2,
    ridingStyles: resolutions.ridingStyles.value,
    skillApplicability: resolutions.skillApplicability.value,
    boardLine: resolutions.boardLine.value,
    flex: resolutions.flex.value,
    shapeType: resolutions.shapeType.value,
    camberProfile: resolutions.camberProfile.value,
    attributeEvidence: Object.fromEntries(
      Object.entries(resolutions).map(([key, item]) => [key, item.evidence]),
    ),
  });
}

function assertEvidence(evidence, hasValue) {
  if (!evidence || Object.keys(evidence).some((key) => !EVIDENCE_KEYS.has(key))) throw new TypeError("Invalid truth evidence");
  if (!["known", "unknown", "ambiguous"].includes(evidence.state)) throw new TypeError("Invalid truth state");
  if (!PROVENANCES.has(evidence.provenance)) throw new TypeError("Invalid truth provenance");
  if (evidence.method != null && !METHODS.has(evidence.method)) throw new TypeError("Invalid truth method");
  if (hasValue !== (evidence.state === "known")) throw new TypeError("Truth value/evidence mismatch");
  if (evidence.state === "known" && evidence.method == null) throw new TypeError("Known truth requires a method");
  for (const key of ["sourceName", "observedAt", "sourceField", "normalizationRule"]) {
    if (evidence[key] != null && (typeof evidence[key] !== "string" || evidence[key].length < 1 || evidence[key].length > (key === "observedAt" ? 64 : 200))) throw new TypeError("Invalid bounded truth metadata");
  }
  if (evidence.sourceUrl != null) {
    if (typeof evidence.sourceUrl !== "string" || evidence.sourceUrl.length > 2048) throw new TypeError("Invalid truth source URL");
    try { new URL(evidence.sourceUrl); } catch { throw new TypeError("Invalid truth source URL"); }
  }
  if (evidence.sourceScaleMax != null && (!Number.isFinite(evidence.sourceScaleMax) || evidence.sourceScaleMax <= 0 || evidence.sourceScaleMax > 1000)) throw new TypeError("Invalid truth source scale");
  return evidence;
}

export function assertProductTruthV2(truth) {
  if (!truth || truth.truthModelVersion !== 2) throw new TypeError("Invalid product truth version");
  if (Object.keys(truth).some((key) => !PRODUCT_TRUTH_KEYS.has(key))) throw new TypeError("Unexpected product truth field");
  if (!truth.attributeEvidence || Object.keys(truth.attributeEvidence).some((key) => !["ridingStyles", "skillApplicability", "boardLine", "flex", "shapeType", "camberProfile"].includes(key))) throw new TypeError("Unexpected product evidence field");
  if (truth.ridingStyles != null) {
    if (!Array.isArray(truth.ridingStyles) || truth.ridingStyles.length === 0) throw new TypeError("Invalid riding styles");
    const canonical = RIDING_STYLE_ORDER.filter((style) => truth.ridingStyles.includes(style));
    if (new Set(truth.ridingStyles).size !== truth.ridingStyles.length || JSON.stringify(canonical) !== JSON.stringify(truth.ridingStyles)) throw new TypeError("Invalid riding style order");
  }
  if (truth.skillApplicability != null) {
    if (Object.keys(truth.skillApplicability).some((key) => !["min", "max"].includes(key))) throw new TypeError("Unexpected skill truth field");
    const min = SKILL_LEVEL_ORDER.indexOf(truth.skillApplicability.min);
    const max = SKILL_LEVEL_ORDER.indexOf(truth.skillApplicability.max);
    if (min < 0 || max < min) throw new TypeError("Invalid skill applicability");
  }
  if (truth.boardLine != null && !BOARD_LINES.has(truth.boardLine)) throw new TypeError("Invalid board line");
  if (truth.flex != null && (!Number.isFinite(truth.flex) || truth.flex < 1 || truth.flex > 10)) throw new TypeError("Invalid flex");
  if (truth.shapeType != null && !SHAPES.has(truth.shapeType)) throw new TypeError("Invalid shape");
  if (truth.camberProfile != null && !CAMBERS.has(truth.camberProfile)) throw new TypeError("Invalid camber");
  for (const key of ["ridingStyles", "skillApplicability", "boardLine", "flex", "shapeType", "camberProfile"]) {
    assertEvidence(truth.attributeEvidence?.[key], truth[key] != null);
  }
  return truth;
}

export function assertProductSizeTruthV2(truth) {
  if (!truth || truth.truthModelVersion !== 2) throw new TypeError("Invalid size truth version");
  if (Object.keys(truth).some((key) => !SIZE_TRUTH_KEYS.has(key))) throw new TypeError("Unexpected size truth field");
  if (!truth.attributeEvidence || Object.keys(truth.attributeEvidence).some((key) => !["waistWidthMm", "widthType"].includes(key))) throw new TypeError("Unexpected size evidence field");
  const hasWaist = truth.waistWidthMm != null;
  if (hasWaist && (!Number.isInteger(truth.waistWidthMm) || truth.waistWidthMm < 120 || truth.waistWidthMm > 340)) throw new TypeError("Invalid truth waist");
  if (hasWaist !== (truth.widthType != null)) throw new TypeError("Truth waist/width mismatch");
  if (truth.widthType != null && (!WIDTH_TYPES.has(truth.widthType) || truth.widthType !== classifyTruthWidthType(truth.waistWidthMm))) throw new TypeError("Invalid truth width");
  assertEvidence(truth.attributeEvidence?.waistWidthMm, hasWaist);
  assertEvidence(truth.attributeEvidence?.widthType, hasWaist);
  return truth;
}

function stableEvidence(evidence) {
  return JSON.stringify(Object.fromEntries(Object.keys(evidence).sort().map((key) => [key, evidence[key]])));
}

function mergeValue(leftValue, leftEvidence, rightValue, rightEvidence) {
  if (leftEvidence.state === "known" && rightEvidence.state === "known") {
    if (JSON.stringify(leftValue) !== JSON.stringify(rightValue)) {
      return { value: null, evidence: { ...[leftEvidence, rightEvidence].sort((a, b) => stableEvidence(a).localeCompare(stableEvidence(b)))[0], state: "ambiguous", method: null } };
    }
    return stableEvidence(leftEvidence).localeCompare(stableEvidence(rightEvidence)) <= 0
      ? { value: leftValue, evidence: leftEvidence }
      : { value: rightValue, evidence: rightEvidence };
  }
  if (leftEvidence.state === "known") return { value: leftValue, evidence: leftEvidence };
  if (rightEvidence.state === "known") return { value: rightValue, evidence: rightEvidence };
  const state = leftEvidence.state === "ambiguous" || rightEvidence.state === "ambiguous" ? "ambiguous" : "unknown";
  const selected = stableEvidence(leftEvidence).localeCompare(stableEvidence(rightEvidence)) <= 0 ? leftEvidence : rightEvidence;
  return { value: null, evidence: { ...selected, state, method: null } };
}

export function mergeProductTruthV2(left, right) {
  if (!left) return right;
  if (!right) return left;
  assertProductTruthV2(left);
  assertProductTruthV2(right);
  const keys = ["ridingStyles", "skillApplicability", "boardLine", "flex", "shapeType", "camberProfile"];
  const merged = Object.fromEntries(keys.map((key) => [key, mergeValue(left[key], left.attributeEvidence[key], right[key], right.attributeEvidence[key])]));
  return buildProductTruthV2(merged);
}

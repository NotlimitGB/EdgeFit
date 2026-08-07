# Recommendation Golden Dataset

## 1. Purpose

The recommendation golden dataset is a curated quality baseline for rider fit. It records broad, reviewable expectations for snowboard length, width category, target waist width, boot-drag concern, shape direction and support profile across 36 rider scenarios. It also records 12 pairwise invariants for safety and directional behavior.

The dataset is intended to catch implausible recommendation behavior without pretending that a single universal snowboard-sizing chart exists.

## 2. Why this is independent from `engine.ts`

The benchmark is based on the product and domain principles supplied for Task004. It does not import or execute `getRecommendation()`, does not reference `ALGORITHM_VERSION`, and was not produced by snapshotting engine output. Its ranges and allowed sets are deliberately independent from the engine's internal weight tables, width thresholds and boot-drag rules.

This separation allows a later audit to reveal disagreements instead of encoding the current implementation as the expected answer.

## 3. Regression tests versus the golden benchmark

Existing recommendation tests answer: “Did the implementation retain its established behavior?” They are implementation regression tests and can be valuable even when that established behavior later needs review.

The golden dataset answers a different question: “Is this outcome plausible relative to the agreed product and rider-fit principles?” Task004 validates the benchmark itself; it does not compare the benchmark with the production engine.

## 4. Reference principles

The benchmark follows these principles:

- Weight is a stronger length driver than height; height is a modifier.
- Manufacturer sizing is model-specific, so overlapping length envelopes are legitimate.
- Boot size makes board width, waist width and boot-drag concern safety-relevant.
- With other inputs fixed, a larger boot must not produce a narrower or apparently safer fit.
- Stance modifies width safety but cannot erase large-boot requirements.
- Park intent generally favors maneuverability; freeride and soft snow favor stability and float.
- Aggressive riding may require more support and must not trend less stable than relaxed riding.
- Beginner profiles should remain forgiving; advanced/aggressive profiles should not be systematically soft.
- Terrain priority must visibly affect shape/profile direction.
- Board-line preference changes the search space, not rider physics.

## 5. Why manufacturer sizing is model-specific

Snowboard construction, effective edge, shape, sidecut, flex, volume distribution and the manufacturer's intended weight range all affect suitable sizing. A rider therefore cannot be mapped to one universally correct length or waist measurement independently of a model.

The benchmark is strict enough to reject clearly implausible outcomes while leaving legitimate room for model geometry and manufacturer guidance.

## 6. Why ranges and allowed sets are used

Length and waist expectations are inclusive sane envelopes, not exact targets. Allowed sets express legitimate boundary outcomes. For example, allowing both `regular` and `mid-wide` means that either may be reasonable for that rider depending on board geometry; it does not mean the benchmark is undecided.

Small boots generally allow regular widths. Boundary boots deliberately use overlapping sets. Large boots cannot be regular-only, and the explicit EU 49 scenario requires `wide`. These are conservative benchmark semantics, not universal boot-size cutoffs.

The benchmark-only support profiles have the following meaning:

- `forgiving`: accessible, lower-demand support direction;
- `balanced`: neutral support for broad use;
- `supportive`: stability-oriented direction for stronger or more aggressive riding.

They do not add a field to the production recommendation contract and do not rank catalog products.

## 7. Dataset coverage

The 36 cases are intentionally grouped for reviewability:

- 8 weight/height cases cover 35–45 kg through 110+ kg, short through very tall riders, and conflicting short-heavy and tall-light profiles;
- 12 boot/stance cases cover EU 37, 41, 43, 43.5, 44, 44.5, 45, 45.5, 46 and 49, including standard, duck and unknown stance comparisons;
- 10 riding-intent cases cover park, all-mountain and freeride, every terrain priority, and relaxed through aggressive intent;
- 3 physically identical board-line cases cover `men`, `women` and `any`;
- 3 physically identical skill cases cover beginner, intermediate and advanced profiles.

Together they cover every current `QuizInput` dimension and all named Task004 archetypes without generating an unreadable permutation matrix.

## 8. Pairwise invariants

Each invariant names a left case, a right case, the only input dimension allowed to differ, and the expected direction from left to right. The 12 invariants cover:

- heavier rider length monotonicity;
- larger-boot width, waist and boot-drag monotonicity;
- freeride relative to park length direction;
- aggressive relative to relaxed length and support direction;
- soft snow relative to balanced length direction;
- standard relative to duck width safety;
- unknown relative to standard boot-drag caution;
- physical-fit equality across men/women/any board-line preferences.

For `same_physical_fit_expectation`, equality covers length, width, waist, boot-drag risk, shape and support profile. It does not cover catalog filtering, product availability or model ranking.

## 9. What Task004 does not validate

Task004 does not certify algorithm v1.6.0.

It does not run or score the current engine, validate a manufacturer model chart, query the catalog, rank products, assess prices or availability, test affiliate links, or change production recommendation behavior. It also does not prove that every allowed outcome is correct for every real snowboard geometry.

## 10. How Task005 should consume the dataset

Task005 should execute the current recommendation engine for each golden input, compare structured results with the absolute expectations, and evaluate every pairwise invariant in its declared direction. It should report mismatches with the case ID, actual result, permitted expectation and human-readable rationale.

A failed Task005 benchmark does not automatically mean the engine is wrong. It means the scenario requires review against the benchmark rationale.

Task005 should keep absolute expectation failures distinct from pairwise invariant failures and should not silently adjust golden ranges merely to make the current engine pass.

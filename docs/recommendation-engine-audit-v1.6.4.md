# Recommendation Engine Audit v1.6.4

## 1. Executive summary

- Algorithm version: `v1.6.4`
- Golden rider cases: 36
- Pairwise invariants: 12
- Overall observable result: **PASS**

The audit evaluates rider-fit output with an empty catalog. Product ranking, availability and catalog readiness are not involved.

## 2. Status counts

| Status | Absolute cases | Observable checks | Invariants |
| --- | ---: | ---: | ---: |
| PASS | 36 | 180 | 11 |
| REVIEW | 0 | 0 | 0 |
| FAIL | 0 | 0 | 0 |
| NOT_OBSERVABLE | 0 | 0 | 1 |

Total unobservable check-level gaps, including support components: 39.

## 3. Absolute failures

No issues recorded.

## 4. Absolute reviews

No issues recorded.

## 5. Pairwise invariant results

| Invariant | Rule | Left case | Right case | Status | Reason |
| --- | --- | --- | --- | --- | --- |
| heavier_rider_not_shorter | length_not_shorter | weight_pair_70kg | weight_pair_80kg | PASS | The actual outputs satisfy length_not_shorter. |
| larger_boot_width_not_narrower | width_not_narrower | medium_boot_41_standard | large_boot_46_standard | PASS | The actual outputs satisfy width_not_narrower. |
| larger_boot_waist_not_narrower | waist_not_narrower | medium_boot_41_standard | large_boot_46_standard | PASS | The actual outputs satisfy waist_not_narrower. |
| larger_boot_drag_not_lower | boot_drag_not_lower | medium_boot_41_standard | large_boot_46_standard | PASS | The actual outputs satisfy boot_drag_not_lower. |
| freeride_not_shorter_than_park | length_not_shorter | comparison_park_rider | comparison_freeride_rider | PASS | The actual outputs satisfy length_not_shorter. |
| aggressive_park_not_shorter | length_not_shorter | relaxed_park_rider | aggressive_park_rider | PASS | The actual outputs satisfy length_not_shorter. |
| aggressive_park_not_less_stable | support_not_less_stable | relaxed_park_rider | aggressive_park_rider | NOT_OBSERVABLE | RecommendationResult does not expose an independent rider-level support profile, so support stability cannot be compared. |
| soft_snow_not_shorter_than_balanced | length_not_shorter | balanced_all_mountain_rider | soft_snow_all_mountain_rider | PASS | The actual outputs satisfy length_not_shorter. |
| standard_not_narrower_than_duck | width_not_narrower | large_boot_46_duck | large_boot_46_standard | PASS | The actual outputs satisfy width_not_narrower. |
| unknown_stance_drag_not_lower | boot_drag_not_lower | large_boot_46_standard | large_boot_46_unknown | PASS | The actual outputs satisfy boot_drag_not_lower. |
| women_line_same_physical_fit | same_physical_fit_expectation | board_line_men_reference | women_preference_rider | PASS | All observable rider-physics fields are exactly equal. |
| any_line_same_physical_fit | same_physical_fit_expectation | board_line_men_reference | any_line_preference_rider | PASS | All observable rider-physics fields are exactly equal. |

## 6. Observability gaps

Production `RecommendationResult` does not expose an independent rider-level support profile. The audit therefore records support-profile expectations as `NOT_OBSERVABLE` and does not infer them from skill, aggressiveness, riding style, golden expectations or catalog products.

This includes support checks for all 36 absolute cases, the dedicated support invariant, and the support component of both board-line physical-fit invariants.

## 7. Interpretation

A benchmark disagreement does not by itself authorize changing production logic.

`FAIL` identifies a clear safety or directional contradiction and is a strong candidate for focused review. `REVIEW` identifies a model-dependent or profile trade-off that needs human/domain analysis. Passing all observable checks does not validate the unobservable support dimension.

## 8. Candidate Task006 scope

- No evidence-backed production correction area was identified.

These are evidence-backed candidate areas only. Task005 does not prescribe or implement production changes.

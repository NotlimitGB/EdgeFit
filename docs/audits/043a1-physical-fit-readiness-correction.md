# 043A1 — physical fit before population preferences

Production main baseline: `9462e254e8797430021696489cf049100013581f`.
Rejected 043A / correction parent: `c3104d758acfbc61edcb0aec87d4e303624fbb11`.
Correction branch: `task/043A1-physical-fit-readiness-correction`.

This is a local source correction of the 043B P1 finding, not evidence of
production recovery, current merchant stock or a complete production-corpus
ranking audit. No production HTTP, DB access, ingestion, migration or deployment
was performed. The original 043A audit describes the rejected candidate; this
document records its subsequent correction.

## Confirmed mechanism and RED evidence

Rejected 043A used:

```text
active Products
→ style population preference
→ merchant-ready subset if at least 3 Products
→ verified subset fallback
→ physical size filtering
→ unchanged scoring, family collapse and final thresholds
```

Merchant readiness includes a non-placeholder affiliate link; it is not physical
eligibility. Three merchant-ready Products can therefore remove a physically
appropriate Product before the engine inspects any of their sizes.

The permanent `043B P1` regression was first run against the unchanged rejected
engine and failed: expected `fit-without-link`, received an empty array.

Exact synthetic fixture reuses the repository demo input and Product geometry:
178 cm / 74 kg / EU 44, men's preference, intermediate all-mountain, balanced,
standard stance. A has the demo 154 cm / 257 mm mid-wide recorded size and no
affiliate link; B–D have 140 cm / 230 mm, women's designation, merchant links and
negative historical size marks.

| Version | Recommended model / size / score |
| --- | --- |
| Exact production main engine | A / 154 / 169 |
| Rejected 043A engine | Empty |
| 043A1 correction | A / 154 / 169 |

Range 152–156 cm, target waist 257 mm, reasons, role and confidence of A remain
unchanged. No fresh-stock claim is introduced: availability is UNKNOWN.

## Selected correction

The owner selected removal of the hard merchant gate, not an empty-result-only
fallback. Corrected order:

```text
unchanged rider length/width calculation
→ active Products + once-prepared physically eligible recorded sizes
→ existing style preference over viable Products
→ existing verified-quality preference over viable Products
→ unchanged scoring of the prepared sizes
→ unchanged family collapse, ordering, thresholds and result limits
```

An internal `PhysicallyViableBoard` pairs the original Product reference with
its eligible size references. Each active Product's size list is filtered once.
Inactive Products and Products with no eligible recorded size never count
toward the population preferences. `getCandidates` consumes these prepared
sizes instead of evaluating physical eligibility again. Input arrays, Products,
size labels, width variants and size objects are not mutated or synthesized.

`isReadyForCatalog` remains in `scoreCandidate`. Its existing +10 versus verified
+4 bonus, placeholder-link penalty and confidence rules remain intact. Missing
links no longer create a hard merchant population exclusion. No public/domain
type, API shape, algorithm version, scoring formula or threshold changes.

The physical predicate, scoreCandidate function and family-collapse function
compare identically with rejected 043A after LF/CRLF normalization. The only
changed existing functions are style population selection, candidate population
selection, candidate scoring orchestration and recommendation orchestration;
one physical-preparation helper is added.

## Competitive behavior and remaining policy limits

Four suitable verified demo-like Products with identical geometry, three with
merchant links and one without:

| Version | Ordered recommendations |
| --- | --- |
| Main and rejected 043A | ready-a 175; ready-b 175; ready-c 175 |
| Correction | ready-a 175; ready-b 175; ready-c 175; without-link 169 |

The fourth model is newly admitted, not rescored. Existing commercial readiness
still explains the six-point difference. Equal-score order is deterministic by
the existing comparison rules. This closes the pre-existing merchant-gate
limitation without rewriting the ranking formula.

Style mappings and the threshold of three remain unchanged, but their count now
uses only physically viable Products. Consequently, three unsuitable
all-mountain Products no longer hide a viable park fallback. Likewise, three
unsuitable verified Products no longer hide a viable draft. These are intentional
changes caused by establishing physical viability before population restriction.
Tests also preserve the opposite policy: three viable preferred-style or verified
Products still activate their existing preference.

Physical admission is not a positive recommendation verdict. A geometrically
admitted but low-scoring Product remains below the recommendation threshold;
the existing 56/40 recommendation/alternative thresholds and 4/3 result limits
remain. No invalid size or low-scoring Product is inserted to pad the result.

Verified-quality and style policies can still exclude other viable Products.
This correction does not promise every physically admitted model appears in the
top four, nor remove all quality-policy reasons for an empty result. It removes
merchant-link existence as a hard population gate; broader quality/ranking
policy redesign remains outside this task.

## Recorded size versus manufacturer evidence

Only original recorded geometry is evaluated. Regression tests assert object
identity with the Product's stored size, preserving labels and regular/mid-wide/
wide variants. A historical positive stock mark neither proves that a size exists
nor creates a new size. Negative marks do not erase a recorded physical variant.

Repository/importer records and their existing validation are the available
source of geometry. This task does not independently verify manufacturer's
charts, production records or provenance for every size. The test fixtures are
synthetic recorded-data examples, not a production manufacturer-size audit.

## Comparisons and regression evidence

An in-memory loader compared exact main and rejected engine Git blobs with the
working correction, retaining unchanged dependencies. Compared fields included
length/width, risk, explanations, models, sizes, scores, reasons, roles,
confidence, ordering and alternatives.

- All 36 golden rider inputs with the nonempty three-Product demo corpus match
  main and rejected 043A exactly. The existing separate golden audit with an empty
  catalog is not counted as ranking evidence.
- A 36-Product synthetic corpus spans men/women/unisex, all-mountain/park/freeride,
  144/150/154/160 cm, three widths and recorded weight bounds. All five profiles
  below match both prior engines exactly with positive marks, including reasons,
  confidence, ordering and alternatives. These fixtures are not the full corpus.

| Profile | Correction's ordered model/size/score summary |
| --- | --- |
| Beginner | men-all-mountain-154/154/158; unisex-all-mountain-154/154/154; women-all-mountain-154/154/136; men-all-mountain-160/160/82 |
| Freestyle | men-park-154/154/158; unisex-park-154/154/154; men-all-mountain-154/154/137; women-park-154/154/136 |
| Freeride | men-freeride-154/154/150; unisex-freeride-154/154/146; men-freeride-160/160/142; unisex-freeride-160/160/138 |
| Women | women-all-mountain-150/150/161; unisex-all-mountain-150/150/157; men-all-mountain-150/150/139; women-all-mountain-154/154/128 |
| Wide | men-all-mountain-154/154/137; unisex-all-mountain-154/154/133; women-all-mountain-154/154/115; men-all-mountain-160/160/114 |

Permanent tests reverse input order and flip historical marks, requiring identical
decisions. No new scoring or admission exception is used for women's scenarios.
The other 32 Products in each profile are outside its top four; that number alone
does not classify each as physically excluded versus lower-ranked.

Additional permanent cases cover no merchant offers, all unsuitable Products,
empty sizes, inactive Products, a below-threshold physical fit retained only as
an alternative, missing merchant availability, recorded-size identity and
preservation of existing style/verified preferences. Existing golden tests were
not weakened or rewritten.

## Cost and safety

For P Products and S recorded sizes, preparation costs O(P + S). It retains at
most the original eligible size references. Each selected eligible size is
scored once; existing per-Product size sorting and cross-Product ranking retain
their existing O(sum(k log k) + M log M) behavior. There is no second complete
recommendation/scoring pass and no retry/fallback replay.

Physical checks now inspect every active Product before population restriction,
and removing merchant exclusion can score more Products. This is an intentional
bounded CPU/input-set change, not a claim of identical runtime. No production
performance benchmark was performed. No new SQL, connections, cache operation,
client generation, admission unit, TTL, ingestion or cron work is introduced.
039G/039N safety code is untouched.

No catalog/result/board UI, saved-result contract, canonical builder, sitemap,
merchant destination or /go runtime change is included. Prior 043A historical
price/unknown-price behavior and optional snapshot fields remain. The pure
availability evaluator's conservative INACTIVE/SUPERSEDED group blocking differs
from reviewed 040H temporal selection; it is unchanged and still disconnected
from public loaders. No 040H integration or competing freshness logic is added.

## Validation and delivery gates

- RED: exact P1 test failed on rejected 043A before engine modification.
- Focused engine: 125/125 PASS (15 additional cases, including parameterized cases).
- Broader recommendation/availability/exact-size/saved-result/API pass:
  253/253 PASS in 13 suites. Unrelated frontend suites were not repeated.
- Standalone TypeScript CompilerHost comparison: main 61, rejected 61,
  correction 61; no added diagnostics. Existing diagnostics are not a clean tsc
  claim. The production build checks source types separately.
- Lint PASS. Final DB-less Next.js 16.2.2 Timeweb standalone build PASS; catalog
  runtime and saved-result enabled/static artifact verifiers PASS; diff-check
  PASS. Tests/build use process-local DATABASE_URL=" " and
  DATABASE_SSL="disable"; no env file or platform setting is edited.
- Initial build used an incorrectly named optional saved-result harness flag;
  compile/type/build passed but enabled-capability artifact verification failed.
  The final build uses the correct SAVED_RESULTS_ENABLED=true. This is a local
  harness configuration issue, not a candidate runtime correction.
- Reuse accepted 043A 1700-test full-suite evidence; no new full-suite count is
  claimed. No browser QA or production journey verification is claimed here.

Only the correction branch may be committed/pushed after final gates and exact
remote recheck. Main integration, deployment and subsequent targeted independent
review remain separate owner-controlled steps.

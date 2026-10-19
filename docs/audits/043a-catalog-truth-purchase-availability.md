# 043A — physical fit and purchase availability

Baseline: `9462e254e8797430021696489cf049100013581f`.
Branch: `task/043A-catalog-truth-purchase-availability`.
This is repository and synthetic-fixture evidence. No production HTTP, database,
schema migration, ingestion, cache invalidation or deployment was performed.

## Catalog audit

| Measure | Evidence and limit |
| --- | --- |
| Current canonical model count | UNKNOWN: no complete production corpus is stored locally |
| Current season distribution | UNKNOWN; seasons are explicit family/product identities, not stock states |
| Current historical offer / positive size-mark counts | UNKNOWN |
| Historical reference counts | Owner's previous audit: 558 models / 661 offers / 1206 positive size marks; not current inventory |
| Trustworthy current-stock coverage | UNKNOWN; public legacy readers supply no independent merchant availability observation |
| Verified purchasable models | UNKNOWN; no authorized acquisition source or production freshness policy |

`model_families` holds canonical family/specification/season identity. Legacy
`products` holds both a specification carrier and a merchant destination/stored
price. `product_sizes` holds size geometry and the undated `is_available` mark.
`products.source_checked_at` belongs to specification/source review; it is not an
inventory observation. Missing source booleans are normalized using the existing
legacy defaults; this package does not reinterpret them as present-day facts.

`canonical-catalog.ts` reads families and products; `canonical-catalog-model.ts`
groups their explicit membership, rejects duplicate canonical slugs, preserves
season identity, and includes a model with at least one curated active Product.
No new visibility rule is introduced. A model absent from every source Product
cannot be reconstructed from invented data. A Product with geometry but no
merchant destination can still be evaluated by the fit engine.

Active means curated catalog eligibility. Offer existence, a stored price,
`isFulfillable` and positive size marks are historical commerce information.
The existing default merchant destination heuristic is preserved, including its
historical-mark preference; it supplies a verification link, not stock evidence.
Price remains a stored minimum over active positive legacy prices.

The catalog DTO keeps its historical count/preview and stored-price fields. Its
width filters now use every active physical size, and featured sorting no longer
uses historical stock-mark count. The cache namespace moves v5 → v6 because
precomputed widths/sort ranks and additive availability metadata change. TTL stays
300 seconds. Board/schema cache contracts, canonical builder and sitemap stay
unchanged.

## Recommendation decision trace

Engine label remains `v1.6.4`; numeric score formulas, weights, thresholds, family
deduplication and tie-breaking remain unchanged. Previously:

1. A Product was excluded when every size had `isAvailable=false`.
2. Remaining Products lost every unmarked size before physical geometry checks.
3. The best focused size was labelled `AVAILABLE` from an undated positive flag.

Now active Products and all their recorded sizes reach the existing physical
checks. The engine never selects a wrong size to satisfy a historical stock
mark. Newly calculated focused buyability and additive `purchaseAvailability`
metadata are `UNKNOWN` / `unknown`; the raw legacy size mark is preserved.

| Situation | Physical decision | Current purchase state |
| --- | --- | --- |
| Suitable geometry, no merchant destination | Can be recommended using recorded geometry | UNKNOWN |
| Suitable geometry, undated or stale historical offer | Same fit checks; stored commerce facts remain historical | UNKNOWN |
| Suitable geometry, complete fresh synthetic exact-size evidence | Fit unchanged; pure compatibility projection can verify stock | Fixture only |
| Unsuitable geometry, positive stock evidence | Existing physical exclusion still applies | Stock cannot override fit |
| Correct physical size has no positive historical mark | Correct size remains eligible | UNKNOWN |
| No verified current offers | Does not produce a false empty result solely for missing freshness | UNKNOWN |

Existing non-stock commercial-readiness criteria remain explicit: readiness
includes a non-placeholder destination, and placeholder destinations carry the
pre-existing -12 score. These are not current-stock evidence. Removing those
separate score/readiness rules would change the scoring policy beyond this
package's preserved-formulas constraint. The no-destination regression proves
that such a board can be recommended; it does not promise top ranking over every
other board. Public recommendations still require recorded, physically credible
geometry. Existing typed focused verdicts (`GOOD`, `COMPROMISE`, `BETTER_OPTIONS`)
and per-signal unknown evidence remain the physical assessment; no competing
fit calculation is added.

### Exact baseline comparison

An in-memory TypeScript experiment loaded the baseline engine directly from its
Git blob and compared it with the working engine, using the repository demo
boards and all 36 golden rider inputs. These are synthetic catalog observations.

- With the demo's original positive marks: 36/36 model/size/score/role/reason and
  physical-range comparisons are identical.
- With all legacy marks set false: baseline returns zero recommended matches;
  the correction returns 76 recommended slots across 29 rider cases. Slots are
  not unique models and are not production availability counts.
- A synthetic board whose only positive mark is an impossible 86 cm size loses
  its credible unmarked 154 cm size before the correction. Afterward it receives
  the 154 cm recommendation (score 175), preserving the baseline range 152–156,
  257 mm target waist and mid-wide width. No score formula was modified.
- Inputs with no physically eligible sizes remain empty. Inactive Products stay
  excluded. New tests compare decisions under both boolean values for every
  golden rider input.

## Purchase availability and 040H compatibility

`purchase-availability.ts` is a source-level projection over the existing
`ExactSizeMerchantOfferSnapshot`, canonical size identity, source kinds, stock
states and freshness states. Its independent observation carrier and explicit
current-table authority fields are structurally compatible with reviewed 040H
(`be4523b7371fdb0ffc4ba8b0e6c742f0746b2912`). That branch is not merged; no tables,
migration, reader queries, writer, feed or production defaults are introduced.

All public legacy paths call only `legacyPurchaseAvailability()`. The pure
evidence evaluator has no public loader or API connection. Complete fresh-offer
fixtures do not establish production freshness coverage.

The adapter requires merchant/product/source identity, exact canonical size,
active statuses, explicit rights evidence, current authority, independent valid
availability time and ingestion time, provenance, matched reconciliation and an
explicit versioned per-source policy. PRODUCT stock never becomes EXACT_SIZE
stock. Common observation time, source review time, price time and ingestion
order do not refresh availability. Calendar-impossible and future timestamps are
rejected. There is no default freshness threshold.

For a given merchant/product/source/size, latest independent observation time
resolves older observations. Equal-time contradictory states block the metric;
a later explicit UNKNOWN does not resurrect IN_STOCK. Malformed/disqualified
members conservatively block the group. Different merchants are independent.
Current authority is mandatory and historical snapshots cannot grant rights.
Verified authority-event resolution remains owned by 040H; this adapter accepts
only an explicit current-table context and performs no authority-event replay.

Fresh IN_STOCK and OUT_OF_STOCK can produce separate verified states. AGING,
STALE, UNKNOWN and PREORDER do not produce a verified-current purchase-availability
claim. PREORDER remains an explicit observed stock state. Stock evidence says
nothing about price freshness; this projection alone is not a priced
purchase-ready offer. Future rollout requires separately authorized schema,
source/cadence/policy and evidence/identity validation.

## API, UI, analytics and compatibility

- Recommendation matches, focused checks and the catalog DTO add optional typed
  `purchaseAvailability`; new legacy outputs use `unknown/UNKNOWN/UNKNOWN`.
  Existing payload fields remain. Saved-result validation accepts the addition
  and keeps older snapshots without it readable, including old `AVAILABLE`.
- Exact-size legacy intelligence now emits `historical_mark` instead of the
  misleading `confirmed_available`. The existing `exact_size_offer_status`
  analytics key and events remain. Historical analytics values are not rewritten;
  downstream analysis must treat earlier `confirmed_available` as legacy marks,
  not verified current inventory or purchases.
- Outbound destination URLs, route parameters, merchant identity, attribution,
  click events and `/go` execution policy remain unchanged. The server still
  derives status from source data rather than trusting a supplied status query.
- Historical prices and positive marks retain the 040B wording. Focused UNKNOWN
  with a known fit size now says its availability is unconfirmed rather than
  asking the user to determine a size that is already known.
- Local rendered QA reproduced an existing `0 ₽` saved-price claim for a Product
  without a known price. Result cards now show «нет данных» for zero, negative or
  non-finite stored prices, matching the catalog/board behavior. Four regressions
  cover those values; known positive prices keep their existing formatting.
- Active board-size rows keep a merchant verification CTA even when their legacy
  mark is false. Inactive rows remain non-actionable. The CTA remains «Проверить
  в магазине»; it does not promise a transaction or stock.
- Homepage/quiz copy and canonical metadata are unchanged. There are no public
  live Product/Offer stock structured-data claims to replace. No live Offer data
  is introduced, old seasons remain informational identities, and 041C is absent.

Russian wording follows SnowDex brand and UX-writing guidance: preserve recorded
facts, make uncertainty explicit and keep the merchant verification action clear.

## Validation and remaining gates

Focused tests cover the fit/stock separation, all golden input permutations,
independent evidence clocks, current rights, source/product/size isolation,
conflicts, late corrections, malformed/future time, stock states, projection,
historical result reading and YES Hell YES 149 canonical navigation.

Final gates: 48/48 final targeted tests; 1700/1700 full-suite tests across 110
files; lint PASS; ordinary Next.js 16.2.2 Turbopack Timeweb standalone DB-less
build PASS; catalog and saved-result artifact verifiers PASS; diff-check PASS.
Tests used `DATABASE_URL=" "`, `DATABASE_SSL="disable"`.

Standalone TypeScript
checking has 61 existing baseline diagnostics in test files; an in-memory
CompilerHost comparison found the same 61 in this package and no added
diagnostics. The source build is checked separately. The strict ownership-file
byte assertion is preserved; isolated checks use exact Git bytes to avoid the
known Windows autocrlf worktree difference.

The first archive inherited autocrlf; its ownership assertion failed until the
fixture was re-extracted with `git -c core.autocrlf=false archive`. The original
repository verification file/assertion were untouched. Final fixture bytes match
the historical blob: ownership HTML 54 bytes, SHA256
`d61f4eddcbe5524fe7d9da5a7bdedd4281b8663420400c4e699e83584b481d7b`;
middleware 2141 bytes, SHA256
`0c49aa8ad0345bbfe762752cad856e473b25f9bb3097fb004bf47676559bac3b`.
The isolated build's dependency junction was rejected by Turbopack, and a
webpack attempt hit an existing Windows URL import problem in the cron route.
The required ordinary Turbopack build subsequently passed in the original
workspace with the DB sentinel overriding database configuration. No production
route, cron handler or database operation was executed by these checks.

Local Next.js 16.2.2 rendered QA used only synthetic data replacements in a
temporary copy. Catalog, result and board were inspected at 390/768/1440 px,
including long labels, historical/unknown states, the 149 cm fit and keyboard
width selection. Catalog → board and keyboard result → `/boards/yes-hell-yes`
navigation completed. No document-level horizontal overflow or browser console
errors were observed. The board's existing narrow-screen table remains locally
scrollable. No merchant CTA was executed and the server recorded no quiz POST.
This is fixture UI evidence, not production persistence or inventory evidence.

Production inventory counts, acquisition authorization, policy cadence, fresh
offers, full production-corpus ranking effects and live acceptance remain
UNKNOWN / NOT RUN. The package does not resolve the historical DB incident;
039G/039N client/admission accounting and 042E quiz containment are preserved.

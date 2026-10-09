# Merchant price and stock observation foundation — 040F

## Readiness and production boundaries

This is a source foundation, not a live inventory feed. No public loader imports
the merchant-offer layer, no rollout flag is added, and historical 040B copy stays
unchanged. No DB inspection, migration, refresh, ingestion or cron was performed.

Baseline: `9461c2059f943e3c66a2f882e18ed295d6547b4d`. The owner reports 558 canonical
models, 661 active legacy offers and 1206 positive historical size marks. These
are prior audit evidence, not a fresh production SQL count. 040A reported absent
merchant tables; their current production presence is UNKNOWN. Repository schema
support never proves a deployed schema or populated observations.

## Existing architecture audit

| Boundary | Existing support | Gap / 040F decision |
| --- | --- | --- |
| Canonical specifications | Family/product identities and size variants | Commerce evidence does not change specs, slugs or seasons |
| Legacy commerce | `products.price_from`, destinations and `product_sizes.is_available` | Historical only; `source_checked_at` is not price/stock observation time |
| Merchant schema | 030P migration, merchants, merchant_products, merchant_offers | Independent price/stock evidence added by a separate additive migration |
| Source identity | Stable merchant product key and SKU/variant/size URL | Authorization to reconcile identity is not merchant commercial authorization |
| Size identity | Canonical family/product ID, size and regular/Wide label | Season/edition belongs to canonical identity; no cross-season reconciliation |
| Dormant reader | Exact-size MATCHED offers, same-product PRODUCT price fallback | Maps independent metric evidence, merchant product identity and rights evidence |
| Freshness | Explicit age classifier | Independent versioned policies, no production defaults |
| Public presentation | v5 catalog projection, historical board/result wording | Unchanged; pure future projection only, no public DTO fields added |
| Recommendation | Legacy size marks affect filtering and buyability | Preserved v1.6.4; future physical-fit/purchase-availability separation required |
| Outbound | Existing exact-size intelligence and `/go` attribution | Preserved; projection never chooses or rewrites a destination |
| Acquisition | Trial Sport HTML and Traektoria catalog importer | Not proven authorized price/stock feeds; no automatic promotion |
| Scheduling | Vercel daily catalog-refresh cron, weekly/retry analytics | Unchanged, no job invocation; schedule is not a freshness guarantee |

The existing legacy reconciler is conservative source-mapping validation, not
a temporal observation resolver. Use `reconcileMerchantObservations` and
`selectCurrentExactSizeOffers` for future temporal selection. Public code uses
neither reader nor evaluator. The reader requires migrated tables; it does not
swallow missing-schema errors as an empty successful corpus.

## Observation and validation contract

Keep one merchant offer model. An observation references the existing merchant,
merchant product ID/key, source identity, source kind/status, authorization
evidence and reconciled canonical size. Model/season reconciliation is required
before MATCHED; matching a name or numeric length is insufficient. Regular and
Wide remain separate. Source SKU reuse across seasons requires review, not an alias.

Price and availability have separate `*_observed_at`, `*_evidence_ref`,
`*_source_url`, `*_source_updated_at` and `*_ingested_at` columns. Existing
`observed_at`, feed/checksum fields and legacy rows remain intact. NULL evidence
stays UNKNOWN; nothing is backfilled from row timestamps or deployment time.
Source update time is optional and never substitutes for observation time.

An adapter must preserve:

- Merchant/product identity and source scope, exact size identity when supported.
- Price amount/currency and independent stock enum: IN_STOCK, OUT_OF_STOCK,
  PREORDER or UNKNOWN. Missing stock is not IN_STOCK.
- A timezone-qualified observation instant for each actually observed metric,
  retained evidence reference, source URL, ingestion instant and optional source
  update instant. Receipt of an old feed does not refresh its observation time.
- Source kind, active status and documented authorization evidence. LEGACY_IMPORT
  and PUBLIC_REFERENCE cannot become current, even if a timestamp is supplied.

The SQL constraints require coherent evidence when observation time is populated.
The evaluator additionally rejects invalid/future/non-zoned times, ingestion before
observation or after evaluation time, missing evidence, invalid URLs, inactive or
unauthorized sources and inconsistent identities. A URL is provenance, not proof
of permission. Evidence references must resolve to retained, independently
reviewable source material; do not put credentials or personal data in references.

PRODUCT price fallback is only from the same merchant product, carries its own
price evidence, and is labelled as product price rather than exact-size price.
It cannot make an exact size purchase-ready. PRODUCT stock is never inherited by
an exact size. Product-level observations remain stored with PRODUCT scope;
board-wide presentation requires separately approved product reconciliation.

## Freshness policy — deliberately no production thresholds

Supply independent price and availability policies with a nonblank version,
`freshThroughMs >= 0` and `staleAfterMs >= freshThroughMs`. Missing policy means
UNKNOWN. Test fixture thresholds are not operational defaults or SLAs.

Before choosing thresholds, document permitted source cadence, maximum upstream
delay, stock granularity, operating hours and tolerated price/stock age. Stock can
change faster than price; adopting identical budgets needs evidence. Approval of
a source-specific version and thresholds is a prerequisite to public integration.

| Classification | Rule / permitted future presentation |
| --- | --- |
| FRESH | Age <= freshThroughMs; display observation time, never guaranteed live stock |
| AGING | freshThroughMs < age <= staleAfterMs; dated prior observation, not current eligibility |
| STALE | Age > staleAfterMs; label outdated, no current-price or purchase-ready claim |
| UNKNOWN | Missing policy, identity, authorization, evidence or valid observation time |

Price eligibility and availability eligibility are independent. A FRESH price
remains informative with OUT_OF_STOCK or unknown stock. OUT_OF_STOCK and PREORDER
are visible states, not purchase-ready. Only two FRESH exact-size metrics and
IN_STOCK permit `purchaseReady`. Even then remind the user to verify with seller.

Temporal resolution groups by merchant/product/source identity, rejects conflicting
canonical mappings and resolves price and stock independently. Equal-time
contradictions block that metric; valid newer observations supersede older ones.
Ingestion order and cheapest price never resolve a conflict. Different merchants,
currencies and sizes are not blended or converted. Selected metrics retain their
original evidence carriers. No ingestion writer or observation-history store is
introduced; a future writer must retain evidence and enforce ordering atomically.

### Current authority is not historical observation evidence

The dormant reader returns `{ offers, authority }`. Authority is explicitly passed
to evaluation/selection/projection; omitting it fails closed for current eligibility
and purchase readiness, without deleting historical observations. Existing joined
`merchants` / `merchant_products` fields provide `CURRENT_TABLES` authority, with
no invented effective timestamp. This context is valid for that current read only;
do not persist it as if it were an immutable historical observation.

For standalone history, `VERIFIED_EVENT` authority requires a genuine effective
timestamp and a nonempty evidence reference for the whole claimed status tuple.
Neither price/stock observation clocks nor ingestion order establish status order.
Merchant status resolves across that merchant; source/rights resolve per merchant
product ID, source product key and source kind, shared by that product's sizes.
Latest independently evidenced authority may restore eligibility after revocation.
Equal-time conflicts, conflicting current reads, invalid/future events, absent
authority and mixed current/event bases fail closed. Different merchants and
source identities cannot authorize one another. Authority evidence references
are opaque provenance references, not a claim that this library verifies their
contents; a future authorized adapter must validate them before constructing context.

Freshness describes the age of independently evidenced historical metrics. It is
not authorization: an old authorized observation may remain informational after
current source deactivation, but cannot become a current offer. `INACTIVE`,
`RESTRICTED`, unknown rights or missing rights evidence prohibit current price,
current stock and purchase readiness. Projection retains observed historical
status separately and reports current status as UNKNOWN when not eligible.
Dates are validated against the Gregorian calendar before parsing: impossible
days, normalized 24:00 clocks and invalid offsets never become fresh observations.

`projectMerchantOffer` is pure and disconnected. Its labels include «Цена по
недавнему наблюдению», «Текущая цена не подтверждена», «Наблюдение наличия
устарело» and «Проверить в магазине». It does not emit a merchant URL, analytics
or navigation. Use temporal selection before projecting multiple observations.

## Acquisition matrix and blockers

| Merchant | Code path exists | Authorized API/partner/affiliate feed | Cadence / observation semantics | Decision |
| --- | --- | --- | --- | --- |
| Trial Sport | Public catalog/product HTML importer | UNCONFIRMED; owner has none | UNCONFIRMED | Automated current-state refresh BLOCKED |
| Traektoria | Catalog endpoint and SKU importer | UNCONFIRMED; owner has none | UNCONFIRMED | Automated current-state refresh BLOCKED |
| Other merchants | Generic source kinds/schema only | UNCONFIRMED | UNCONFIRMED | No working acquisition claimed |

An internal catalog endpoint or publicly visible HTML is not a supported merchant
API contract, permission, or reliable inventory feed. No anti-bot bypass, scraping
expansion, account registration or merchant contact is performed in this task.

For an authorized manual protocol, retain exact merchant product/season/variant,
size scope, source URL, UTC observation time, evidence capture reference and
independent price/stock facts. Record ingestion separately. An undated screenshot
or model-level OUT_OF_STOCK cannot prove exact-size stock. Obtain documented
permission and policy before classifying MANUAL_VERIFIED as current eligible.

EVIL TWIN+ regression: 41,745 RUB and three historical size marks remain legacy
facts. The owner's screenshot of 45,919 RUB / OUT_OF_STOCK remains a separate
external reference until exact offer/size/time reconciliation. The fixture proves
it cannot silently overwrite the legacy value or become a current offer; neither
number is hardcoded as the current merchant price in application presentation.

## Migration, rollout and follow-up

1. Owner approves source rights, exact identity contract and cadence; retain evidence.
2. Approve independent versioned policies; review additive migration separately.
3. Confirm existing 030P merchant schema before applying 040F. The prepared migration
   adds nullable columns/constraints only; repeated application is guarded. No
   table creation, backfill, legacy deactivation or execution occurs here.
4. Implement an authorized writer with retained evidence and deterministic conflict
   handling. Validate an isolated sample before corpus ingestion.
5. Separately authorize public integration, DTO/cache changes and rollout. Preserve
   historical fallback when verified observations are missing; do not change store
   destinations implicitly. Missing schema is a deployment blocker, not empty data.
6. Keep PHYSICAL_FIT independent from PURCHASE_AVAILABILITY in a separate ranking
   task. Current engine filtering/buyability still uses historical marks; 040F does
   not fix that known limitation or assert current recommendation availability.

Verification uses deterministic observations and mocked SQL only: independent ages,
threshold boundaries, invalid provenance, all stock states, product versus size,
conflicts, merchants/currencies, EVIL TWIN+, loader mapping, migration/schema parity
and no public-flow imports. Full tests/lint/DB-less build and both artifact verifiers
protect existing behavior. Browser QA is not applicable: rendered pages are unchanged.

## Owner-only migration execution and recovery

Production schema state is **UNKNOWN**. The 040A missing-table observation does
not establish today's state. No DB access or migration execution is performed by
040H. Migration permission and a maintenance window must be separately approved.
The repo has no general merchant migration runner or canonical migration ledger;
family-only scripts do not establish atomicity for this migration.

### Preflight (read-only, owner-operated)

Use the deployment's intended database/schema, through an existing secure libpq
service definition; never paste DSNs, passwords or tokens into commands/reports.
Collect only schema metadata. A read-only transaction can inspect:

```sql
BEGIN READ ONLY;
SHOW transaction_read_only;
SELECT current_schema(), to_regclass('merchants'),
       to_regclass('merchant_products'), to_regclass('merchant_offers');
SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND table_name IN ('merchants', 'merchant_products', 'merchant_offers')
ORDER BY table_name, ordinal_position;
SELECT conname, contype, convalidated, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN (to_regclass('merchants'), to_regclass('merchant_products'),
                  to_regclass('merchant_offers'))
ORDER BY conrelid, conname;
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname = current_schema()
  AND tablename IN ('merchants', 'merchant_products', 'merchant_offers')
ORDER BY tablename, indexname;
SHOW transaction_read_only;
COMMIT;
```

Required owner evidence: target schema (no credentials), presence and definitions
of the three tables, columns, constraints/indexes, and any actual migration ledger
or deployment record showing applied versions. Do not invent a ledger table.
Compare against the existing merchant-schema migration and schema.sql. Missing
tables require separately authorized prerequisite merchant-schema application
before 040F; do not apply the entire schema.sql as a shortcut. Existing additive
columns must match expected types/nullability and existing same-named constraints
must match their definitions, not merely exist. Incompatible definitions block
application. Partial existing evidence requires owner-run integrity checks before
adding constraints; do not disclose observation rows or merchant payloads.

### Explicit atomic application (separate future authorization)

After preflight, select the approved target using `PGSERVICE` configured securely
by the owner, then run the whole migration with this contract:

```text
psql -X --set=ON_ERROR_STOP=1 --single-transaction --file=db/migrations/20261009_040f_independent_merchant_observations.sql
```

`--single-transaction` wraps the entire file in one transaction; `ON_ERROR_STOP=1`
stops on failure. This atomicity belongs to the invocation, not the SQL file or an
unknown GUI/runner. Do not execute statements individually, suppress failures,
or assume another runner provides the same contract. DDL may wait for locks;
approve bounded session-local lock/statement timeouts in the maintenance procedure
before execution rather than changing application or database defaults.

### Postflight

Repeat preflight metadata checks in a fresh read-only transaction. All ten added
columns must be nullable, without observation-time defaults: six timestamps are
`timestamp with time zone`, four evidence/source URL columns are `text`. Confirm
both independent-observation check constraints are validated and exactly match
the prepared definitions, including evidence and ingestion ordering checks.
Verify prerequisite identity lookup indexes remain unchanged; 040F adds no indexes.
Record exact migration revision, outcome and approved deployment record without
recording secrets. A zero exit status alone does not replace schema postflight.

### Partial application, interruption and rollback

A failed atomic invocation rolls back its DDL. A lost connection near COMMIT has
an unknown outcome: obtain fresh schema evidence before retrying, and do not
assume success or rollback. If an older non-atomic runner partially applied the
file, inventory every expected object and validate retained evidence first.
Reapplication is permitted only after definitions and data integrity match the
prepared contract; guarded additions do not repair incompatible columns or
same-named constraints. Such incompatibility requires a separately reviewed repair.
Never automatically DROP columns, constraints, tables or evidence to retry.

Consumer rollback means disabling/reverting a separately authorized future
writer/reader rollout while retaining the additive schema and historical evidence.
This foundation has no public consumer or rollout flag to disable today. Schema
removal is not the default rollback and requires separate data-preservation review.
Do not backfill observation clocks or replay ingestion as a recovery shortcut.

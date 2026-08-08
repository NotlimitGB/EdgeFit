# Catalog Model Family Architecture

## Executive decision

**Decision:** introduce an additive `model_families` entity above the existing
`products` table. A family is the EdgeFit identity of one snowboard model in one
known season. Existing Product rows remain source/store offers, and
`product_sizes` remain the exact sizes imported for those offers.

This decision is based on repository baseline
`a364e7958e5da4f4370a91b2c7fe2c3e64fd4ec4` (`Audit catalog model families`).

The target hierarchy is:

```text
ModelFamily (EdgeFit model + season)
  -> Product offer (source/store listing)
       -> ProductSize (exact imported offer size)
```

This makes genuine Regular/Wide siblings one public model without losing their
separate store URLs, availability, source provenance, images or imported size
rows. The first rollout is additive: no Product or ProductSize is deleted,
rewritten into a family, or moved away from its source offer.

The minimal schema is sufficient for the MVP:

- one new `model_families` table;
- one nullable family foreign key plus membership metadata on `products`;
- no merchant, SKU, inventory, price-history or family-size tables;
- no change to the ownership of `product_sizes`.

## Current-state contracts

The architecture must preserve these current contracts:

- `products.slug` is the public Product identifier and the lookup key used by
  `/boards/[slug]` and `/go/[slug]`.
- Each Product owns one `affiliate_url`, `source_name`, `source_url`, current
  `price_from`, image set, active state and catalog metadata.
- Each `product_sizes` row belongs to one Product through `product_id`. It owns
  the raw `size_label`, numeric size, waist, weight range, width type and
  availability.
- `getAllProducts()`, `getProductBySlug()` and `getRelatedProducts()` currently
  expose active Products directly and aggregate their ProductSize rows.
- Catalog filtering, sorting, pricing and cards currently operate on Products.
- Board Detail renders one Product, its sizes, its trust/source information and
  its Product-specific outbound route.
- `/go/<product-slug>` resolves the Product, derives the destination from that
  Product, records `product_clicked`, and supports `from`, `placement`,
  `sizeCm`, `sizeLabel` and `widthType` query parameters.
- The recommendation engine v1.6.3 filters and scores individual sizes, then
  keeps the best eligible size per Product. A selected `RecommendationMatch`
  contains the Product and ProductSize used by Result UI routing.
- Recommendation results are serialized through the API, stored in session
  storage and included in quiz-result snapshots. Additive provenance must
  therefore remain backward-compatible with stored legacy results.
- Store refresh upserts Products by slug, replaces ProductSize rows for each
  refreshed Product and may mark missing managed-store Products inactive.
- The internal editor currently edits Product/store-offer data. It has no
  family-level workflow.
- Sitemap currently publishes active Product slugs as `/boards/<slug>`.

These contracts show why a Product cannot safely become the canonical family:
one Product cannot represent multiple distinct affiliate destinations.

## Audit evidence

Task012B inspected the live catalog in a repeatable-read, read-only transaction:

| Metric | Evidence |
| --- | ---: |
| Products | 453 |
| Active Products | 405 |
| ProductSize rows | 1,406 |
| `HIGH_CONFIDENCE_WIDTH_FAMILY` | 49 |
| `REVIEW_WIDTH_FAMILY` | 15 |
| `KEEP_SEPARATE` | 34 |
| Exact/cross-store duplicates | 0 |
| Active Product rows in HIGH families | 98 |
| Potential canonical identities for those rows | 49 |

All 64 HIGH and REVIEW candidate families contain multiple affiliate URLs.
Consequently, even a same-store Regular/Wide pair requires offer-aware routing.

Bataleon Beyond Medals 2024/2025 is the required representative HIGH case:

```text
bataleon-beyond-medals
  151 / 248 / regular
  156 / 254 / regular
  159 / 257 / mid-wide

bataleon-beyond-medals-wide
  161 / 264 / wide
  164 / 264 / wide
```

The Wide offer stores labels `161 cm` and `164 cm`, not `161W` and `164W`.
Its distinct Product identity, width types and waists provide the Wide evidence.
The architecture must preserve those raw labels while allowing an honest
canonical display of `161W` and `164W`.

The audit also found same-numeric-size collisions such as regular `159` and
wide `159` with different waists. `size_cm` is therefore not a size-variant key.

## Domain terminology

- **Model Family / canonical family:** one EdgeFit-facing brand, base model and
  known season identity.
- **Source Product / offer:** the existing Product row representing a store or
  source listing, including its own outbound URL, media and availability.
- **Family member:** an offer assigned to a family.
- **Base offer:** the clean non-Wide sibling used for canonical slug and media
  precedence. A family has at most one base member.
- **Wide offer:** a member whose explicit source listing identifies the Wide
  sibling. `width_type=wide` alone does not assign this role.
- **Exact size variant:** one ProductSize row plus the offer that owns it.
- **Raw size label:** the imported `product_sizes.size_label`, unchanged.
- **Display size label:** a presentation-only label derived from raw evidence
  and family-member role.
- **Default offer:** the deterministic fulfillable offer used by a generic
  family-level store CTA when the user has not selected a size.
- **Singleton fallback:** an ungrouped Product presented through the canonical
  read model as one public identity during the nullable rollout.

## Target model

`ModelFamily` owns canonical identity and canonical snowboard specifications.
It does not own commerce or inventory fields. `Product` remains the source/store
offer and owns all store-specific data. `ProductSize` remains an offer child.

The canonical read model is separate from the current Product domain object:

```ts
interface CanonicalCatalogItem {
  familyId: string | null;
  slug: string; // family slug, or Product slug for a singleton fallback
  brand: string;
  modelName: string;
  seasonLabel: string;
  canonicalSpecs: CanonicalSpecs;
  offers: SourceOfferSummary[];
  sizes: CanonicalSizeVariant[];
  priceFrom: number | null;
  isActive: boolean;
  hasAvailableSize: boolean;
  media: string[];
  defaultOfferSlug: string | null;
}

interface CanonicalSizeVariant extends ProductSize {
  sourceSizeId: string;
  offerId: string;
  offerSlug: string;
  memberRole: "base" | "wide" | "other";
  rawSizeLabel: string | null;
  displaySizeLabel: string;
}
```

These are future internal/read-model contracts, not changes made by Task012C.
Raw merchant URLs need not be serialized with the canonical item: server-side
outbound resolution needs only `offerSlug`.

## Schema proposal

The conceptual additive DDL is:

```sql
create table model_families (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  identity_key text not null unique,
  brand text not null,
  model_name text not null,
  season_label text not null,

  description_short text,
  description_full text,
  riding_style riding_style_type,
  skill_level skill_level_type,
  flex smallint check (flex between 1 and 10),
  board_line board_line_type,
  shape_type board_shape_type,
  camber_profile camber_profile_type,

  canonical_source_kind text,
  canonical_source_name text,
  canonical_source_url text,
  canonical_source_checked_at date,
  canonical_data_status product_data_status_type not null default 'draft',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (length(trim(slug)) > 0),
  check (length(trim(identity_key)) > 0),
  check (length(trim(season_label)) > 0),
  check (canonical_source_kind is null or canonical_source_kind in
    ('verified-official', 'manual', 'trusted-member', 'fallback-member'))
);

alter table products add column family_id uuid
  references model_families(id) on delete set null;
alter table products add column family_member_role text
  check (family_member_role is null or family_member_role in
    ('base', 'wide', 'other'));
alter table products add column family_match_method text;
alter table products add column family_match_confidence text
  check (family_match_confidence is null or family_match_confidence in
    ('high', 'reviewed'));
alter table products add column family_manual_override boolean
  not null default false;
alter table products add column family_match_reason text;
alter table products add column family_matched_at timestamptz;

create index idx_products_family_id on products(family_id);
create unique index uq_products_one_base_per_family
  on products(family_id)
  where family_id is not null and family_member_role = 'base';
```

The implementation migration should add checks for member role
`base | wide | other`, the supported confidence values and coherent nullable
membership fields. `family_manual_override=true` is valid with `family_id=null`:
it means that automatic grouping is blocked for that Product.

`ON DELETE SET NULL` is intentional. Removing a generated family during an
emergency rollback restores its Products as independent identities without
deleting source data. Application/admin operations must still require an
explicit family deletion action.

`is_active`, price, media, affiliate URL and sizes are deliberately absent from
`model_families`; each is derived from current offers. No new join table is
needed because one Product may belong to at most one family and the membership
attributes fit on Product.

## Canonical identity

The identity key is a versioned, deterministic normalization of:

```text
normalized brand | protected base model identity | normalized known season
```

Known different seasons are always different identities. Protected identity
suffixes such as Pro, Plus, Ultra, Team, Carbon, LTD, Limited, X, Kids, Youth,
Women and `2.0` remain part of the model identity. Width-marker removal is
allowed only for evidence classified by the approved family matcher; it is not
a general-purpose name cleanup.

Automatic family creation requires a known normalized season. A REVIEW pair
with a missing season cannot be manually grouped until the operator supplies
and verifies the family season.

**Slug policy:** use the clean base non-Wide Product slug when it belongs to the
candidate family. A cross-table collision is allowed only with a Product that
will be a member of that family. If the slug is already owned by another family
identity, try `<base-slug>-<normalized-season>`. If that also collides, stop the
candidate and require a manually chosen slug; never append a best-effort numeric
suffix.

Example:

```text
identity: bataleon | beyond medals | 2024/2025
family slug: bataleon-beyond-medals
base offer: bataleon-beyond-medals
alias offer: bataleon-beyond-medals-wide
```

## Family membership and provenance

The initial supported membership methods are:

- `audit-high-v1`: deterministic Task012B-compatible HIGH evidence;
- `manual`: an operator-approved assignment or separation.

The initial backfill assigns role `base` to the clean non-Wide record and role
`wide` only to the explicit terminal-Wide member. Future sources can use `other`
for another genuine offer of the same family.

`family_match_confidence` records `high` for automatic HIGH assignments and
`reviewed` for manual decisions. `family_match_reason` records a deterministic
human-readable explanation, including audit rule version and evidence. The
timestamp is evidence metadata, not identity.

Manual precedence is absolute for membership:

- a manually assigned and locked Product is never moved by refresh;
- a manually blocked Product (`family_id=null`, override true) is never
  auto-grouped;
- an auto assignment may be converted to a manual assignment without changing
  the Product or family identity;
- no Product may belong to two families.

## Size-variant identity

Within one database snapshot, the exact authoritative row identity is:

```text
product_sizes.id + product_sizes.product_id
```

The importer deletes and recreates ProductSize rows, so that UUID is not a
stable external identifier across refreshes. Cross-refresh diagnostics use:

```text
offer slug
+ normalized raw source label
+ size_cm
+ width_type
+ waist_width_mm
```

This tuple is a comparison key, not a dedupe instruction. If two rows collide
on the entire tuple, reconciliation reports the collision and retains both
until source data is reviewed. No unique ProductSize constraint is introduced
in the first migration.

The canonical read model always carries `sourceSizeId`, `offerId`, `offerSlug`,
raw label and physical attributes. Therefore regular `159` and wide `159` are
independently eligible, scoreable, displayable and routable even when
`size_cm` is identical.

## W display-label policy

Raw imported labels remain byte-for-byte source data. Presentation follows this
order:

1. If the raw label explicitly contains a terminal W size designation, present
   that designation after normal display cleanup.
2. Otherwise, derive `<numeric-size>W` only when the member role is `wide`, that
   role came from explicit Wide listing evidence or manual confirmation, and
   the exact size has `width_type=wide`.
3. Otherwise use the existing raw/fallback size label without W.

This makes Beyond Medals `161 cm` and `164 cm` display as `161W` and `164W`
without changing the database. A base-offer `159 / 257 / mid-wide` remains
`159`. `mid-wide` alone never implies W.

`rawSizeLabel` remains available for source comparison and analytics even when
`displaySizeLabel` is derived.

## Offer-specific routing

**Decision:** retain Option A, `/go/<source-product-slug>`.

The slug in `/go` continues to mean the exact Product/store offer. This reuses
current affiliate resolution, does not expose merchant URLs in component props,
keeps every existing outbound URL valid and ensures a selected Wide size routes
to the Wide offer.

Routing rules by context:

- **Recommendation:** use `selectedSize.offerSlug`. A legacy stored result that
  lacks offer provenance falls back to `match.product.slug`.
- **Size-specific Board Detail action:** use the owning size's `offerSlug`.
- **Generic Catalog action:** use the canonical item's `defaultOfferSlug`.
- **Generic Board Detail action:** use the same default-offer rule.

The default offer is selected deterministically from offers that are active and
have at least one available size:

1. lowest positive `price_from`;
2. `base` role on a price tie;
3. most recent `source_checked_at`;
4. lexical Product slug.

If no offer is fulfillable, the family can remain visible as unavailable, but a
generic outbound CTA is not rendered. The architecture does not route a family
slug through `/go` and does not add an `offer` query parameter.

## Analytics contract

The event remains `product_clicked`. Both client tracking and the `/go` route
must eventually emit the same additive identity fields:

```text
board_slug       = canonical family slug
offer_slug       = source Product slug used by /go
destination_url  = resolved offer destination
source           = existing source/from value
placement        = existing placement
size_cm          = selected numeric size or null
size_label       = canonical display label or null
source_size_label = raw imported label or null
width_type       = selected width type or null
```

For an ungrouped singleton, `board_slug` and `offer_slug` both use the Product
slug. For old clients, absent additive fields remain acceptable. The `/go`
handler should derive family identity server-side from the resolved Product,
rather than trusting a caller-provided family slug.

## Catalog read model

Catalog reads one item per active family plus one singleton fallback per active
ungrouped Product. REVIEW and KEEP_SEPARATE records therefore remain separate
until approved.

Aggregation rules are:

- sizes are the ordered union of exact member ProductSize rows, never deduped by
  `size_cm`;
- filters inspect the union, so Beyond Medals matches regular, mid-wide and wide;
- family availability is true when any active member has an available size;
- family activity is true when any member Product is active;
- `priceFrom` is the minimum positive `price_from` among active member offers;
- media order is base offer primary/gallery first, then other active members by
  role and slug, then inactive historical member media only as fallback;
- media URLs are trimmed and deduplicated without image processing;
- canonical specs come from the family precedence contract, not from averaging
  members;
- sorting and pagination consume the aggregated fields without changing their
  current semantics.

One HIGH family produces one card. The initial evidence therefore changes 98
HIGH Product cards into 49 canonical identities while leaving REVIEW records
untouched.

## Board Detail contract

`/boards/<family-slug>` is the only indexable page for a grouped family. It
shows canonical identity/specs, consolidated base-first gallery, family price
and all exact size variants. Equal numeric sizes with different offer/width/
waist evidence remain separate rows and receive different display labels where
supported.

Each size row retains offer provenance for a future exact store action. The
page-level generic CTA uses `defaultOfferSlug`; it does not claim that every
size is available at that destination.

`getProductBySlug()` should eventually be split into canonical lookup and offer
alias resolution rather than returning a fabricated Product. Related models
must return canonical identities and exclude the current family, not merely one
member Product.

## Recommendation engine contract

The engine receives one canonical recommendation item per family, containing
the exact enriched size variants from every eligible active offer. It continues
to:

1. filter physical eligibility per exact size;
2. score each eligible size independently;
3. choose the best size per canonical item;
4. rank canonical items;
5. apply the existing recommendation and alternative thresholds.

No length, width, waist, weight, shape, flex, style, readiness or ranking score
changes. `ALGORITHM_VERSION` remains `v1.6.3`; catalog identity migration alone
does not justify a scoring-version bump.

The future recommendation input uses a dedicated canonical projection rather
than pretending a family owns one affiliate URL. Its readiness flag is derived
from canonical spec completeness plus at least one valid active member offer,
but feeds the same existing score contribution. A selected match carries
`offerSlug`, raw label and display label from the exact winning size.

Result UI builds `/go/<offerSlug>`. Serialized legacy results without
`offerSlug` remain usable through the Product-slug fallback. A family can occupy
at most one recommendation slot even if Regular and Wide are separate store
listings.

## Trust/provenance implications

Family trust describes canonical snowboard specifications; offer trust
describes source/store data, routing and current availability. They must remain
distinguishable.

Canonical spec precedence is:

1. family data verified against an official non-store source;
2. explicit manual family override;
3. strongest trusted compatible member using existing trust rules;
4. deterministic base offer fallback.

Within tiers, prefer the base member, then the latest checked source, then
lexical slug. Categorical disagreements are never averaged. If an import causes
a conflict in scoring-critical metadata, keep the prior canonical family data,
mark the family for review and do not silently change identity or split it.

The first implementation should adapt existing trust labels rather than invent
a new numeric trust algorithm. Offer/source details remain available on size or
store actions even when the family has stronger canonical evidence.

## Import refresh behavior

`catalog:refresh` remains offer-first and becomes a two-stage operation:

1. Refresh Products and replace their ProductSize rows using current logic.
   Family columns are omitted from importer updates and therefore preserved.
2. Run family reconciliation in its own transaction after the Product refresh.

Reconciliation precedence is:

1. preserve manual assignments and manual blocks;
2. preserve compatible existing `audit-high-v1` assignments;
3. flag, but do not move, an existing assignment whose evidence drifted;
4. assign only currently unassigned products that satisfy the approved HIGH
   rule with the same known season;
5. leave REVIEW and KEEP_SEPARATE untouched;
6. retain membership on inactive historical offers;
7. derive family active state from current members.

The reconcile transaction is deterministic and idempotent. A failure rolls back
family changes without rolling back or deleting refreshed source offers. The
refresh command reports that canonical reconciliation failed so deployment or
publication can be stopped and reviewed.

## Admin/manual override behavior

The first admin surface needs only family membership control, not a full family
content management system. It must show:

- family identity and canonical slug;
- members, roles, seasons, sources and affiliate hosts;
- match method, confidence, reason and conflict flags;
- actions to approve/assign, change role, lock, ungroup/block and remove a
  manual block.

A manual assignment sets `family_match_method=manual`, confidence `reviewed`
and `family_manual_override=true`. Manual ungroup/block clears `family_id` and
role while retaining the override and reason. Refresh never reverses either.

Canonical content editing can be added later. Until then, verified official
family metadata is created by controlled migration/maintenance tooling, and the
read model falls through the documented precedence.

## SEO and old-route redirects

Route resolution uses this order:

1. exact active family slug -> render canonical family page;
2. Product slug belonging to an active family -> permanent `308` redirect to
   that family slug;
3. active ungrouped Product slug -> render singleton fallback page;
4. otherwise -> current not-found behavior.

The base Product slug may equal the family slug; family lookup first prevents a
redirect loop. The old Wide route remains resolvable because the Product row is
retained, including when that member later becomes inactive while another family
offer remains active.

Canonical metadata must identify the family URL. Sitemap publishes each active
family once and active ungrouped Products once, excluding grouped Product
aliases. Existing internal catalog/result links move to family slugs. Search
engines reaching an indexed Wide URL receive the permanent redirect rather than
a duplicate page or 404.

## Migration phases

### Phase 1 — Schema and membership foundation

Add `model_families`, nullable Product membership fields, constraints, indexes
and schema-capability detection. Do not create families or change reads.

**Rollback:** drop the unused nullable columns and empty table, or revert the
migration before any backfill. Product behavior is unchanged.

### Phase 2 — HIGH dry-run and backfill

Build a versioned command that reuses the audit normalization, prints a complete
dry-run and transactionally creates exactly the approved HIGH families. Initial
expected result: 49 families, 98 assigned Products, 15 REVIEW untouched.

Dry-run and apply use deterministic brand/model/season/slug ordering. Apply
acquires a dedicated advisory lock and performs all family creation and Product
assignment in one transaction. An existing family and membership are an
idempotent no-op only when identity, slug, member set, roles and provenance all
match the proposed state.

Apply aborts the whole transaction, rather than partially merging, when a family
slug maps to another identity, known seasons conflict, a Product already belongs
to another family, a manual assignment/block conflicts, normalized brand/base
model differs, a Product appears in two candidates, or the expected candidate
or source-record counts changed since dry-run. REVIEW and KEEP_SEPARATE entries
are never mutations in this command.

**Rollback:** clear only non-manual `audit-high-v1` memberships and delete only
families created by that run after verifying no manual membership uses them.

### Phase 3 — Refresh reconciliation

Make import upserts explicitly preserve family columns and add post-refresh
reconciliation with manual-lock precedence and conflict reporting.

**Rollback:** disable the reconciliation step; existing family assignments stay
stored and source refresh continues using the legacy path.

### Phase 4 — Canonical read model

Add family/offer queries and canonical adapters alongside current Product
queries. Validate counts, size union, price, media and default-offer selection.
Keep public consumers on legacy queries.

**Rollback:** stop calling the canonical query path. No data rollback is needed.

### Phase 5 — Store routing and analytics provenance

Keep `/go/<offer-slug>`, add server-derived family identity and additive
`offer_slug`/raw-label analytics fields. Add legacy payload fallbacks.

**Rollback:** revert the additive analytics fields and continue resolving the
same Product slug route. Existing outbound links remain valid.

### Phase 6 — Catalog, Board Detail, redirects and sitemap

Switch Catalog and Board Detail to canonical items, add exact size provenance,
permanent member redirects and canonical sitemap entries. Keep a guarded legacy
read path for rapid rollback.

**Rollback:** restore legacy Product queries/routes and stop issuing member
redirects. Product rows and old URLs still exist.

### Phase 7 — Recommendation canonical input

Feed canonical items and enriched exact sizes to the unchanged v1.6.3 scoring
pipeline. Route the chosen size through its offer slug and retain legacy session
fallbacks.

**Rollback:** load legacy Products into the same engine. No score or algorithm
rollback is required.

### Phase 8 — Observation and controlled cleanup

Monitor family counts, duplicate public identities, redirect traffic, click
payload completeness, selected-size offer routing and reconciliation conflicts.
Begin manual REVIEW processing only after HIGH behavior is stable. Remove the
guarded legacy read path in a later explicit task, not during rollout.

**Rollback:** pause REVIEW work and retain the dual read path. No source data is
deleted.

## Rollback strategy

The rollout is additive and recoverable at every phase:

- Product and ProductSize remain the authoritative offer data and are never
  destructively merged or deleted by canonicalization.
- Nullable membership allows an immediate return to independent Product cards.
- Auto-generated mappings are identifiable by method/version and can be removed
  without touching manual decisions.
- Consumer rollout retains the legacy Product query until observation is clean.
- `/go/<offer-slug>` remains stable before, during and after rollout.
- Old Product board URLs remain present as data-backed aliases, so redirect
  behavior can be reverted without reconstructing records.

Any rollback script must run a dry-run, report affected family/Product counts,
refuse to touch manual overrides and execute changes in one transaction.

## Alternatives rejected

### Alternative 1 — Destructive merge into Product

Rejected. Choosing one Product as the model and copying sibling sizes into it
would lose or obscure variant-specific affiliate routes, availability, source
provenance and images. It would also make Wide-size routing unsafe and complicate
future multi-store growth.

### Alternative 2 — Canonical family above existing Products

Accepted. It is the smallest model that separates public identity from offer
fulfillment, preserves all existing source records, supports exact size routing
and fixes duplicate Catalog, Board Detail, SEO and recommendation identities.

### Alternative 3 — Presentation-only Catalog dedupe

Rejected. Client-side grouping would leave duplicate Board Detail pages,
fragmented SEO and analytics, duplicate recommendation slots and no safe mapping
from a selected size to its affiliate offer.

### Alternative 4 — Full commerce schema

Rejected for the MVP. Separate merchant, SKU, inventory, offer, price-history
and family-size tables may become useful later, but current requirements are
fully supported by family -> Product offer -> ProductSize.

## Risks / unresolved questions

No architectural decision is blocking implementation. The remaining risks are
operational evidence work:

- 15 REVIEW families require manual validation and are intentionally excluded
  from automatic backfill.
- Import metadata may drift after grouping; reconciliation must surface rather
  than silently resolve conflicts.
- Exact duplicate full size tuples are not currently prevented by schema and
  require source review if observed.
- Canonical metadata source quality varies; families without official evidence
  must retain a visible review/trust state.
- Existing client-stored recommendation results lack `offerSlug`; the explicit
  Product-slug fallback must remain until old sessions naturally expire.
- The family read path and redirect volume need observation before legacy query
  removal.

These do not justify weakening season boundaries, auto-grouping REVIEW records,
rewriting raw labels or introducing destructive merge behavior.

## Exact next implementation task

Proceed to **Task 012D — Model Family Schema & Membership Foundation**.

That task must be limited to:

- additive `model_families` DDL;
- nullable Product membership/provenance columns, checks and indexes;
- database column-support detection and schema tests;
- read-only validation that existing Products and ProductSizes are unchanged.

Task012D must not backfill families, change public catalog queries, alter routes,
modify analytics payloads, switch Catalog/Board Detail/Recommendation consumers,
or access merchant URLs. Backfill begins only in the following independently
reviewable task.

# Catalog model-family refresh reconciliation

## Purpose and result

Task 012F adds a reusable, fail-closed reconciliation stage after the catalog
audit. The implementation was verified against repository baseline
`ef8008d1eb7846ef246b312237e5a4a01296b1c3` and the live catalog on
`2026-08-09T07:24:25.229Z`.

The current state is a complete no-op: 49 compatible automatic families, no
historical pairs, no new HIGH pairs, no metadata refreshes and no blocking
conflicts. A read-only preview, two direct APPLY runs and the package command
all reached the same result. No importer, schema, runtime consumer or source
catalog field was changed.

## Source and family evidence

| Evidence | Before | After |
| --- | ---: | ---: |
| Products | 453 | 453 |
| Active Products | 405 | 405 |
| ProductSizes | 1,406 | 1,406 |
| Maximum Product `updated_at` | `2026-04-17 20:01:10.302949+00` | `2026-04-17 20:01:10.302949+00` |
| Product checksum | `024ea105c85ae7ae0a532a506c5fe351` | `024ea105c85ae7ae0a532a506c5fe351` |
| ProductSize checksum | `f24f13ac725b2ff288ff2b09051cd5c8` | `f24f13ac725b2ff288ff2b09051cd5c8` |
| Families | 49 | 49 |
| Memberships | 98 | 98 |
| Base / Wide | 49 / 49 | 49 / 49 |
| Manual overrides / blocks | 0 / 0 | 0 / 0 |
| Family checksum | `b796c4b4b3d14a4720145285d106a753` | `b796c4b4b3d14a4720145285d106a753` |
| Membership checksum | `314240bdf6f87ac4216f332b1d96b9c0` | `314240bdf6f87ac4216f332b1d96b9c0` |

The source audit was recalculated inside the reconciliation transaction and
returned 49 HIGH, 15 REVIEW and 34 KEEP_SEPARATE families.

## Deterministic planner policy

The pure planner consumes the active source audit, Task012E-compatible HIGH
proposals, every Product (including inactive and manually managed records), and
the complete current family state. It classifies the result into compatible
existing families, retained history, manual decisions, safe new actions,
informational REVIEW/KEEP_SEPARATE records and blocking conflicts.

An active automatic family is compatible only when its identity key, slug,
display brand/model, season, member Product IDs and base/wide roles exactly
match the current HIGH proposal. Identity changes are drift; reconciliation
does not rename or move a family automatically.

## Manual precedence and historical retention

Manual assignment and an unassigned Product with
`family_manual_override=true` are authoritative. If either Product in a new
HIGH pair is manually managed, the entire candidate is skipped without an
automatic mutation and without treating the operator decision as corruption.

If one or both members of an existing automatic pair become inactive, the
family and both memberships are retained as history. Inactivity does not clear
membership, move a Product, update canonical metadata or create persisted
family activity state.

## Blocking drift and collision policy

Reconciliation fails before writes when it finds a missing member, partial
automatic family, wrong role, incompatible provenance, active automatic family
outside current HIGH evidence, identity/slug/display drift, attempted Product
movement, duplicate HIGH membership or an existing identity/slug collision.
These states require operator review; they are never structurally repaired by
the automatic stage.

## Canonical metadata policy

Only a structurally compatible active family with
`canonical_source_kind=fallback-member` may receive a metadata-only refresh.
The allowed non-identity fields are descriptions, style, skill, flex, board
line, shape, camber, source name/URL/check date and data status. Identity key,
slug, display identity, season and source kind are immutable here.

`verified-official`, `manual` and `trusted-member` metadata is always protected.
Existing memberships and `family_matched_at` are never rewritten. A new pair,
when safely proposed, receives one shared transaction timestamp.

## Transactions, locks and writes

PREVIEW runs in `REPEATABLE READ READ ONLY` and writes only the ignored local
report `reports/model-family-reconciliation.json`. APPLY runs in one
`SERIALIZABLE` transaction and takes advisory transaction locks in this fixed
order:

1. `edgefit:model-family-backfill:v1`
2. `edgefit:model-family-reconciliation:v1`

The only permitted writes are a new HIGH family insert, assignment of its two
membership column sets, or an approved fallback metadata update. The planner
is rebuilt after any mutation and must return no conflicts or remaining
actions before commit. Immediate Product/ProductSize snapshots are compared
inside the same transaction.

For the verified current state every APPLY reported:

```text
families inserted: 0
Products assigned: 0
families metadata-updated: 0
post-state idempotency: PASS
```

## Refresh integration and operational rollback

`catalog:refresh` remains fail-fast and now executes:

```text
import:stores → catalog:repair-waist → audit:catalog → catalog:reconcile-families
```

The importer remains the owner of source offer fields and sizes. The
reconciliation stage is separately callable as
`npm run catalog:reconcile-families` and does not invoke an import itself.

Operational rollback for Task012F is removal of the final reconciliation stage
from `catalog:refresh` and removal of its package command. Existing Task012E
families and memberships remain intact; there is no schema or data rollback in
this task.

## Beyond Medals continuity

The Bataleon Beyond Medals family remained unchanged:

- family ID: `b9aacc7b-1a3f-47ac-80ec-b0e7bf6d409e`;
- identity: `v1|bataleon|beyond medals|2024/2025`;
- canonical slug: `bataleon-beyond-medals`;
- base Product: `b5ac4706-7c9c-47ab-aa37-756c49a8742c`;
- wide Product: `db40f307-6245-42eb-ae24-614c4b762cd9`;
- both `family_matched_at`: `2026-08-09 06:29:28.058+00`.

The NOOP family and membership checksums prove that roles, IDs and matched
timestamps were not rewritten.

## Verification conclusion

The current 49-family foundation is compatible with the refreshed audit and
the new stage is idempotent. REVIEW and KEEP_SEPARATE records remain
informational only. Public Catalog, Board Detail, Recommendation, `/go`,
analytics and algorithm `v1.6.3` remain on their existing legacy Product paths.

The exact next task is `Task 012G — Canonical Model Family Read Model`.

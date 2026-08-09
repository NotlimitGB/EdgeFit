# Catalog Model Family HIGH Backfill

## Run identity and verdict

- Baseline repository SHA: `16c8f01d5363eeafaaa4b139e5d409a35ca13cad`
- Task commit SHA: pending until the evidence commit is created
- Apply-authorizing preview timestamp: `2026-08-09T06:29:16.255Z`
- Post-apply read-only preview timestamp: `2026-08-09T06:34:33.943Z`
- Apply transaction timestamp: `2026-08-09 06:29:28.058+00`
- Audit rule: `audit-high-v1`
- Approved identity fingerprint: `188fe8e3a9972149ff23e73d45d0a8c770d625afbbed83a95c4c658f0f7eb760`
- Plan SHA-256: `1047d383d5d5615811ad2c50a3ee1e00b1347957a4411a5b4a537b2c6d7a5538`
- Verdict: **PASS — 49 HIGH families created and 98 source Products assigned.**

This was an additive canonicalization backfill. Product rows remain source/store
offers and ProductSize rows remain attached to their original Products. No
public application consumer was switched to the family layer.

## Safety workflow

PREVIEW ran in `REPEATABLE READ READ ONLY`, validated the Task012D foundation,
recomputed the approved audit set and wrote the ignored plan artifact only after
the database transaction completed. It reported 49 HIGH families, 98 unique
HIGH Products, 15 REVIEW relationships, 34 KEEP_SEPARATE relationships and zero
exact/cross-store duplicates.

The first APPLY transport attempt disconnected before completion. A separate
read-only foundation check then proved that PostgreSQL had rolled the transaction
back completely: families and assignments remained zero and both legacy
checksums were unchanged. The mutation was reduced to two parameterized bulk
statements and the subsequent APPLY completed under the dedicated advisory lock
in one `SERIALIZABLE` transaction.

Before mutation, APPLY reloaded the catalog, reran the unchanged audit matcher,
rebuilt the logical plan under the lock and matched it byte-for-byte to the
saved preview hash. Post-validation completed before commit.

## Database before and after

| Metric | Before | After |
| --- | ---: | ---: |
| Products | 453 | 453 |
| Active Products | 405 | 405 |
| ProductSizes | 1,406 | 1,406 |
| Model families | 0 | 49 |
| Products with `family_id` | 0 | 98 |
| Base memberships | 0 | 49 |
| Wide memberships | 0 | 49 |
| `audit-high-v1` memberships | 0 | 98 |
| High-confidence memberships | 0 | 98 |
| Manual overrides | 0 | 0 |

`max(products.updated_at)` remained
`2026-04-17 20:01:10.302949+00`.

| Legacy evidence | Before | After |
| --- | --- | --- |
| Product checksum | `024ea105c85ae7ae0a532a506c5fe351` | `024ea105c85ae7ae0a532a506c5fe351` |
| ProductSize checksum | `f24f13ac725b2ff288ff2b09051cd5c8` | `f24f13ac725b2ff288ff2b09051cd5c8` |

The Product checksum excludes the new family membership columns and includes
all existing source/store fields, including slugs, prices, affiliate URLs,
media, source metadata and `updated_at`. The ProductSize checksum includes IDs,
ownership, raw labels and all physical/availability fields.

## Created HIGH families

Canonical display fields below are the exact base Product display values;
normalized lowercase values exist only in `identity_key` and matching evidence.

| Brand | Model | Season | Base offer | Wide offer |
| --- | --- | --- | --- | --- |
| Bataleon | BEYOND MEDALS | 2024/2025 | `bataleon-beyond-medals` | `bataleon-beyond-medals-wide` |
| Bataleon | BLOW | 2025/2026 | `bataleon-blow` | `bataleon-blow-wide` |
| Bataleon | DISASTER + | 2025/2026 | `bataleon-disaster-plus` | `bataleon-disaster-plus-wide` |
| Bataleon | EVIL TWIN + | 2025/2026 | `bataleon-evil-twin-plus` | `bataleon-evil-twin-plus-wide` |
| Bataleon | GOLIATH | 2025/2026 | `bataleon-goliath` | `bataleon-goliath-wide` |
| Bataleon | THUNDER | 2022/2023 | `bataleon-thunder` | `bataleon-thunder-wide` |
| Bataleon | THUNDERSTORM | 2025/2026 | `bataleon-thunderstorm` | `bataleon-thunderstorm-wide` |
| Bataleon | TORNADO X BEYOND MEDALS | 2025/2026 | `bataleon-tornado-x-beyond-medals` | `bataleon-tornado-x-beyond-medals-wide` |
| Bataleon | TURBO | 2025/2026 | `bataleon-turbo` | `bataleon-turbo-wide` |
| Bataleon | WHATEVER X ROP VAN MIERLO | 2025/2026 | `bataleon-whatever-x-rop-van-mierlo` | `bataleon-whatever-x-rop-van-mierlo-wide` |
| Drake | DF | 2025/2026 | `drake-df` | `drake-df-wide` |
| Drake | GT | 2023/2024 | `drake-gt` | `drake-gt-wide` |
| Drake | SQUAD | 2025/2026 | `drake-squad` | `drake-squad-wide` |
| Drake | TEAM | 2025/2026 | `drake-team` | `drake-team-wide` |
| K2 | ANTIDOTE | 2025/2026 | `k2-antidote` | `k2-antidote-wide` |
| K2 | COURIER | 2025/2026 | `k2-courier` | `k2-courier-wide` |
| K2 | GATEWAY POP | 2025/2026 | `k2-gateway-pop` | `k2-gateway-pop-wide` |
| K2 | MANIFEST | 2025/2026 | `k2-manifest` | `k2-manifest-wide` |
| K2 | PASSPORT | 2025/2026 | `k2-passport` | `k2-passport-wide` |
| K2 | WORLD PEACE | 2025/2026 | `k2-world-peace` | `k2-world-peace-wide` |
| Nitro | PANTERA | 2025/2026 | `nitro-pantera` | `nitro-pantera-wide` |
| Nitro | T1 X FFF | 2023/2024 | `nitro-t1-x-fff` | `nitro-t1-x-fff-wide` |
| Nitro | T1 | 2025/2026 | `nitro-t1` | `nitro-t1-wide` |
| Nitro | TEAM GULLWING | 2022/2023 | `nitro-team-gullwing` | `nitro-team-gullwing-wide` |
| Ride | AGENDA | 2025/2026 | `ride-agenda` | `ride-agenda-wide` |
| Ride | ALGORYTHM | 2021/2022 | `ride-algorythm` | `ride-algorythm-wide` |
| Ride | BENCHWARMER | 2025/2026 | `ride-benchwarmer` | `ride-benchwarmer-wide` |
| Ride | BERZERKER | 2025/2026 | `ride-berzerker` | `ride-berzerker-wide` |
| Ride | BURNOUT | 2025/2026 | `ride-burnout` | `ride-burnout-wide` |
| Ride | DEEP FAKE | 2025/2026 | `ride-deep-fake` | `ride-deep-fake-wide` |
| Ride | MANIC | 2025/2026 | `ride-manic` | `ride-manic-wide` |
| Ride | MODERATOR | 2025/2026 | `ride-moderator` | `ride-moderator-wide` |
| Ride | SHADOWBAN | 2025/2026 | `ride-shadowban` | `ride-shadowban-wide` |
| Ride | SMOKESCREEN | 2025/2026 | `ride-smokescreen` | `ride-smokescreen-wide` |
| Ride | TWINPIG | 2025/2026 | `ride-twinpig` | `ride-twinpig-wide` |
| Ride | WILDLIFE | 2021/2022 | `ride-wildlife` | `ride-wildlife-wide` |
| Ride | ZERO | 2021/2022 | `ride-zero` | `ride-zero-wide` |
| Rome | AGENT | 2025/2026 | `rome-agent` | `rome-agent-wide` |
| Rome | ARTIFACT | 2025/2026 | `rome-artifact` | `rome-artifact-wide` |
| Rome | BONELESS | 2025/2026 | `rome-boneless` | `rome-boneless-wide` |
| Rome | FREAKER | 2025/2026 | `rome-freaker` | `rome-freaker-wide` |
| Rome | GANG PLANK | 2024/2025 | `rome-gang-plank` | `rome-gang-plank-wide` |
| Rome | MECHANIC | 2025/2026 | `rome-mechanic` | `rome-mechanic-wide` |
| Rome | PARTY MOD | 2025/2026 | `rome-party-mod` | `rome-party-mod-wide` |
| Rome | RAVINE PRO | 2025/2026 | `rome-ravine-pro` | `rome-ravine-pro-wide` |
| Rome | RAVINE | 2025/2026 | `rome-ravine` | `rome-ravine-wide` |
| Rome | RENE-GADE | 2025/2026 | `rome-rene-gade` | `rome-rene-gade-wide` |
| Rome | STALE CREWZER | 2025/2026 | `rome-stale-crewzer` | `rome-stale-crewzer-wide` |
| Rome | WARDEN | 2025/2026 | `rome-warden` | `rome-warden-wide` |

Every family has exactly two members, one `base` and one `wide`. No family was
created from REVIEW or KEEP_SEPARATE evidence, and no Product belongs to two
proposals.

## Beyond Medals verification

- Family ID: `b9aacc7b-1a3f-47ac-80ec-b0e7bf6d409e`
- Family slug: `bataleon-beyond-medals`
- Display identity from base Product: `Bataleon / BEYOND MEDALS`
- Season: `2024/2025`
- Base member: `bataleon-beyond-medals`
- Wide member: `bataleon-beyond-medals-wide`
- Base sizes: `151 cm / 248 / regular`, `156 cm / 254 / regular`,
  `159 cm / 257 / mid-wide`
- Wide sizes: `161 cm / 264 / wide`, `164 cm / 264 / wide`
- Raw `161W` or `164W` labels invented: no
- Affiliate URLs changed: no, proven by the unchanged legacy Product checksum

The family display casing intentionally preserves the current base Product;
the backfill does not rewrite source model names.

## Idempotency and rollback

The immediate second APPLY reacquired the advisory lock, rebuilt and matched
the saved plan, classified all 49 families and 98 memberships as exact, and
returned:

```text
families inserted: 0
Products updated: 0
result: NOOP
```

The receipt SHA-256 remained
`358DEAFA82B1E0A08940563701611E796A3E18EBB79BC751C33C72DF72D8E393`;
therefore the second run did not rewrite evidence. All memberships retain the
single first-run `family_matched_at` value.

Guarded `--rollback` support is implemented. It requires the matching plan and
receipt, exact automatic provenance, no manual overrides or foreign members,
and one transaction under the same advisory lock. **Rollback was not executed.**

## Regression evidence and runtime boundary

The source audit after APPLY remained:

```text
49 HIGH / 15 REVIEW / 34 KEEP_SEPARATE / 0 duplicates
```

The existing catalog audit reported no ERROR. Its two pre-existing warning
groups remain 158 records without officially trusted flex and 27 without full
shape/camber metadata.

- Importer changed: no
- Schema changed: no
- Public runtime changed: no
- Catalog switched to families: no
- Board Detail switched to families: no
- `/go` routing changed: no
- Analytics changed: no
- Recommendation changed: no
- Algorithm version remains `v1.6.3`

Local ignored evidence:

- `reports/model-family-backfill-plan.json`
- `reports/model-family-backfill-receipt.json`
- `reports/catalog-model-family-audit.json`
- `reports/catalog-audit.json`

Next recommendation: **Task 012F — Model Family Refresh Reconciliation**.

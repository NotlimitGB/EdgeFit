# Catalog Model Family Audit

## Purpose and run identity

This document records a read-only audit of active EdgeFit catalog records that may represent Regular/Wide variants of the same snowboard model family.

- Baseline commit: `7412a81002944fcf79bb83b23837dd4698ddb362`
- Audit timestamp: `2026-08-08T19:45:22.016Z`
- Command: `node --env-file=.env.local scripts/audit-model-families.mjs`
- Database mode: `ISOLATION LEVEL REPEATABLE READ READ ONLY`
- Database write attempted: no
- Database snapshot changed during audit: no
- Full local evidence: `reports/catalog-model-family-audit.json` (gitignored)

The audit discovers candidates; it does not merge Product records or certify a future schema.

## Catalog totals and verdict

| Metric | Result |
| --- | ---: |
| Products | 453 |
| Active products | 405 |
| Product sizes | 1,406 |
| Max product `updated_at` | `2026-04-17 20:01:10.302949+00` |
| HIGH_CONFIDENCE_WIDTH_FAMILY | 49 |
| REVIEW_WIDTH_FAMILY | 15 |
| KEEP_SEPARATE | 34 |
| EXACT_OR_CROSS_STORE_DUPLICATES | 0 |
| Near-name safety cases | 25 |

Verdict: the catalog contains a material, consistently detectable Regular/Wide family pattern, but a Product row alone cannot safely become the canonical family because all 64 HIGH/REVIEW candidates have multiple affiliate URLs. A separate canonicalization design is justified; no automatic merge should precede that design.

## Required case: Bataleon Beyond Medals

Classification: `HIGH_CONFIDENCE_WIDTH_FAMILY`.

| Member | Stored season | Source | Affiliate route | Sizes | Width evidence |
| --- | --- | --- | --- | --- | --- |
| `bataleon-beyond-medals` | 2024/2025 | Official Bataleon Beyond Medals 23/24 | `trial-sport.ru/goods/51526/2987124.html` | 151 cm — 248 mm regular; 156 cm — 254 mm regular; 159 cm — 257 mm mid-wide | 2 regular, 1 mid-wide |
| `bataleon-beyond-medals-wide` | 2024/2025 | Official Bataleon Beyond Medals 23/24 | `trial-sport.ru/goods/51526/2989899.html` | 161 cm — 264 mm wide; 164 cm — 264 mm wide | 2 wide |

Evidence:

- same normalized brand and base model after explicit terminal `WIDE` removal;
- same stored season, source identity, riding style, skill, line, shape and camber;
- separate affiliate URLs;
- different primary images and zero shared stored image URLs;
- no duplicate `size_label`, numeric size or waist collision;
- current Wide labels are `161 cm` and `164 cm`, not `161W` and `164W`; the audit does not invent missing `W` labels;
- the shared `sourceName` says `23/24` while the stored season is `2024/2025`; this does not contradict the sibling relation, but season provenance should remain visible during canonicalization review.

## HIGH confidence width families

Every row below has the same known stored season, compatible physical metadata and size-level Wide evidence. `Same label` marks a routing/size-identity concern, not rejection of the family relation.

| Brand | Canonical candidate | Season | Product records | Stored size labels (base / width variant) | Collision note | Affiliate URLs |
| --- | --- | --- | --- | --- | --- | ---: |
| Bataleon | beyond medals | 2024/2025 | `bataleon-beyond-medals`<br>`bataleon-beyond-medals-wide` | 151 cm, 156 cm, 159 cm / 161 cm, 164 cm | none | 2 |
| Bataleon | blow | 2025/2026 | `bataleon-blow`<br>`bataleon-blow-wide` | 151 cm / 154 cm | none | 2 |
| Bataleon | disaster plus | 2025/2026 | `bataleon-disaster-plus`<br>`bataleon-disaster-plus-wide` | 148 cm, 151 cm, 154 cm, 157 cm / 153 cm, 156 cm | none | 2 |
| Bataleon | evil twin plus | 2025/2026 | `bataleon-evil-twin-plus`<br>`bataleon-evil-twin-plus-wide` | 154 cm, 159 cm / 156 cm, 159 cm | same label 159; different waist | 2 |
| Bataleon | goliath | 2025/2026 | `bataleon-goliath`<br>`bataleon-goliath-wide` | 156 cm / 164 cm | none | 2 |
| Bataleon | thunder | 2022/2023 | `bataleon-thunder`<br>`bataleon-thunder-wide` | 156 cm, 161 cm / 162 cm | none | 2 |
| Bataleon | thunderstorm | 2025/2026 | `bataleon-thunderstorm`<br>`bataleon-thunderstorm-wide` | 156 cm / 159 cm, 162 cm | none | 2 |
| Bataleon | tornado x beyond medals | 2025/2026 | `bataleon-tornado-x-beyond-medals`<br>`bataleon-tornado-x-beyond-medals-wide` | 154 cm, 156 cm, 159 cm / 164 cm | none | 2 |
| Bataleon | turbo | 2025/2026 | `bataleon-turbo`<br>`bataleon-turbo-wide` | 156 cm, 159 cm / 158 cm, 161 cm, 164 cm, 167 cm | none | 2 |
| Bataleon | whatever x rop van mierlo | 2025/2026 | `bataleon-whatever-x-rop-van-mierlo`<br>`bataleon-whatever-x-rop-van-mierlo-wide` | 144 cm, 157 cm / 159 cm, 162 cm | none | 2 |
| Drake | df | 2025/2026 | `drake-df`<br>`drake-df-wide` | 152 cm, 155 cm, 158 cm / 156 cm | none | 2 |
| Drake | gt | 2023/2024 | `drake-gt`<br>`drake-gt-wide` | 151 cm, 155 cm, 159 cm / 159 cm, 162 cm | same label 159 | 2 |
| Drake | squad | 2025/2026 | `drake-squad`<br>`drake-squad-wide` | 153 cm, 156 cm, 159 cm / 160 cm | none | 2 |
| Drake | team | 2025/2026 | `drake-team`<br>`drake-team-wide` | 156 cm, 159 cm / 160 cm | none | 2 |
| K2 | antidote | 2025/2026 | `k2-antidote`<br>`k2-antidote-wide` | 159 cm / 158 cm, 161 cm | none | 2 |
| K2 | courier | 2025/2026 | `k2-courier`<br>`k2-courier-wide` | 155 cm, 158 cm / 159 cm, 163 cm | none | 2 |
| K2 | gateway pop | 2025/2026 | `k2-gateway-pop`<br>`k2-gateway-pop-wide` | 156 cm, 159 cm / 164 cm | none | 2 |
| K2 | manifest | 2025/2026 | `k2-manifest`<br>`k2-manifest-wide` | 156 cm, 159 cm / 160 cm | none | 2 |
| K2 | passport | 2025/2026 | `k2-passport`<br>`k2-passport-wide` | 157 cm, 160 cm / 159 cm, 162 cm | none | 2 |
| K2 | world peace | 2025/2026 | `k2-world-peace`<br>`k2-world-peace-wide` | 151 cm, 154 cm / 152 cm | none | 2 |
| Nitro | pantera | 2025/2026 | `nitro-pantera`<br>`nitro-pantera-wide` | 160 cm, 163 cm / 166 cm | none | 2 |
| Nitro | t1 | 2025/2026 | `nitro-t1`<br>`nitro-t1-wide` | 155 cm / 158 cm | none | 2 |
| Nitro | t1 x fff | 2023/2024 | `nitro-t1-x-fff`<br>`nitro-t1-x-fff-wide` | 149 cm, 155 cm / 152 cm, 158 cm | none | 2 |
| Nitro | team gullwing | 2022/2023 | `nitro-team-gullwing`<br>`nitro-team-gullwing-wide` | 155 cm, 159 cm / 159 cm, 162 cm | same label 159; different waist | 2 |
| Ride | agenda | 2025/2026 | `ride-agenda`<br>`ride-agenda-wide` | 152 cm, 155 cm, 158 cm / 161 cm | none | 2 |
| Ride | algorythm | 2021/2022 | `ride-algorythm`<br>`ride-algorythm-wide` | 154 cm, 157 cm, 161 cm / 160 cm | none | 2 |
| Ride | benchwarmer | 2025/2026 | `ride-benchwarmer`<br>`ride-benchwarmer-wide` | 151 cm, 155 cm / 154 cm | none | 2 |
| Ride | berzerker | 2025/2026 | `ride-berzerker`<br>`ride-berzerker-wide` | 156 cm, 159 cm / 157 cm, 160 cm | none | 2 |
| Ride | burnout | 2025/2026 | `ride-burnout`<br>`ride-burnout-wide` | 155 cm, 158 cm / 157 cm | none | 2 |
| Ride | deep fake | 2025/2026 | `ride-deep-fake`<br>`ride-deep-fake-wide` | 157 cm, 159 cm, 162 cm / 157 cm, 161 cm | same label 157 | 2 |
| Ride | manic | 2025/2026 | `ride-manic`<br>`ride-manic-wide` | 151 cm, 154 cm, 157 cm / 158 cm, 161 cm | none | 2 |
| Ride | moderator | 2025/2026 | `ride-moderator`<br>`ride-moderator-wide` | 159 cm, 162 cm / 157 cm, 161 cm | none | 2 |
| Ride | shadowban | 2025/2026 | `ride-shadowban`<br>`ride-shadowban-wide` | 154 cm, 157 cm / 155 cm | none | 2 |
| Ride | smokescreen | 2025/2026 | `ride-smokescreen`<br>`ride-smokescreen-wide` | 158 cm, 162 cm / 157 cm | none | 2 |
| Ride | twinpig | 2025/2026 | `ride-twinpig`<br>`ride-twinpig-wide` | 148 cm, 151 cm / 156 cm | none | 2 |
| Ride | wildlife | 2021/2022 | `ride-wildlife`<br>`ride-wildlife-wide` | 157 cm / 161 cm, 166 cm | none | 2 |
| Ride | zero | 2021/2022 | `ride-zero`<br>`ride-zero-wide` | 151 cm, 155 cm / 154 cm | none | 2 |
| Rome | agent | 2025/2026 | `rome-agent`<br>`rome-agent-wide` | 148 cm, 151 cm, 154 cm, 157 cm / 158 cm | none | 2 |
| Rome | artifact | 2025/2026 | `rome-artifact`<br>`rome-artifact-wide` | 147 cm, 150 cm, 156 cm / 154 cm | none | 2 |
| Rome | boneless | 2025/2026 | `rome-boneless`<br>`rome-boneless-wide` | 150 cm, 153 cm, 156 cm, 159 cm / 157 cm, 160 cm, 163 cm | none | 2 |
| Rome | freaker | 2025/2026 | `rome-freaker`<br>`rome-freaker-wide` | 153 cm, 159 cm / 160 cm | none | 2 |
| Rome | gang plank | 2024/2025 | `rome-gang-plank`<br>`rome-gang-plank-wide` | 148 cm, 156 cm / 154 cm | none | 2 |
| Rome | mechanic | 2025/2026 | `rome-mechanic`<br>`rome-mechanic-wide` | 147 cm, 153 cm, 156 cm, 159 cm / 163 cm | none | 2 |
| Rome | party mod | 2025/2026 | `rome-party-mod`<br>`rome-party-mod-wide` | 149 cm, 152 cm, 155 cm, 158 cm / 159 cm | none | 2 |
| Rome | ravine | 2025/2026 | `rome-ravine`<br>`rome-ravine-wide` | 155 cm, 158 cm / 162 cm, 165 cm | none | 2 |
| Rome | ravine pro | 2025/2026 | `rome-ravine-pro`<br>`rome-ravine-pro-wide` | 158 cm, 162 cm / 165 cm | none | 2 |
| Rome | rene gade | 2025/2026 | `rome-rene-gade`<br>`rome-rene-gade-wide` | 153 cm, 156 cm, 159 cm / 157 cm, 160 cm | none | 2 |
| Rome | stale crewzer | 2025/2026 | `rome-stale-crewzer`<br>`rome-stale-crewzer-wide` | 154 cm, 157 cm, 160 cm / 158 cm, 164 cm | none | 2 |
| Rome | warden | 2025/2026 | `rome-warden`<br>`rome-warden-wide` | 154 cm, 157 cm / 158 cm | none | 2 |

## REVIEW width families

| Brand | Candidate | Seasons | Product records | Review reason | Stored size labels (base / variant) |
| --- | --- | --- | --- | --- | --- |
| Bataleon | evil teen | 2025/2026 / 2025/2026 | `bataleon-evil-teen`<br>`bataleon-evil-teen-wide` | Wide listing has no W label or non-regular width type | 130 cm, 135 cm, 140 cm / 140 cm |
| Bataleon | tornado x beyond medals | 2025/2026 / 2025/2026 | `bataleon-tornado-x-beyond-medals`<br>`bataleon-tornado-x-beyond-medals-mid-wide` | MID-WIDE is outside the automatic explicit-Wide rule | 154 cm, 156 cm, 159 cm / 158 cm |
| Capita | d o a | missing / missing | `capita-d-o-a`<br>`capita-d-o-a-wide` | season missing | 148–164 / 151W–163W |
| Capita | indoor survival | missing / missing | `capita-indoor-survival`<br>`capita-indoor-survival-wide` | season missing | 150–160 / 155W, 158W, 161W |
| CAPiTA | outerspace living | missing / missing | `capita-outerspace-living`<br>`capita-outerspace-living-wide` | season missing; riding style and line conflict | 148–160 / 155W–161W |
| CAPiTA | paradise | missing / missing | `capita-paradise`<br>`capita-paradise-wide` | season missing | 139–151 / 148W, 150W, 152W |
| Capita | pathfinder | missing / missing | `capita-pathfinder`<br>`capita-pathfinder-wide` | season missing | 145–157 / 153W–162W |
| Drake | df pro | 2025/2026 / 2025/2026 | `drake-df-pro`<br>`drake-df-pro-wide` | riding style and skill conflict | 152 cm, 155 cm, 158 cm / 156 cm |
| Drake | league | 2025/2026 / 2025/2026 | `drake-league`<br>`drake-league-wide` | no W label or non-regular width type | 148 cm, 152 cm, 156 cm, 159 cm / 156 cm, 159 cm |
| Drake | tao of drake | 2025/2026 / 2025/2026 | `drake-tao-of-drake`<br>`drake-tao-of-drake-wide` | no W label or non-regular width type | 145 cm, 148 cm, 150 cm, 154 cm / 154 cm |
| K2 | embassy | 2025/2026 / 2025/2026 | `k2-embassy`<br>`k2-embassy-wide` | no W label or non-regular width type | 159 cm, 162 cm / 159 cm, 162 cm |
| Nitro | t1 | 2025/2026 / 2025/2026 | `nitro-t1`<br>`nitro-t1-mid-wide` | MID-WIDE is outside the automatic explicit-Wide rule | 155 cm / 155 cm, 158 cm |
| Nitro | team pro | 2025/2026 / 2025/2026 | `nitro-team-pro`<br>`nitro-team-pro-wide` | skill conflict | 155 cm, 157 cm, 159 cm / 157 cm, 159 cm, 162 cm |
| Rome | artifact pro | 2025/2026 / 2025/2026 | `rome-artifact-pro`<br>`rome-artifact-pro-wide` | skill conflict | 153 cm, 156 cm, 159 cm / 157 cm, 160 cm |
| USD Pro | rubicon | 2022/2023 / 2022/2023 | `usd-pro-rubicon`<br>`usd-pro-rubicon-wide` | riding style conflict | 150 cm / 152 cm, 155 cm |

## KEEP-SEPARATE and near-name safety

Fourteen width-looking pairs were kept separate because their known seasons differ:

- Bataleon Disaster 2025/2026 vs Disaster Wide 2024/2025;
- Bataleon Evil Twin 2025/2026 vs Evil Twin Wide 2024/2025;
- Bataleon Fun Kink 2024/2025 vs Fun Kink Wide 2025/2026;
- Bataleon Goliath Plus 2024/2025 vs Goliath Plus Wide 2025/2026;
- Bataleon Wallie 2025/2026 vs Wallie Wide 2024/2025;
- Bataleon Whatever 2025/2026 vs Whatever Wide 2024/2025;
- Drake Urban 2021/2022 vs Urban Wide 2020/2021;
- Nitro Cheap Trills 2025/2026 vs Cheap Trills Wide 2024/2025;
- Nitro Prime Raw 2024/2025 vs Prime Raw Wide 2025/2026;
- Nitro Prime 2025/2026 vs Prime Wide 2023/2024;
- Nitro Squash 2025/2026 vs ambiguous Squash W 2022/2023;
- Nitro Team `2026` vs Team Wide 2025/2026;
- Ride Kink 2025/2026 vs Kink Wide 2021/2022;
- Rome Agent Pro 2025/2026 vs Agent Pro Wide 2024/2025.

The remaining 20 KEEP-SEPARATE cases preserve protected model identity suffixes. Representative evidence includes Disaster/Disaster Plus, Evil Twin/Evil Twin Plus, Goliath/Goliath Plus, DF/DF Pro, DF/DF Team, Café Racer/Café Racer Plus, Pencil/Pencil Plus, Optisym/Optisym Women, Team/Team Pro, Agent/Agent Pro, Artifact/Artifact Pro and Ravine/Ravine Pro. No `2.0`, Pro, Plus, Team, Women or similar suffix is removed by the audit normalizer.

The 25 near-name safety cases consist of:

- 20 protected-suffix relations linked to KEEP-SEPARATE evidence;
- one ambiguous standalone-W relation: Nitro Squash / Squash W;
- two MID-WIDE relations retained as REVIEW: Nitro T1 and Bataleon Tornado x Beyond Medals;
- two orphan explicit-Wide listings without an active base sibling: K2 Alchemist Wide and USD Pro Rhythm Wide.

No active exact/cross-store duplicates with the same normalized full name and known season were found.

## Routing and size-collision findings

- All 64 HIGH/REVIEW candidate families contain two distinct affiliate URLs; zero can safely inherit a single Product-level route.
- All 49 HIGH families currently come from the same source host within their pair, but source equality does not remove affiliate routing risk.
- The 49 HIGH families contain 98 active Product rows and could become 49 canonical identities: a theoretical reduction of 49 catalog and recommendation identities.
- Four HIGH families have overlapping labels: Evil Twin Plus `159 cm`, Drake GT `159 cm`, Nitro Team Gullwing `159 cm`, and Ride Deep Fake `157 cm`. Evil Twin Plus and Team Gullwing also store different waists under the same label.
- Six REVIEW families have exact label overlap: Evil Teen, Drake League, Tao of Drake, K2 Embassy, Nitro T1/Mid-Wide and Nitro Team Pro.
- CAPiTA Indoor Survival stores numeric 158 as both `158` and `158W`; Pathfinder stores 153/155/157 as both regular and W labels. These are valid distinct variants because `size_label` differs, even though `size_cm` is equal.
- None of the 49 HIGH families currently has an explicit W-bearing size label; their width evidence comes from stored width type and waist. Five REVIEW families do retain W labels. A future canonicalizer must preserve source labels and must not synthesize W labels from numeric size alone.

## Existing catalog audit baseline

`npm run audit:catalog` completed without ERROR failures:

- 405 active / 453 total products;
- all core size, waist, availability, price, image and store-link checks passed;
- warning: 158 active products lack stiffness confirmed by an official non-store source;
- warning: 27 active products lack shape or camber;
- these warnings predate the model-family audit and were not modified.

## Architectural conclusion and next recommendation

A single Product row cannot safely represent a canonical family: it owns one affiliate URL, while every discovered candidate family has variant-specific store routes. Flattening members would either lose routing or make size selection point to the wrong ecommerce record.

The evidence supports designing, but not yet implementing, this separation:

```text
Canonical Model Family
  -> model + season identity
  -> size variants preserving exact size_label
  -> originating Product / source-store offer
  -> affiliate route belonging to that offer
```

Two viable design options should be compared next:

1. Introduce an explicit canonical family entity plus member Product/store offers. This cleanly preserves existing Product routes and supports multiple stores.
2. Retain Product as the store offer and add an audit-approved family key/grouping layer. This is smaller initially, but needs careful ownership of shared model metadata and size collisions.

The first option is structurally safer for cross-store growth; the second may be a migration bridge. The audit does not finalize either schema.

Next recommendation: **Proceed to Catalog Model Family Canonicalization design.** Manual verification remains required for the 15 REVIEW cases and collision handling, but it does not block designing the family/offer boundary supported by 49 HIGH candidates.

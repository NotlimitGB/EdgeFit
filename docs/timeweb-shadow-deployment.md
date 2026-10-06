# SnowDex: Timeweb production cutover package (036F)

## Current authoritative configuration (036F, 2026-10-06)

This package does not authorize DNS changes. The owner performs cutover only
after exact candidate acceptance. Branch: `task/036D-timeweb-shadow-deployment`;
036F base `d306a6ab0d6d0932a795435638dd8253e749d879`. Main stays
`4c6c22ad7b472dc12bfadde75482136da66c8071`. Historical shadow instructions below
are retained for provenance and are **not the production configuration**.

| Independent policy | Ordinary Vercel | Timeweb production | Explicit shadow |
| --- | --- | --- | --- |
| SNOWDEX_STANDALONE | unset/false | true | true for Docker |
| NEXT_PUBLIC_HOSTING_PROVIDER | unset or vercel | timeweb | timeweb |
| SNOWDEX_SHADOW_MODE | unset/false | false | true |
| Indexing | existing route rules | exact apex/www only | global noindex |
| Vercel telemetry | existing behavior | disabled | disabled |

Unknown provider blocks build. Flags are build-time config; runtime overrides
cannot repair an already-built client/config. Docker production defaults are
standalone=true, provider=timeweb, shadow=false. A shadow build must explicitly
set the shadow build flag rather than merely changing container runtime env.

All technical/lookalike/malformed hosts receive `X-Robots-Tag: noindex, nofollow,
noarchive`, including static assets, robots and sitemap. Exact snowdex.ru/www
receive no global noindex; private result route rules still apply. Technical
hostname stays directly available, canonical/OG/sitemap stay https://snowdex.ru.
Exact www public pages redirect 308 to apex, preserving path/query. Health,
exact Google verification, api/go/internal/_next service paths are excluded.
Legacy redirect is preserved; no public auth middleware expansion.

### Analytics and environment minimum

Timeweb shared event writer checks actual request Host via Next headers before
SQL. Missing request context denies writes. Forwarded Host, caller URL and
canonical environment URL cannot grant permission. Vercel policy is unchanged.
Browser tracking checks actual hostname before creating session/acquisition.
Technical hosts produce no first-party fetch/beacon or Metrika init/hits/goals.
Timeweb SiteAnalytics waits for hydration: **no SSR no-JS Metrika image**, even
on apex. JavaScript Metrika works on apex/www; Vercel rendering is unchanged.
Private saved-result exclusions and event/persistence schemas remain unchanged.
This is not a write sandbox: real recommendation POST still writes results.

| Category | Names | Initial production requirement |
| --- | --- | --- |
| PUBLIC_BUILD_TIME / REQUIRED_NOW | NEXT_PUBLIC_SITE_URL | https://snowdex.ru, build and runtime |
| PUBLIC_BUILD_TIME / REQUIRED_NOW | NEXT_PUBLIC_HOSTING_PROVIDER | timeweb, image default |
| PUBLIC_BUILD_TIME / REQUIRED_NOW | NEXT_PUBLIC_YANDEX_METRIKA_ID | Docker ARG default 108458449 in builder AND runner; verify actual bundle |
| BUILD_CONFIG / REQUIRED_NOW | SNOWDEX_STANDALONE / SNOWDEX_SHADOW_MODE | true / false, independent |
| REQUIRED_RUNTIME / SECRET | DATABASE_URL | existing production-compatible endpoint; owner supplies privately, never ARG/layer |
| REQUIRED_RUNTIME | SAVED_RESULTS_ENABLED | true, owner must explicitly configure |
| REQUIRED_RUNTIME | ANALYTICS_DELIVERY_ENABLED | false on Timeweb, not an ingestion flag |
| REQUIRED_RUNTIME | DATABASE_SSL | absent, preserving SSL-required behavior; never disable in production |
| IMAGE_DEFAULTS | NODE_ENV / HOSTNAME / PORT / NEXT_TELEMETRY_DISABLED | production / 0.0.0.0 / 3000 / 1 |
| KEEP_ON_VERCEL_ONLY_FOR_NOW / DEFERRED_UNTIL_CRON_MIGRATION | CRON_SECRET, RESEND_API_KEY, ANALYTICS_DELIVERY_SENDER, ANALYTICS_DELIVERY_RECIPIENT, YANDEX_METRIKA_OAUTH_TOKEN | do not copy to Timeweb |
| KEEP_ON_VERCEL_ONLY_FOR_NOW | INTERNAL_ACCESS_PASSWORD, INTERNAL_ACCESS_SECRET | absent on Timeweb, internal paths fail closed |
| OPTIONAL_VERCEL_ONLY | VERCEL_URL, VERCEL_PROJECT_PRODUCTION_URL, NEXT_PUBLIC_VERCEL_OBSERVABILITY_BASEPATH, NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG | do not transplant |

The complete script-only inventory remains in the historical inventory below;
those variables are not startup configuration. Keep Vercel delivery enabled and
all its credentials unchanged. Delivery controls scheduled reports/email, NOT
event ingestion. Default public Metrika ARG avoids assumptions about panel
runtime-to-build substitution; override once for both Docker stages if needed.
Runtime-only counter changes do not change the browser bundle. No secrets read.

### Runtime / candidate acceptance

Keep pinned Node/digest, curl, non-root, standalone assets, node server.js,
EXPOSE 3000, HOSTNAME=0.0.0.0, no Docker HEALTHCHECK; panel path=/health.
Current resources stay **1 vCPU / 2 GB RAM / 30 GB NVMe / Moscow / one instance**,
not the superseded early suggestion below. No shared cache or new dependencies.
SQL pool/SSL unchanged; allowlist/egress UNKNOWN unless separately confirmed.
Cache remains instance-local: catalog 300s; board/schema 3600s. Vercel refresh
updates shared DB; Timeweb sees changes via its own TTL, not immediate
cross-provider invalidation. Failed revalidation is not a freshness guarantee.
Sitemap is dynamic; static-only fallback is per request, never a frozen success.

Require exact Timeweb deployed SHA from build/deployment logs, healthy status and
actual runtime configuration evidence. Prior shadow 200/576 is not proof of the
new candidate. Missing exact SHA/config/logs makes readiness PARTIAL.
Only GET health/home/catalog/quiz/result (empty state expected), Bataleon exact,
YES Basic, robots/sitemap/verification/icons/JS/CSS. Require 558 items, 24 SSR
cards, 558 board / 576 total unique sitemap URLs, canonical/CTA/alias correctness.
Large static files require completed stream, bytes/MIME/SHA256, not just 200.
No direct DB queries, real submissions, cron calls or /go transitions.

Local artifact: check apex/www/technical Host headers and static noindex, forward
host spoof denial, query redirects. Next's experimental config-test helper
stringifies repeated query values with commas: real HTTP must separately prove
brand parameter preservation. Protected browser contexts block tracking, /api,
/go/internal and all non-GET/HEAD before navigation, service workers disabled.
Mock recommendation fixtures are client evidence, not server persistence.
Saved flag, actual Metrika reporting and ingestion require separately authorized
user acceptance; tests do not prove panel configuration or live writes.

### Sole scheduler: Vercel

Preserve UTC schedules: catalog-refresh `0 0 * * *`, analytics-weekly
`30 6 * * 1`, analytics-retry `15 8 * * *`. No Timeweb schedules.
Vercel documents GET to the project's **production deployment URL**, not a
requirement that public DNS stay on Vercel. Cron does not follow redirects;
existing /api legacy exclusions matter. Keep Vercel project/deployment/domains
and credentials alive. Confirm actual scheduled invocations by read-only logs
before/after cutover, never manual execution; unavailable logs are UNKNOWN.
[Cron](https://vercel.com/docs/cron-jobs),
[redirect/execution behavior](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

Future handoff requires separate authorization: inventory last run/idempotency,
disable old scheduler before enabling new, verify first run/no overlap, preserve
retry ownership and rollback. No scheduler changes or decommission here.

### Manual cutover and rollback (owner only)

1. Confirm exact candidate gates and privately configure minimal runtime env.
2. Attach snowdex.ru and www.snowdex.ru to the existing Timeweb app; copy only
   actual routing records from its panel, verify ownership/certificate readiness.
3. REG.RU: preserve authoritative NS, Google/Yandex verification TXT and unrelated
   records; change only required apex/www routing, record prior TTL/values.
4. Verify trusted HTTPS apex; www 308 preserving path/query; HTTP→HTTPS; no loops;
   apex indexable, technical noindex; canonical/OG/robots/sitemap/verification;
   complete static transfers and unchanged product paths.
5. Confirm saved capability and analytics through authorized user operations,
   separately from automated GET/mocks. Check mobile menu/filter/history/result.
6. Three loads each: affected iPhone, PC VPN, PC without VPN, ordinary mobile
   network. Record actual errors and complete transfers; user-reported prior
   improvement is context, not a new measurement by this source task.
7. Observe **at least 48 hours**, retaining Vercel project/domains/deployments/
   secrets/cron. Inspect errors and scheduled invocations read-only.

Rollback without code mutation: restore `A @ → 216.198.79.1` and
`CNAME www → 8536f23a3e71fdf9.vercel-dns-017.com.`; preserve NS/TXT/unrelated
records. Verify retained Vercel production HTTPS/canonical and sole scheduler.
DNS TTL/cache prevents instantaneous global rollback; no minute-level promise.
Keep technical host available/noindex/no analytics. Do not delete resources.

Separate follow-ups: scheduler migration, Vercel decommission, full-body/hash
monitoring from ≥2 independent regions (update references only after verified
deployment), analytics truth audit, partner/monetization readiness. Not executed.

## Historical shadow preparation (036D–036E; superseded where noted above)

This is a technical-host experiment, not a production migration. Keep
`snowdex.ru` on Vercel. Do not attach a custom domain, alter DNS, migrate data,
run importers, configure a scheduler, or send synthetic production events.

## Baseline and portability decision

- Base: `64109f54b3d8a98e1983b29bdfdf551baa7b2957` (036B, including 036A).
- Repository: `NotlimitGB/EdgeFit`.
- Branch: `task/036D-timeweb-shadow-deployment`.
- Runtime: Dockerfile, Next.js standalone, one Node process / one instance.
- Node: `24.21.0-bookworm-slim`; Dockerfile pins the official multi-platform
  manifest digest. Next 16.2.2 and React 19.2.4 remain unchanged.
- Native Next.js SSR is supported by Timeweb and defaults to `npm start`.
  Docker is chosen for reproducible dependency installation, Node version,
  assets, permissions and testing of the identical production artifact.

| Dependency / assumption | Classification | Shadow treatment |
| --- | --- | --- |
| Next SSR, route handlers, middleware, static/public files | PORTABLE | Normal standalone Node runtime, not static export |
| `postgres`, SQL and external DB | PORTABLE | Same endpoint; runtime-only credentials; unchanged SSL/pool |
| Data Cache / ISR | PORTABLE | Single-instance local writable filesystem; no shared-cache service |
| Canonical URL helper / exact legacy redirect | PORTABLE | Explicit SnowDex canonical; technical host stays directly usable |
| Browser session storage and memory result handoff | PORTABLE | Existing keys, cookie/session and fallback behavior unchanged |
| First-party analytics, Metrika, Resend SDK | PORTABLE | Existing contracts; test-browser requests isolated; delivery disabled |
| `@vercel/analytics`, `@vercel/speed-insights` | OPTIONAL_VERCEL_ONLY | Packages retained; components not mounted in shadow |
| `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL` | OPTIONAL_VERCEL_ONLY | Existing overrides retained; do not set them on Timeweb |
| Vercel Cron / `maxDuration=300` | MIGRATION_REQUIRED for eventual cutover | No new scheduler for shadow; Vercel remains authoritative |
| Persistent Vercel cache across deployments | MIGRATION_REQUIRED for performance expectations | No such guarantee on Timeweb; cold-cache difference accepted |
| Actual container / safe DB configuration / populated runtime | BLOCKING Timeweb runtime acceptance only | Not prerequisites for 036D1 source delivery; never replace runtime evidence with static tests |

No mandatory Vercel runtime API was found. Cron source imports `scripts/lib`
and related scripts; these must remain available to Next's dependency tracer.
Scripts that write local reports/import catalog are not startup commands.

## Environment inventory: names and semantics only

Never print credentials, copy `.env` into an image, or pass a DB secret as a
Docker build argument. `.env.example` is a local example, not a production
credential source. `UNUSED` below means not required by the shadow runtime,
not necessarily removable from the repository.

| Name | Timing / exposure | Required configuration |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | BUILD + RUNTIME, PUBLIC | `https://snowdex.ru`; Docker fixes this default. Never technical host |
| `NEXT_PUBLIC_YANDEX_METRIKA_ID` | BUILD + RUNTIME, PUBLIC, OPTIONAL | Public counter ID; Docker ARG at build and matching runtime setting; blank means disabled |
| `SNOWDEX_SHADOW_MODE` | BUILD + RUNTIME, server config, REQUIRED for shadow | Docker sets `true`; standalone and noindex are build-time configuration. Normal Vercel leaves unset |
| `DATABASE_URL` | RUNTIME, SECRET, REQUIRED for populated pages | Existing external endpoint, preferably owner-provided read-only credentials; absent during build |
| `DATABASE_SSL` | RUNTIME, non-secret | Preserve production value; only exact `disable` disables SSL; otherwise `require` |
| `INTERNAL_ACCESS_PASSWORD` | RUNTIME, SECRET, OPTIONAL for public test | Needed only for authorized internal usage, which is excluded from A/B |
| `INTERNAL_ACCESS_SECRET` | RUNTIME, SECRET, OPTIONAL | Existing fallback to password remains; do not reuse production credentials unnecessarily |
| `SAVED_RESULTS_ENABLED` | RUNTIME, non-secret, OPTIONAL | Existing boolean semantics. **False does not stop quiz_results INSERT** |
| `CRON_SECRET` | RUNTIME, SECRET, UNUSED in shadow test | Leave unset; do not copy production cron credentials |
| `ANALYTICS_DELIVERY_ENABLED` | RUNTIME, non-secret | `false` for shadow |
| `RESEND_API_KEY` | RUNTIME, SECRET, OPTIONAL delivery-only | Leave unset in shadow |
| `ANALYTICS_DELIVERY_SENDER` | RUNTIME, confidential config, OPTIONAL delivery-only | Leave unset in shadow |
| `ANALYTICS_DELIVERY_RECIPIENT` | RUNTIME, confidential config, OPTIONAL delivery-only | Leave unset in shadow |
| `YANDEX_METRIKA_OAUTH_TOKEN` | RUNTIME, SECRET, OPTIONAL reporting-only | Leave unset for public A/B |
| `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL` | Optional provider-injected URL overrides | Not required; leave unset on Timeweb |
| `NODE_ENV` | RUNTIME, non-secret | `production`, set in image |
| `HOSTNAME`, `PORT` | RUNTIME, non-secret | `0.0.0.0`, `3000`, set in image |
| `NEXT_TELEMETRY_DISABLED` | BUILD + RUNTIME, non-secret | `1`, disables Next build telemetry, not first-party events |

The installed Vercel SDKs also read provider-injected
`NEXT_PUBLIC_VERCEL_OBSERVABILITY_BASEPATH` and
`NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG`. Do not transplant them;
provider widgets are disabled in shadow. They are not SnowDex API contracts.

Script-only environment reads (not App Platform startup configuration):
`CATALOG_AUDIT_REPORT_PATH`, `CATALOG_SOURCE_IDENTITY_REPORT_PATH`,
`MODEL_FAMILY_AUDIT_REPORT_PATH`, `MODEL_FAMILY_RECONCILIATION_REPORT_PATH`,
`STORE_IMPORT_SOURCE`, `STORE_IMPORT_LIMIT`,
`CATALOG_SOURCE_IDENTITY_EXPECTED_PLAN_HASH`, `CSV_MODELS_FILE`,
`CSV_ФАЙЛ_МОДЕЛЕЙ`, `CSV_SIZES_FILE`, `CSV_ФАЙЛ_РАЗМЕРОВ`,
`SNOWDEX_PLAYWRIGHT_MODULE`. Import/repair/reconciliation scripts are not run.

### Build variables are not runtime substitutions

`NEXT_PUBLIC_*` client values are baked into the bundle. For Metrika, explicitly
provide `--build-arg NEXT_PUBLIC_YANDEX_METRIKA_ID=<public-counter-id>` and set
the same runtime value. Verify Timeweb's build-argument mechanism before
claiming Metrika parity. A runtime-only ID does not fix an already-built client.
If the panel cannot provide this public build setting, stop that parity gate;
do not bake secrets or silently claim analytics was verified.

## Database and write isolation

The repository client uses `prepare:false`, `max:1`, `idle_timeout:5`,
`connect_timeout:10`. Do not tune these here. The new host needs outbound DNS,
TLS and access to the existing DB port. The provider's allowlist and actual
Timeweb egress IP are UNKNOWN until independently verified. If blocked, the
owner must separately authorize the exact egress IP; no broad allowlist bypass.

Prefer existing owner-provided read-only credentials on the same endpoint.
Do not create roles or alter permissions in this task. Connectivity evidence
uses a single `REPEATABLE READ READ ONLY` transaction, first and last
`SELECT current_setting('transaction_read_only')`, and limited schema/connection
SELECTs only. No migrations, user rows, writes, import or backfill.

**The shadow app is not a write-safe sandbox by itself.** Recommendation POST
always inserts into `quiz_results`; analytics persists on non-local production
hosts; `/go` can record clicks; cron/internal/import paths can mutate data.
No ordinary-browser browsing with production write credentials is authorized.
No real API submission or merchant transition is part of acceptance.

Before the first browser navigation:

1. Use an isolated Playwright context with service workers blocked.
2. Reject all third-party tracking and analytics requests.
3. Reject `/api`, `/go`, `/internal`, cron/import requests and non-GET/HEAD methods.
4. The only exception is intercepted `/api/recommendation` POST fulfilled with
   a deterministic local fixture, never forwarded to the server.
5. Inspect allowed/blocked request evidence and verify no write escaped.
6. Do not use real saved-result bearer tokens or submit personal test inputs.

The existing `scripts/verify-catalog-mobile.mjs` already installs isolation
before navigation; use it for catalog checks. Quiz/result fixtures prove client
handoff only. Real persistence and server recommendation POST remain untested.

## Cache, build-time data and readiness

Catalog route/Data Cache TTL stays 300 seconds. Board route/bundle and schema
capability TTL stay 3600 seconds; schema lookup retains its hour bucket and DB
namespace. Do not add cache services, change tags, namespace logic or TTLs.

Next filesystem cache is instance-local. `.next` is owned by the runtime user
so ISR and Data Cache can write. Restart of the same container may retain its
filesystem; replacement/redeployment does not promise persistence. Do not run
multiple instances without a separate shared-cache design.

The image is built with blank DATABASE_URL, so catalog prerender may contain
zero items. Sitemap uses `force-dynamic`: it is generated from the existing
canonical loader at runtime, never stored as a static build artifact. `/health` HTTP 200 means
process/routing liveness, **not catalog readiness**. Do not cut over or invite
ordinary users based on this health check.

After runtime DB is configured, observe initial and repeated catalog/sitemap
GETs and natural catalog ISR regeneration. Wait through at least one catalog TTL when
necessary. Never clear caches or change TTL to force a pass. Sitemap is generated
on each request without a new persistent cache or TTL. If its DB lookup fails,
only static routes are returned for that request, with a sanitized log category;
the next request retries current truth. Duplicate slugs are removed and existing
alias sources remain excluded. Runtime readiness
requires 558 logical catalog items / 24 SSR cards, Bataleon exact identity,
and expected sitemap corpus (558 board / 576 total URLs). Counts are baseline
expectations, not evidence gathered by this preparation document.

### Preparation and acceptance boundaries (036D1, 2026-10-05)

The earlier 036D build exposed a static 18-URL sitemap with no board URLs and
no revalidation. 036D1 removes that build freeze by making only sitemap dynamic.
Source acceptance requires a DB-less shadow build where sitemap is absent from
static prerender outputs, plus fixture tests for failure/recovery and 558 board /
576 total unique URLs. Fixture counts are not observed Timeweb runtime counts.

Docker now responds, but local container execution is intentionally outside
036D1 source acceptance; no Docker repair is required. Container HTTP transfers,
SIGTERM, runtime cache and populated DB checks remain Timeweb acceptance gates.
No DB access or special read-only credentials are required for this source task.
READY_FOR_TIMEWEB_DEPLOY means source/package checks passed and the branch was
committed and pushed, not that a container has already passed runtime acceptance.

## Timeweb human deployment checklist

After the branch has passed source/package acceptance and been pushed:

1. App Platform → Create/Add; connect GitHub repository `NotlimitGB/EdgeFit`.
2. Select `task/036D-timeweb-shadow-deployment`, record exact deployed commit.
3. Framework: **Dockerfile**, repository-root context (directory field empty).
   Build/start are Dockerfile instructions; do not select frontend static mode.
4. Region: Moscow. Initial allocation: 2 vCPU / 4 GB RAM, one instance. This is
   an experiment starting point, not a measured capacity promise.
5. Container port: 3000 (EXPOSE). Health path: `/health`.
6. Public build setting: Metrika ID only if parity is required and supported.
7. Runtime settings: DATABASE_URL, DATABASE_SSL, NEXT_PUBLIC_SITE_URL,
   matching NEXT_PUBLIC_YANDEX_METRIKA_ID if used, ANALYTICS_DELIVERY_ENABLED=false.
   SNOWDEX_SHADOW_MODE/HOSTNAME/PORT/NODE_ENV already come from the image.
8. Do not configure schedules, delivery credentials, DNS or a custom domain.
9. Use the free technical hostname displayed on Dashboard; verify trusted SSL,
   complete static files, no redirect to apex and `X-Robots-Tag` noindex.
10. Confirm canonical/sitemap URLs still use snowdex.ru. Do not submit this host
    to search engines. Record logs without secrets and gate populated readiness.

The Dockerfile deliberately contains no HEALTHCHECK instruction. Timeweb App
Platform is the sole healthcheck owner; the owner must explicitly configure
the panel health path as `/health`. Do not leave that field empty. The endpoint
returns HTTP 200 with body `ok`, executing routing without cache, DB, auth, SSR
or external dependencies. It proves liveness only, not catalog or recommendation
readiness. HOSTNAME, PORT, EXPOSE and the standalone start command are unchanged.

The runner installs only `curl` and its required Debian dependencies, without
recommended packages, before switching to the non-root user. Apt lists are
removed and `curl --version` is mandatory during the Docker image build. This
tests the compatibility hypothesis that the platform probe needs an HTTP client;
missing curl is not a confirmed root cause. Static tests and a Next.js build do
not prove the binary is present on Timeweb. After redeploy, record the exact SHA,
the successful version check in Docker build logs and healthy platform status
with `/health`. App Platform remains the sole probe owner.

According to [Timeweb's healthcheck documentation](https://timeweb.cloud/docs/apps/healthcheck-path),
the panel health path takes precedence over Dockerfile HEALTHCHECK. There is no
image-level probe in this package, so `/health` must be set in the panel;
leaving `/quiz` configured will not automatically switch the platform probe.
This task does not change platform settings. After redeploy, verify the exact commit, a direct
`/health` HTTP 200 and healthy platform status. Successful source checks alone
do not establish the root cause of the earlier stuck `starting` status.
If provisioning requires purchasing resources, the owner performs that action.

## Timeweb container acceptance and post-deploy A/B

The first required container acceptance runs on Timeweb. Build and run the
actual Docker image, not `next dev`. Verify non-root UID,
cache permissions, graceful `docker stop`, restart, HTTP routing, shadow header,
unchanged legacy host redirect and canonical metadata. Fetch `/`, `/catalog`,
`/quiz`, one real board, robots/sitemap, JS/CSS and icon/verification assets.
Record stream completion, bytes, SHA256 and MIME for a large JS and CSS.

Empty-DB HTTP checks and fixtures do not establish populated corpus, DB
connectivity, cache reuse/revalidation or product parity. These remain
TIMEWEB_ACCEPTANCE_REQUIRED and must pass before treating the technical host as
a working shadow candidate. Source readiness alone permits the feature push;
it never authorizes production deployment or DNS changes.

After the owner provides the technical URL, use protected browser contexts on:
affected iPhone, PC with VPN, PC without VPN and a normal mobile network.
Compare apex and candidate UI; legacy homepage redirects to apex, so only its
static JS/CSS paths serve as independent controls. Three sequential attempts per
network without cache-busting. Verify entry, catalog, all mobile filters,
24→48→72→96, search/sort/query/history, board, fixture quiz/result and store href
without execution. Compare full JS/CSS bodies against each deployment's own
expected sizes and hashes; different builds need not have identical hashes.

Migration consideration requires three successful candidate loads in an
affected network while current failures remain reproducible, with no product
regressions. If current also works, the hosting benefit is unproven. DNS cutover,
production write testing, scheduler migration and shared cache require separate
authorization. Rollback for this experiment is simply to stop using the shadow;
current Vercel production has never moved.

## Primary references (checked 2026-10-05)

- [Timeweb native Next SSR](https://timeweb.cloud/docs/apps/deploying-frontend-apps/nextjs)
- [Timeweb Dockerfile deployment, EXPOSE and health path](https://timeweb.cloud/docs/apps/deploying-with-dockerfile)
- [Timeweb variables](https://timeweb.cloud/docs/apps/variables)
- [Timeweb lifecycle / container storage](https://timeweb.cloud/docs/apps/how-it-works)
- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)
- [Node supported releases](https://nodejs.org/en/about/previous-releases)

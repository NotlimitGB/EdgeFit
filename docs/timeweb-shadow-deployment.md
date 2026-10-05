# SnowDex: Timeweb shadow deployment (036D)

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

Docker HEALTHCHECK targets `/health` with a 4-second request timeout inside the
5-second Docker timeout. It rejects redirects and requires HTTP 200 with body
`ok`. The endpoint executes routing without cache, DB, auth, SSR or external
dependencies. It proves liveness only, not catalog or recommendation readiness.

According to [Timeweb's healthcheck documentation](https://timeweb.cloud/docs/apps/healthcheck-path),
the panel health path takes precedence over Dockerfile HEALTHCHECK. Docker's
check is used only when that field is empty. The owner must verify `/health` in
the panel, or leave the field empty to use the image check; leaving `/quiz`
configured will not automatically switch the platform probe. This task does
not change platform settings. After redeploy, verify the exact commit, a direct
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

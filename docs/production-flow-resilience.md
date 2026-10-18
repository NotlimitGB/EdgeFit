# 039E / 039G: bounded public flows and conservative DB lifecycle

039E was recovered from stash `6b5820e4ad9e8128d898b2910b034887652e73f3`
(base `24feb061…`) onto `48b8f13…`. The stash and original candidate `a5609ad…`
remain recovery points. 039G corrects the independent review's lifecycle findings.
The original production incident's root cause remains unproven.

## Caller budgets (not SQL cancellation)

| Boundary | Budget | Caller outcome |
| --- | --- | --- |
| Recommendation API | 20 seconds | Safe 503; no new continuation SQL after abandonment |
| Optional result persistence | 2 seconds | Completed recommendation without an unacknowledged token |
| Board/catalog load | 15 seconds | Recoverable error, not fabricated/missing identity |
| Outbound destination lookup | 8 seconds | No-store recovery response; no invented merchant |
| Optional outbound identity / analytics | 500 ms each | Existing identity fallback / correct merchant redirect |
| Entire outbound handler | 12 seconds | No-store recovery response |
| Browser POST and complete body | 30 seconds | Abort waiting, preserve answers, no automatic POST retry |
| Result navigation | 10 seconds | Retry navigation to existing snapshot without recalculation |

Timers are cleaned on settlement/unmount. Server timers are unref'd. Budgets are
initial safeguards, not measured SLOs. Healthy results, token format, events,
destinations, historical offer presentation and scoring remain unchanged.

## One application client; admission rather than destructive recovery

There is one shared postgres.js 3.4.9 application client per process. Public
timeouts NEVER call `end`, `cancel`, `reserve`, create another generation or
restart the process. `end({timeout:0})` is not proof of physical socket closure.
The driver's native connection lifecycle is unchanged, including `max=1`, SSL,
prepare, idle/connect timeouts and its own reconnect behavior. This policy prevents
application-induced replacement overlap; it does not assert control over every
physical connection on the network or PostgreSQL's backend lifetime.

Separate AsyncLocalStorage public-work context carries critical/optional kind
and an AbortSignal, never user input. Nested work inherits parent abandonment.
An expired caller prevents subsequent SQL from that context. Already admitted
queries, including driver-queued queries, can still execute/commit later.

Admission capacity is **32 unfinished public units per shared client**. Query,
transaction acquisition/callback/commit and nested savepoint calls consume units;
nested public queries also count. A slot is released only at original settlement,
never at caller timeout or diagnostic tracking expiry. Internal driver commit/
rollback statements are not admission-blocked. No public transaction is converted
to success because its caller stopped waiting.

At saturation, new public units fail before driver execution/acquisition. Existing
operations continue. Settlement permits fresh admission on the SAME client.
Unscoped scheduler/reporting work is neither capped nor interrupted; a diagnostic
trace alone never enables admission policy. Public count is not pool occupancy.
This does not isolate natural contention on the existing single-connection pool.

The first rejected public unit emits one `admission_saturated` event with a
bounded `oldestOperations` snapshot (up to eight active units, oldest first).
Each item carries an `admissionId`, its public-work lineage and trace/stage, unit
kind, `startedAtUtc`, monotonic age, caller-timeout state, settlement/release state, and—when the existing
query tracker can correlate it—the driver operation ID and dispatch-attempt
state. Missing operation IDs or `unknown` dispatch state are evidence gaps, not
inferred successes. `not_observed` means only that no correlated driver dispatch
attempt was seen; it does not prove a postgres.js pool wait. `admission_released`
is emitted only on original settlement, and `admission_available` records that
capacity is available again on this same shared client. The snapshot is produced
only when saturation is first observed, not continuously.
The event envelope supplies UTC, process ID and client ID. Snapshot holders
continue to emit their eventual `admission_released` event after capacity becomes
available, including after lifecycle tracking expiry. The original unit's
trace/stage takes precedence over the unrelated async context that releases it.
An incomplete snapshot is marked `snapshotComplete=false`; logging failure does
not change admission or the driver's settlement.

## Observability and operator recovery

039C diagnostics keep bounded queues/registries and static error categories. A
10-second observation distinguishes dispatch attempt observed / not observed /
uncorrelated. No observed dispatch can mean queue, connect or preparation; it is
NOT proof of pool queueing. Dispatch is not proof of socket write/server execution.
The original 60-second diagnostic tracking expiry remains separate from admission.
Counters may become incomplete; admission does not silently free pending units.

Each unfinished admitted public unit emits one `operator_action_required` event
at 60 seconds. Caller timeout, admission saturation/availability, abandoned
context and driver/network failure remain distinct. Caller events without a DB
client have a process ID, not a fabricated client ID. No SQL, parameters, DSN,
exception text, session IDs or tokens are logged. Failure logs use bounded queues;
healthy logging remains the existing lifecycle instrumentation.

Operational states:

- Capacity available: new public work may proceed.
- Suspected latency: 10-second observation, not a declaration of broken connection.
- Persistent unresolved work: 60-second operator observation; other work may still
  succeed, so this alone does not authorize a restart.
- Saturated: fail-closed for new public units, existing/unscoped work untouched.
- Capacity restored: genuine settlement, same application client.
- Automatic retirement/release confirmation/recovery-ready: deliberately absent.
  Failed or pending teardown cannot latch recovery because timeout never invokes it.

Operator procedure (requires separate authorization; no automated restart):

1. Confirm active deployment SHA/status and sanitized UTC window. Group by
   process/client IDs; account for dropped events, expiry and unknown correlation.
2. Compare persistent observations with genuine completions and repeated critical
   flow failures. Successful neighboring requests mean a slow optional unit is
   not sufficient evidence to restart. Health is liveness, not DB readiness.
3. If critical flows keep failing and the same client shows no progress, preserve
   sanitized evidence, record unknown-commit writes and request owner approval
   for a process restart. Do not replay requests or issue PostgreSQL administrative
   cancellation. Do not change pool/configuration based only on a timeout.
4. Before replacement, the owner/platform must establish termination of the OLD
   application process. A rolling deployment is not evidence that it stopped.
   If process termination cannot be verified, recovery is not confirmed.
5. After the separately authorized restart, verify new process ID, deployment SHA,
   `/health`, bounded board/catalog GETs and a separately authorized real quiz.
   Verify progress/completions and absence of saturation. Capture further stalls
   instead of repeating restarts indefinitely.

A timeout, socket closure or process termination NEVER proves that a write did
not commit. Tokens are exposed only after acknowledged snapshot persistence;
a late save can remain unexposed. No automatic write retries exist. A manual new
quiz submission may create another record after an unknown-commit timeout;
navigation-only retry never submits a new recommendation.

## Local acceptance and limitations

Installed-driver loopback tests cover a deliberately half-open peer, repeated
caller timeout cycles, healthy completion on the same client, parameters/fragments,
transaction callbacks, nested savepoints, rollback and delayed commit. Controlled
tests cover admission saturation, late continuation rejection, unscoped work and
unused rejecting/never-settling teardown mocks. They need no PostgreSQL.

Local Timeweb-mode production artifact uses DB sentinel values. WebKit at
390/768/1440 px blocks tracking, external, API, outbound, internal and mutating
requests before navigation, except a locally fulfilled recommendation fixture.
Success, request timeout and delayed navigation use one fixture POST each. Clock
advancement proves state recovery, not network latency or production persistence.

Stalled original work may remain retained up to the admission cap until settlement
or owner-authorized process termination. This is an explicit observable safety/
availability tradeoff, not automatic recovery or proven SQL cancellation.
Production DB, scheduler, merchant transitions and deployment are outside local
acceptance. Main integration requires independent exact-SHA review and authorization.

## 039L isolated Next.js 16.2.2 HTTP fixture

The production-mode fixture used 558 synthetic canonical identities and no
production credentials or data. Healthy local responses completed for health,
catalog (558 DTO identities; 24 initial SSR cards), sitemap (558 board URLs),
the synthetic YES Hell YES 149 board, a saved-result fixture and a women's quiz
recommendation. A local `/go` request was inspected as a manual redirect only;
the merchant destination was not followed. These are local mechanics checks,
not production corpus or persistence evidence.

With unavailable DB configuration or a rejecting loader, the production server
returns completed HTTP 500 responses for catalog, board and sitemap rather than
an empty catalog, false board 404 or successful static-only sitemap. Sitemap's
failed XML body is empty. A never-settling board dependency produces a completed
HTTP 500 after about 30 seconds with the generic `Internal Server Error` body.
The initial explanation of separate metadata/page waits was refined by 039L1:
they share the initial loader; metadata executes again during framework error
rendering, as described below. No production trace correlation was available,
so the incident root cause remains unknown and no recovery claim is made.

## 039L1 release gates and remaining HTTP limitation

The local exact-bytes test failed because system Git `core.autocrlf=true`
checked out the verification HTML as 55 bytes with CRLF. Its historical and
current Git blobs are identical: 54 bytes ending in LF, SHA256
`d61f4eddcbe5524fe7d9da5a7bdedd4281b8663420400c4e699e83584b481d7b`.
The isolated test checkout extracts the exact Git bytes and overlays this
candidate. The assertion and production file are unchanged. Middleware is
2141 bytes in both blobs and working tree, SHA256
`0c49aa8ad0345bbfe762752cad856e473b25f9bb3097fb004bf47676559bac3b`.

The board fixture preserves the page, metadata, layout, React `cache`, Data Cache
and 3600-second ISR setting. DB/config are deterministic local doubles, using
real postgres.js lazy Query objects and the public admission adapter. These
doubles do not establish SQL execution or network health.

The healthy initial page and metadata share one canonical-loader/DB-double
execution. A second request has `x-nextjs-cache=HIT` and zero loader executions;
a distinct healthy path has `MISS` and one. A genuine missing board returns a
complete 404. Rejected and saturated dependencies return complete 500 responses,
not false 404s. Saturation retains 32 original units and exposes the oldest
holders in the bounded snapshot.

For a pending dependency, the first shared loader hits its 15-second deadline.
Next.js 16.2.2 then enters `getErrorRSCPayload` with `isStaticGeneration=true`.
That function recreates metadata using the original loader tree, under a new
React render/cache context. Metadata invokes the canonical loader and DB-double
again and consumes a second 15-second budget. The page component itself is not
invoked again. The second metadata failure escapes the error-RSC/Fizz render;
Next's server error rendering falls back to the completed 21-byte plain-text
`Internal Server Error` response. The segment's client `error.tsx` cannot supply
the recovery UI at this boundary. Static inspection of the pinned Next runtime
and temporary in-memory runtime markers confirm this local chain.

This proves duplicate DB-double execution locally; it does not prove duplicate
production SQL. Both accepted pending units retain capacity until genuine
settlement, even after the HTTP response completes. No runtime workaround is
included: metadata-only catch was already ineffective, and changing route
caching, TTLs or inventing a successful error page is outside this package.
The candidate is therefore **observability and failure semantics only**, with
the completed generic board 500 and approximately 30-second total wait disclosed.

Sitemap failure semantics intentionally change: exceptions, saturation and
deadline failures reject the full sitemap instead of serving static routes as
an apparently successful fallback. A successfully loaded, genuinely empty
canonical corpus can still produce the existing static routes. Healthy content,
alias exclusions and canonical identities are unchanged. Public catalog/board
loaders reject absent DB configuration; saved-result reads gain public admission
and the existing 15-second budget, while invalid/missing tokens remain not-found.

Final local HTTP observation window: 2026-10-18 18:55:50–18:56:23 UTC.
Durations end after complete body consumption, excluding diagnostic drain time;
these local fixture timings are not production benchmarks.

| Fixture case | Status | TTFB ms | Total ms | Body complete | Cache |
| --- | --- | --- | --- | --- | --- |
| Healthy first observation | 200 | 1372 | 1381 | Yes | MISS |
| Same successful board | 200 | 12 | 15 | Yes | HIT |
| Distinct healthy board | 200 | 74 | 77 | Yes | MISS |
| Genuine missing board | 404 | 50 | 52 | Yes | MISS |
| Rejected dependency | 500 | 46 | 47 | Yes, plain text | Not exposed |
| Permanently pending dependency | 500 | 30045 | 30045 | Yes, plain text | Not exposed |
| Saturated admission | 500 | 81 | 81 | Yes, plain text | Not exposed |

The healthy responses contain the synthetic model/season and matching canonical.
The HIT performs zero new loader/DB-double executions. The rejection and pending
cases each execute two DB-double operations, one during the initial render and
one during error metadata. In the final saturation case, the two pending units
remain retained, 30 additional fixture holders fill the limit, and the rejected
board lookup does not reach its handler. No PostgreSQL server is used.

039L1 validation: 114 focused tests; all 1631 tests across 109 files in the
Git-byte-exact isolated copy; lint; Timeweb standalone DB-less build; both catalog
and saved-result artifact verifiers; diff-check. The existing byte assertion is
unchanged. No additional broad browser QA or production probes were performed.

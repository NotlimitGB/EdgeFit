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

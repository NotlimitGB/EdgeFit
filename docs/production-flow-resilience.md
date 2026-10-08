# 039E: bounded public flows

Recovered from stash `6b5820e4ad9e8128d898b2910b034887652e73f3`, based on
`24feb061301783302e0d008418eb02d6066630e2`, onto approved main `48b8f13…`.
The recovery stash is retained. The original production incident's root cause
remains unproven; improvement after redeploy is not root-cause evidence.

## Budgets and outcomes

| Boundary | Budget | Failure outcome |
| --- | --- | --- |
| Started public-flow Query (including queue/connect time) | 10 seconds | Reject, retire owned client generation |
| Public-flow transaction acquisition/callback/commit | 10 seconds total | Reject, retire generation; no retry |
| Recommendation request | 20 seconds | Safe 503; no late calculation/persistence initiation |
| Optional result persistence after computation | 2 seconds | Exact recommendation, without saved token |
| Board/catalog public load | 15 seconds | Error boundary, not fabricated board or cached missing identity |
| Outbound destination lookup | 8 seconds | No-store 503 recovery page, no invented merchant |
| Optional outbound identity / analytics | 500 ms each | Existing identity fallback / same merchant redirect |
| Entire outbound request | 12 seconds | No-store recovery response |
| Browser POST + complete body | 30 seconds | Abort waiting, retain current answers, manual retry only |
| Navigation to completed result | 10 seconds | Retry navigation to existing snapshot, no second POST |

Budgets are conservative initial safeguards, not measured SLOs. All timers are
cleared on settlement/unmount; server timers are unref'd. Repeated successful
requests retain current data, destination, event payload and token semantics.
Editing answers after navigation recovery permits a new explicit calculation.

## Resource recovery and limitations

Lazy postgres.js 3.4.9 Query handlers are adapted without changing SQL, fragments,
helpers, parameters or execution count. Transaction callbacks retain wrapped SQL.
On expiry, `sql.end({ timeout: 0 })` closes only this process's owned client and
rejects its pending queue. Retained old clients fail closed. New generations are
created only after teardown settles; teardown failure leaves access fail-closed.
No `cancel`, reserved connections, automatic SQL retries or database administrative
commands are used. `max=1`, SSL, prepare, idle/connect timeouts remain unchanged.

Generation retirement can fail other operations sharing that client, including
already-started writes. Closing a client or aborting HTTP is **not proof that an
INSERT did not commit**. The response exposes a saved token only after acknowledged
snapshot persistence; a late successful save may remain unexposed. Existing rows,
snapshot format and token hashing are unchanged. Deadlines apply only in existing
public canonical/recommendation/outbound contexts (including the public schema
load). Unscoped scheduler/import SQL does not receive a new deadline. Retirement
may still interrupt another operation sharing the same unhealthy client; no
automatic retry is allowed for writes with unknown commit state.

Loopback tests with the installed driver cover unresponsive startup, dispatch
without reply, queued queries and peer closure. They prove local driver teardown,
not Supabase server cancellation or the original production root cause.

## Diagnostics and review

039C events remain operational. `operation_deadline`, `client_retired`,
`client_recovery_ready` and `client_recovery_failed` use bounded asynchronous
diagnostics with process/client IDs. No SQL, DSN, parameters, exception text or
tokens are logged. Dispatch remains an attempt, not proof of PostgreSQL receipt.
Counters remain tracked operations, not exact pool occupancy.

Local acceptance uses the Timeweb-mode production build with DB sentinel values,
not production persistence. WebKit at 390/768/1440 px intercepts the recommendation
POST with a deterministic fixture and blocks other API, outbound, internal,
tracking and mutating requests before navigation. Success, pending-response
recovery and delayed-navigation recovery must each produce only one fixture POST.
Timers are advanced for failure scenarios; this proves recovery behavior, not
real network latency. No browser fixture is evidence of a Supabase write.

After separately authorized integration/deployment, verify exact active SHA and
inspect sanitized logs for deadline rates and recovery failures. Perform one
authorized real quiz flow; board GET and outbound verification require their own
bounded protocol. No deployment, DB access, cron or merchant transition is part
of local acceptance. Unexpected timeout rates require review of measurements,
not automatic pool enlargement or retry of potentially committed writes.

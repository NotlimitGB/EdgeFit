# 039C: short DB-client observation

This branch adds evidence only, not a fix for the production incident. Deploy
only after separate integration/deployment authorization. Record the exact SHA
and a short UTC observation window; do not restart services or clear caches to
manufacture a reproduction.

## Events and limits

`scope=db_client` events share process/client IDs and a generated operation ID.
Canonical trace/stage IDs are retained; nested canonical loads carry the parent
request trace ID. Recommendation stages distinguish catalog loading, focused
lookup and result persistence. Outbound lookup is identified separately.

- `start`: the original lazy Query's handler was invoked, not Query creation.
- `driver_dispatch_attempt`: postgres.js reached its connection-side `build()`
  hook. This occurs **before socket write**. It does not prove PostgreSQL receipt,
  successful network transmission or SQL execution. `connectionId` is the driver's
  local ID, not a PostgreSQL PID; no authentication/backend secret is logged.
- `success` / `error`: original Query settlement; the result/error is preserved.
- A single 10-second `observation` distinguishes waiting before driver execution
  from a matched dispatch attempt without settlement. Ambiguous matching gives
  `DISPATCH_CORRELATION_UNKNOWN`, never a guessed queued state.
- `tracking_expired` after 60 seconds releases the diagnostic registry entry;
  it does not cancel the query. A later settlement is no longer tracked.

`trackedInFlight` and `trackedBeforeDriverExecution` are tracked operations, not
pool occupancy. A connection can pipeline queries despite `max=1`.
`beforeDriverExecutionMs` includes driver queue/connection preparation, not just
pool wait. Registry/queue limits are 256 each; drain batches are at most 32.
`countersComplete=false` or `droppedEvents>0` makes count-based conclusions
incomplete. Uncorrelated internal driver events (including transaction control)
must not be assigned to a request. Instances/processes cannot be inferred from
one observed process ID.

Logging is deferred, bounded and fail-open. No network telemetry is introduced.
SQL strings are compared in memory against original Query state, never emitted
or hashed. Parameters, DSN, headers, rider data and exception text are omitted.
Enabling the driver's debug callback also enables its diagnostic error metadata:
never dump/serialize raw driver errors; existing safe application boundaries are
retained. Query-object hooks are verified against installed postgres.js 3.4.9;
repeat the driver compatibility tests before a dependency upgrade.

## Minimal authorized production observation

After the diagnostic SHA has actually deployed:

1. One GET `/boards/bataleon-turbo-2024-2025`, bounded to 15 seconds.
2. One GET `/boards/yes-basic` for comparison; record cache headers and do not
   call it a healthy DB path merely because the page returns.
3. One GET `/go/bataleon-evil-twin-plus?from=board-page&placement=board-page`,
   without cookies/session headers, with manual redirect. Never follow the
   merchant redirect. Existing code skips click persistence without a session.

Do not submit another quiz unless separately needed and authorized. Do not probe
all boards or repeatedly call `/go`. Capture only structured lifecycle events,
UTC and HTTP status/phase; omit sensitive response/request material.

Match request traces to operation IDs and local connection IDs. If later requests
remain before driver execution while an earlier matched operation never settles,
serialization becomes a supported hypothesis, not automatically a proven cause.
If later requests dispatch, that disproves total queue blockage for those queries.
PostgreSQL execution/locks and application connection occupancy still require
fresh read-only DB snapshots and platform evidence. No pool, SQL or infrastructure
change is justified solely by an unfinished dispatch attempt.

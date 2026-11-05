# Analytics scheduler recovery (048A)

The former Vercel project was deleted. The workflow schedules the existing weekly route at 06:30 UTC Monday and retry at 08:15 UTC daily. It serializes both jobs in one concurrency group; GitHub Actions schedules can be delayed or dropped, and concurrency is not a durable queue. Monitor workflow failures and missed Monday runs, plus the delivery ledger and provider events. A successful HTTP response alone does not prove inbox delivery. The retry route processes stored pending claims, not a weekly digest that was never generated.

An authorized operator can use `workflow_dispatch` to select `weekly` or `retry`; unknown options are rejected. Weekly is allowed only on Moscow Monday from 00:15 through 23:44, and the response identity must match the immediately preceding ISO week. Do not use it to backfill W44 or any other historical week. If Monday's run is missed, reconcile ledger and Resend first; run `weekly` manually only within that same allowed Monday if no ambiguous outcome exists. After Monday, stop and use a separately reviewed historical recovery procedure. Retry handles only existing pending ledger entries. GitHub requires the workflow to be present on the default branch before manual dispatch can be used.

## Timeout release blocker

The Node HTTP client waits at most 420 seconds including the response body; the Actions job has an 8 minute limit. These client limits do not guarantee delivery: Timeweb documents a maximum 120 second response-header timeout for backend/Docker apps (the current configured value is unknown). The route waits for the complete operation before emitting headers; Next's `maxDuration=300` is Vercel-oriented metadata and does not establish a Timeweb deadline. Nine serial Metrika calls (five windows plus four acquisition requests), each with up to three 5-second attempts and two `Retry-After` delays capped at 10 seconds, can take up to 315 seconds under those assumptions. First-party DB work runs concurrently but has no demonstrated end-to-end report deadline, and ledger/provider work follows; no total server bound is established. The client timeout does not cancel server-side work or prove that Resend did not accept a message.

**Do not activate this scheduler** until a separately reviewed execution design and an observed Timeweb/proxy budget prove that all paths produce a definitive, safely reconciled outcome within platform limits. A proxy/client timeout or other ambiguous outcome requires ledger and Resend reconciliation, not an automatic manual replay. The 420-second client value only removes the former 120-second client bottleneck; it does not solve the shorter proxy boundary.

## Activation — separate owner approval required

1. Confirm the former Vercel scheduler remains absent; never run two schedulers.
2. On Timeweb, configure existing `DATABASE_URL`, `CRON_SECRET`, `RESEND_API_KEY`, `ANALYTICS_DELIVERY_SENDER`, `ANALYTICS_DELIVERY_RECIPIENT`, `YANDEX_METRIKA_OAUTH_TOKEN`, and the server-side Yandex counter configuration used by the reporting service. Verify sender and recipient and credential validity without disclosing values. Old Vercel credentials may no longer exist.
3. Set the same `CRON_SECRET` as a GitHub Actions secret. No database, Resend, or Yandex secret belongs in GitHub Actions. Until explicitly enabled, leave `ANALYTICS_DELIVERY_ENABLED=false`; the job fails visibly when disabled.
4. After an authorized deployment and explicit enablement, monitor the first scheduled execution and reconcile ledger and Resend. Do not manually call the ordinary weekly route to regenerate a past week.

## W44 investigation

`POST /api/cron/analytics-w44-preflight` is a fixed-period preview, unavailable unless `ANALYTICS_W44_PREFLIGHT_ENABLED=true` on Timeweb and a valid `CRON_SECRET` is provided. Set the gate only temporarily after separate approval. It reads reporting sources, validates the built digest's W44 identity and dates, and returns only source status and period. It neither claims the ledger nor sends mail. It does not assert that historical inputs are complete, immutable, or identical to those available on 2 November.

The reporting anchor is 2026-11-02 06:30 UTC, producing the Moscow week 2026-10-26 through 2026-11-01. Confirm source history, retention, Metrika attribution and any data changed after that date. An `ok` source response is not proof of historical completeness. The preview is not a delivery endpoint; recovery and any partial report require an independently reviewed, separately authorized delivery procedure. Reconcile ledger state and Resend first, especially unknown provider outcomes. Never replay based solely on a missing inbox message.

Timeweb's production default must keep both `ANALYTICS_DELIVERY_ENABLED` and `ANALYTICS_W44_PREFLIGHT_ENABLED` disabled. Deploying this package is not approval to activate or send.

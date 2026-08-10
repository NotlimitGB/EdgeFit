# EdgeFit Analytics Delivery Architecture

Status: approved design for Task 012J.5

Baseline: `17885b8619d9e23d2938945cef217bcc6acd7a4a`

Scope: architecture only; no delivery pipeline is implemented by this document.

## 1. Executive decision

The primary delivery architecture is a push pipeline:

```text
EdgeFit production
  -> builds a privacy-safe structured digest
  -> sends it through Resend to an owner-controlled Gmail mailbox
  -> ChatGPT Scheduled Tasks reads the digest through a connected Gmail app
  -> the owner receives daily and weekly analysis
```

The fallback is a dedicated private GitHub repository in which EdgeFit creates or updates one deterministic private issue per digest. ChatGPT reads those issues through a connected GitHub tool. The fallback is activated only if Gmail access is unavailable or unreliable for the owner's ChatGPT account.

The AI never receives `DATABASE_URL`, `YANDEX_METRIKA_OAUTH_TOKEN`, internal-access credentials, `CRON_SECRET`, Vercel credentials, or a public analytics endpoint. EdgeFit remains responsible for database access, Yandex access, report generation, privacy projection, and delivery.

Email is selected because it is a private push surface that serves the human owner and the AI analyst with little operational infrastructure. Resend supports attachments and provider-side idempotency keys, although its 24-hour idempotency window does not replace EdgeFit's durable delivery ledger. ChatGPT Scheduled Tasks can run recurring work and use connected tools available to the task; connector availability and permissions must be verified before automation is enabled.

## 2. Current analytics architecture

The current production reporting surface is `GET /api/internal/analytics-report`. It is a dynamic Node route protected by the existing internal cookie/password boundary and responds with `Cache-Control: private, no-store, max-age=0`. The human dashboard is `/internal/analytics`.

The report version is `edgefit-analytics-report-v1` and contains:

- Yandex traffic and acquisition conversion data;
- first-party ordered-session funnel metrics;
- commerce, merchant, placement, board, offer, and size evidence;
- completed-day 7-day and 30-day comparisons;
- Partner Readiness and data-quality warnings.

First-party reporting uses aggregate SELECT-only queries. Yandex access is centralized in the backend. Report generation currently performs eight Yandex Reports API requests: five traffic requests and three acquisition requests.

Existing operational foundations:

- Vercel Cron already invokes `/api/cron/catalog-refresh` at `0 0 * * *`;
- cron authorization already uses `CRON_SECRET` as a Bearer token;
- `DATABASE_URL`, internal-access variables, Yandex counter/token variables, and `CRON_SECRET` already exist in the environment contract;
- no outbound email, Slack, Telegram, or generic webhook provider is installed;
- the current report route must remain private and is not reused as an AI-facing endpoint.

## 3. Requirements

The delivery system must support three consumers:

1. The human owner, who needs readable daily and weekly summaries and visible failures.
2. ChatGPT as an AI analyst, which needs machine-readable evidence through a revocable private source.
3. Future Partner Readiness monitoring, which needs deterministic metric and manual-gate states without autonomous partner contact.

Required properties:

- push a privacy-safe projection instead of delegating production access;
- operate only on completed `Europe/Moscow` calendar days;
- deliver separate daily and weekly evidence artifacts;
- keep backend evidence structured and non-speculative;
- provide durable idempotency, bounded retry, audit history, and explicit degraded states;
- make missed or partial delivery visible without presenting it as healthy;
- allow the owner to revoke downstream AI access independently of EdgeFit production;
- retain near-zero fixed cost and avoid enterprise infrastructure.

The design does not change tracking, the reporting API, the internal dashboard, analytics authority, recommendation behavior, catalog behavior, or partner outreach policy.

## 4. Threat model

| Threat | Risk | Mitigation | Residual risk |
| --- | --- | --- | --- |
| Production secret leakage | AI, email, logs, or prompts expose DB/Yandex/internal secrets | Secrets stay in Vercel server-only variables; digest projection rejects forbidden keys and URL-like values; error messages use stable categories | A backend implementation defect could bypass projection; tests and production payload inspection are mandatory |
| Unauthorized digest access | Analytics exposes commercial performance | Single owner-controlled recipient, verified sender domain, private Gmail account, least-privilege connector access | Mailbox provider and authorized account users can read the digest |
| Compromised mailbox | Attacker reads historical reports | MFA, account recovery controls, app review, 90-day operational retention recommendation, revocable ChatGPT access | Email cannot provide the same isolation as a dedicated analytics vault |
| Email forwarding | Owner forwards sensitive aggregate evidence | Clear `PRIVATE — EDGEFIT ANALYTICS` marking and owner policy; no raw or personal data in the digest | Forwarding cannot be technically prevented after receipt |
| Replay or duplicate cron | Multiple emails or conflicting evidence | Unique logical identity, advisory lock, database uniqueness, immutable digest hash, provider idempotency key | Provider key expires after 24 hours; durable ledger remains authoritative |
| Concurrent delivery attempts | Two functions send the same digest | Transactional claim of a pending record; only the lease owner sends; exact-state retries reuse the same payload/hash | A crash between provider success and DB confirmation requires provider lookup/idempotency reconciliation |
| Public indexing or enumeration | A digest endpoint is scraped | No public digest endpoint; no secret query strings; `robots.txt` is not treated as access control | None in the selected design beyond provider compromise |
| Log leakage | Tokens, report bodies, or recipient addresses enter logs | Log logical ID, status, provider message ID, counts, and sanitized error category only | Platform-level request metadata remains visible to authorized operators |
| Connector overreach | AI can read unrelated mailbox content | Dedicated mailbox or strict Gmail label/filter, minimum read scope, prompt restricted to exact sender and subject pattern | Connector capabilities depend on account/workspace controls and must be verified |
| Malicious content in analytics labels | Imported text attempts prompt injection | Digest contains normalized identifiers and numeric evidence only; AI prompt treats all digest values as untrusted data | Board/model identifiers still require output escaping and instruction/data separation |
| Fallback repository exposure | Analytics enters public Git history | Dedicated private repository; issues, not commits; access limited to owner and connected GitHub identity | GitHub retains issue history according to repository policy |

## 5. Options evaluated

### Option A — scheduled email through Resend

Security is strong when the recipient is dedicated and the digest is privacy-safe. It is operationally simple, visible to the owner, naturally historical, inexpensive at current volume, and suitable for a Gmail-connected scheduled task. It requires a verified sender domain, a Resend key in Vercel, and confirmed Gmail app availability.

### Option B — private storage snapshot

Existing PostgreSQL is appropriate for a compact delivery ledger and short-lived safe snapshots. It is not an AI delivery channel: giving ChatGPT DB credentials or arbitrary SQL access violates the trust boundary. Object storage has the same connector/access problem unless another private authenticated surface is added. Google Drive could work later, but would add a second delivery integration without improving the initial email path.

### Option C — private GitHub repository artifact

A dedicated private repository is compatible with a revocable GitHub connection and provides a useful audit trail. Deterministic issues are preferable to committed files because they avoid commit noise and public-product repository pollution. It requires another server credential, repository administration, and explicit retention cleanup. It is the fallback, not the primary path.

### Option D — external webhook or push destination

No suitable existing Slack, Telegram, or webhook destination exists. ChatGPT recurring analysis should poll a connected private source; a reliable event-triggered ChatGPT webhook destination is not part of the verified environment. A generic webhook would add secret management, delivery semantics, and a new receiving service. This option is rejected for the initial architecture.

### Option E — public or nominally redacted endpoint

A public digest would expose traffic, conversion, merchant, partner-readiness, and product performance data to enumeration, scraping, competitors, or accidental indexing. An unguessable URL or query-string secret is not authentication. This option is rejected.

## 6. Decision matrix

Scores are relative: 5 is best. Security is weighted highest.

| Option | Security | Simplicity | ChatGPT access | Audit/history | Cost | Maintenance | Decision |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| A. Resend email + Gmail | 4 | 5 | 4 | 4 | 5 | 4 | Primary |
| B. Private DB/object snapshot | 5 | 3 | 1 | 5 | 4 | 3 | Internal ledger only |
| C. Private GitHub issue | 4 | 3 | 4 | 5 | 5 | 3 | Fallback |
| D. External webhook | 3 | 2 | 1 | 2 | 3 | 2 | Rejected |
| E. Public digest endpoint | 1 | 4 | 5 | 2 | 5 | 4 | Rejected |

The Gmail score is conditional: before Task 012J.5D, the owner's account/workspace must confirm that a scheduled task can use the Gmail app persistently. If this gate fails, the private GitHub fallback becomes active without weakening the privacy boundary.

## 7. Selected architecture

### Production pipeline

1. A `CRON_SECRET`-protected Vercel Cron route requests a daily or weekly logical period.
2. The route acquires the delivery advisory lock and checks the durable ledger.
3. EdgeFit calls the existing reporting service internally; it does not call the cookie-protected HTTP route.
4. A pure builder projects the report into `edgefit-digest-v1` and runs the privacy validator.
5. Canonical JSON is generated with recursive key ordering. `generatedAt` is excluded from the logical evidence hash.
6. The ledger records the immutable digest, hash, kind, logical period, status, and attempts.
7. Resend sends a plain-text and minimal HTML summary plus a JSON attachment.
8. The provider idempotency key is derived from the logical identity and digest hash.
9. The ledger records provider acknowledgement or a sanitized failure category.
10. ChatGPT Scheduled Tasks reads only delivered messages matching the exact sender and subject pattern.

### Email contract

- Provider: Resend.
- Sender: `EdgeFit Analytics <analytics@<verified-edgefit-domain>>`.
- Recipient: one server-only `ANALYTICS_DELIVERY_RECIPIENT`; no recipient comes from leads or request input.
- Daily subject: `EdgeFit Daily Analytics — YYYY-MM-DD [daily:YYYY-MM-DD]`.
- Weekly subject: `EdgeFit Weekly Analytics — YYYY-Www [weekly:YYYY-Www]`.
- Failure subject: `EdgeFit Analytics Delivery Failure — <logicalId>`.
- Body: concise status, periods, headline metrics, warnings, and attachment hash; never a full raw report.
- Attachment: authoritative UTF-8 JSON named `edgefit-daily-YYYY-MM-DD.json` or `edgefit-weekly-YYYY-Www.json`.
- Classification banner: `PRIVATE — EDGEFIT ANALYTICS`.

The provider API key, sender, and recipient are Vercel server-only variables. They are never included in the digest, URL, client bundle, task prompt, or logs.

## 8. Trust boundaries

```text
Boundary A — EdgeFit production / Vercel
  owns DATABASE_URL, Yandex OAuth, CRON_SECRET, Resend key
  reads source analytics and builds the privacy projection

Boundary B — delivery provider
  receives recipient address and privacy-safe message only
  never receives production DB or Yandex credentials

Boundary C — owner mailbox
  stores the delivered safe digest
  is protected and revocable independently

Boundary D — ChatGPT connected Gmail app
  reads only the private delivered artifact under user-granted permissions
  holds no EdgeFit production credentials
```

The AI must not call `/api/internal/analytics-report`, authenticate through the internal login, query PostgreSQL, or call Yandex directly. If Gmail is disconnected, scheduled analysis stops without affecting EdgeFit reporting or the owner email.

## 9. Daily digest schema

The machine-readable contract is versioned independently from the internal report:

```json
{
  "version": "edgefit-digest-v1",
  "kind": "daily",
  "logicalId": "daily:2026-08-09",
  "generatedAt": "2026-08-10T06:15:00.000Z",
  "asOfDate": "2026-08-09",
  "timezone": "Europe/Moscow",
  "status": "complete",
  "sourceReport": {
    "version": "edgefit-analytics-report-v1",
    "evidenceHash": "sha256:<hex>"
  },
  "periods": {
    "yesterday": { "startDate": "2026-08-09", "endDate": "2026-08-09" },
    "last7Days": { "startDate": "2026-08-03", "endDate": "2026-08-09" },
    "previous7Days": { "startDate": "2026-07-27", "endDate": "2026-08-02" },
    "last30Days": { "startDate": "2026-07-11", "endDate": "2026-08-09" },
    "previous30Days": { "startDate": "2026-06-11", "endDate": "2026-07-10" }
  },
  "sourceStatus": {},
  "traffic": {},
  "acquisition": {},
  "funnel": {},
  "commerce": {},
  "trends": {},
  "partnerReadiness": {},
  "dataQuality": [],
  "sampling": {},
  "delivery": {
    "contentHash": "sha256:<hex>"
  }
}
```

Required daily evidence:

- traffic: yesterday users/visits; last/previous 7-day users and visits; WoW values; last-30-day users/visits;
- acquisition: traffic-to-quiz-start, traffic-to-result, and traffic-to-store; source and safe landing-path conversions;
- first-party funnel: quiz starts, ordered completions and rate; result sessions, ordered result-to-store and rate;
- commerce: click events/sessions, merchant split, placements, top canonical boards, and exact offers;
- Partner Readiness: score, status, metric gates, manual gates, and strict state;
- data quality: source availability, sampling metadata, and stable warnings.

`status` is `complete` only when all required sources for the digest are healthy. A usable report with one unavailable source uses `partial`; missing values remain `null` and are never converted to zero.

## 10. Weekly analysis contract

The backend creates a distinct `weekly` digest after Sunday closes. Its identity is the ISO week containing the completed Monday–Sunday period, for example `weekly:2026-W32`. It uses the same schema version with `kind: weekly`, exact week/previous-week periods, and structured evidence only.

The weekly ChatGPT task must produce:

- week-over-week headline trends;
- largest supported positive and negative movements;
- traffic-source and landing-path changes;
- acquisition and ordered-funnel conversion changes, clearly separated by authority;
- merchant and store-click changes;
- board and exact-offer winners;
- data-quality and delivery incidents;
- Partner Readiness score, status, and gate movement;
- an owner recommendation that distinguishes observation, investigation, and action.

The AI must cite logical IDs and values from the digest, label partial/sampled evidence, and avoid causal claims not supported by the data. The backend never generates narrative, ranks business causes, or recommends contacting a partner.

## 11. Scheduling

All business periods use `Europe/Moscow`; Vercel cron expressions use UTC.

| Operation | UTC cron | Moscow intent | Data boundary |
| --- | --- | --- | --- |
| Daily digest | `15 6 * * *` | 09:15 daily | Previous completed Moscow day |
| Weekly digest | `30 6 * * 1` | 09:30 Monday | Previous completed Monday–Sunday week |
| Pending retry sweep | `15 8 * * *` | 11:15 daily | Pending/unknown deliveries only |
| ChatGPT Daily | Task schedule at 10:30 Moscow | After normal delivery window | Exact daily logical ID |
| ChatGPT Weekly | Task schedule Monday at 11:00 Moscow | After weekly delivery window | Exact weekly logical ID |

The schedules avoid midnight while Yandex data may still settle. Vercel Cron can deliver duplicate invocations and does not provide automatic retries, so the application owns idempotency and retry. Cron runs are billed as function usage. If the deployed Vercel plan provides only hourly precision, the acceptable delivery window is the scheduled Moscow hour; ChatGPT analysis must start after that window, not at 10:30, and Task 012J.5B must adjust the analysis handoff time accordingly.

## 12. Idempotency

The future additive ledger stores:

- `logical_id` unique, such as `daily:2026-08-09`;
- digest kind and exact period;
- canonical digest JSON and immutable SHA-256 hash;
- state: `pending`, `sending`, `sent`, `partial_sent`, `failed`, or `conflict`;
- attempt count, lease/attempt timestamps, provider message ID, sent timestamp;
- sanitized failure category and last failure timestamp.

Generation and state claiming use a transaction-level advisory lock plus the unique logical ID. An existing `sent` or `partial_sent` record with the same hash is a zero-write delivery no-op. The same logical ID with a different evidence hash is a blocking conflict and is not silently replaced.

The Resend idempotency key is `edgefit/<logicalId>/<contentHash>`. Because provider keys expire after 24 hours, the database ledger is authoritative for late retries. A provider `409` for an identical request is reconciled; a different-payload conflict is marked `conflict` and requires owner review.

## 13. Retention

Store the compact privacy-safe digest and delivery attempts for 90 rolling days. This provides daily comparisons, weekly history, incident diagnosis, and idempotent retries without indefinitely duplicating source analytics.

After 90 days, delete digest JSON, provider message ID, and attempt details in a bounded cleanup. No raw analytics payload, session identifier, email lead, destination URL, or visitor data is copied into the ledger. Aggregate source analytics retain their existing independent policies.

Mailbox retention is owner-controlled; the recommended Gmail label keeps 90 days of EdgeFit analytics and then archives or deletes according to account policy. The fallback private repository must apply the same 90-day issue lifecycle. Indefinite Git or email history is not required by this architecture.

## 14. Failure handling

| Failure | Behavior | Retry | Visibility |
| --- | --- | --- | --- |
| Yandex unavailable, first-party usable | Build `partial` digest; preserve `null`; include source diagnostic and warning | Existing bounded Yandex policy only; no endless retry | Subject/body marked `PARTIAL` |
| First-party DB unavailable | Do not send a normal digest | No DB mutation; at most two generation attempts in one invocation | Send sanitized failure email if provider is available; platform log records category only |
| Both report sources unusable | No normal digest | Retry sweep may regenerate once after the normal window | Explicit failure notice, never an empty healthy report |
| Resend network/5xx/429 | Keep ledger pending; maximum two attempts in invocation | Daily retry sweep; bounded attempt ceiling of five across runs | Pending/failed state and platform alert |
| Resend validation/auth error | Mark non-retryable failed | No automatic retry until configuration changes | Sanitized configuration failure notice in platform monitoring |
| Cron missed | No logical ID exists by cutoff | ChatGPT checks the exact subject/ID and reports `DELIVERY_MISSING`; operator may invoke an authenticated replay | Scheduled task notification and Vercel cron history |
| Digest builder/privacy validation fails | Abort before delivery | No retry for deterministic validation failure | Blocking incident with logical ID and validator code |
| Duplicate invocation | Existing exact sent state is a no-op | None | Counted as duplicate/no-op, not an incident |
| Unknown provider outcome | Keep `sending/unknown`; do not immediately resend | Reconcile by provider message/idempotency response, then retry | Delivery state explicitly unknown until reconciled |

Retries use capped exponential delays inside the function where practical and the single retry sweep for durable pending records. There is no infinite retry loop. The retry worker processes old pending deliveries before generating new provider sends.

## 15. Privacy

Allowed fields:

- aggregate counts, rates, shares, trends, thresholds, and statuses;
- sampling metadata and safe data-quality codes;
- normalized merchant hostname;
- canonical board slug and exact offer slug;
- privacy-safe landing path without scheme, host, query, or fragment;
- traffic-source ID and localized display name.

Forbidden fields and values:

- session ID or other user-level identifier;
- email address, phone number, name, lead contents, or recipient inside the JSON attachment;
- height, weight, boot size, stance, or raw quiz answers;
- raw analytics payloads or nested unapproved objects;
- destination URLs and complete visitor URLs/query strings;
- cookies, authorization headers, OAuth tokens, database credentials, internal passwords/secrets, cron secrets, or provider keys.

Task 012J.5A must implement an explicit allowlist projection followed by a recursive validator. The validator rejects forbidden key patterns, unexpected nested structures, non-finite numbers, full URL values, query/fragment-bearing landing paths, and unknown schema keys. Logs contain only logical ID, digest hash prefix, status, safe counts, and stable error category.

## 16. Partner-readiness monitoring

The current measurable Partner Readiness calculation remains authoritative and unchanged. Automation reports two independent layers:

1. **Metric readiness** — score, status, five metric gates, and strict measurable state from the report.
2. **Business readiness** — the four owner-controlled manual gates: catalog integrity, exact-size routing, content-rights review, and commercial offer preparation.

Future presentation states:

- `BUILDING_EVIDENCE`: metric gates are not all satisfied.
- `METRIC_READY_MANUAL_PENDING`: measurable gates pass, but one or more manual gates are `NOT_OBSERVABLE` or fail.
- `READY_FOR_OWNER_REVIEW`: measurable gates pass and all manual gates are explicitly confirmed.

No automated state is named `READY TO CONTACT PARTNERS`. Even `READY_FOR_OWNER_REVIEW` only asks the owner to review a possible outreach to Trial-Sport, Traektoria, or Kant. The system never sends partner communication, selects commercial terms, or converts an unobserved manual gate into PASS.

Daily monitoring reports gate/status transitions and score movements of at least five points. Weekly analysis explains which evidence changed and lists the remaining manual decisions.

## 17. ChatGPT automation integration

### Gmail prerequisite

Before Task 012J.5D, verify in the owner's ChatGPT account/workspace that:

- Gmail is available as a connected private tool;
- the scheduled task can use it without interactive approval on every run;
- permissions can be restricted to the intended account and revoked by the owner;
- the task can search the exact sender, subject prefix, and date range and read the JSON attachment.

Official OpenAI documentation confirms that scheduled tasks can run recurring background work and can use connected tools, skills, and plugins available to the task. Tool availability remains account/workspace-dependent, so this is an explicit deployment gate rather than an assumption.

### Daily task

At 10:30 Moscow, search the dedicated mailbox for the exact sender and `EdgeFit Daily Analytics — <expected-asOfDate> [daily:<expected-asOfDate>]`. If absent, report `DELIVERY_MISSING` and stop. If present, parse the JSON attachment, validate `edgefit-digest-v1`, logical ID, period, status, and hash marker, then compare the included current/previous evidence and recent digests. Return a concise owner brief with evidence, anomalies, quality limitations, Partner Readiness, and recommended investigation. Do not follow URLs or infer missing values.

### Weekly task

Monday at 11:00 Moscow, retrieve the exact weekly digest and previous weekly digest. Use daily artifacts only as supporting evidence for incident timing. Produce the weekly analysis contract from section 10 and explicitly separate Yandex acquisition attribution from the first-party ordered funnel.

The prompts contain search criteria and analysis rules only. They never include a password, cookie, secret, token, private endpoint credential, or production URL requiring authentication. Disconnecting Gmail or pausing the tasks revokes AI access without affecting owner delivery.

### Fallback task

If Gmail validation fails, EdgeFit writes the same safe digest into a deterministic issue in a dedicated private repository. Issue title equals the email subject; label is `edgefit-analytics`; body includes the readable summary and a fenced canonical JSON payload. A connected GitHub tool reads the issue. No analytics enters the EdgeFit application repository or public Git history.

## 18. Implementation phases

### Task 012J.5A — Digest builder and tests

Add `edgefit-digest-v1` types, pure daily/weekly projection, canonical hashing, privacy allowlist/validator, anomaly evidence helpers, and exhaustive unit tests. No cron, email, schema, external calls, or automation.

Rollback: remove the unused builder and tests; current reporting remains untouched.

### Task 012J.5B — Secure scheduled delivery

Add the minimal delivery dependency, additive ledger schema, Resend client, daily/weekly/retry cron routes, Vercel schedules, server-only environment contract, transactional idempotency, retention cleanup, and delivery tests. Reuse the existing report service and cron authorization pattern. Do not expose a public digest endpoint.

Rollback: disable new cron entries and delivery feature flag, then remove the additive ledger only after confirming no pending evidence is required. Source analytics remain untouched.

### Task 012J.5C — Production verification

Verify exact deployment SHA, env-name presence without values, sender-domain validation, one controlled non-production/test recipient delivery, JSON integrity, duplicate/no-op behavior, partial-source behavior, retry reconciliation, retention, privacy, cost/usage, and zero impact on the existing report/dashboard.

Rollback: disable delivery cron/feature flag; internal reporting continues normally.

### Task 012J.5D — ChatGPT Daily automation

Validate Gmail availability and permissions, manually test the prompt on safe delivered evidence, create the daily scheduled task, observe initial runs, verify missing/partial behavior, and document revocation. If the Gmail gate fails, activate the private GitHub fallback rather than exposing EdgeFit.

Rollback: pause/delete the task and revoke Gmail/GitHub app access.

### Task 012J.5E — ChatGPT Weekly automation

Create and verify the weekly task, prior-period comparisons, anomaly thresholds, source-authority labeling, Partner Readiness wording, and owner notifications. It may start only after daily delivery and daily analysis are stable.

Rollback: pause/delete the weekly task; daily delivery and analysis remain independent.

## 19. Rollback

The architecture is additive and preserves the current reporting path throughout rollout.

- A feature flag disables all digest generation and sending without changing `/api/internal/analytics-report`.
- Removing the new Vercel cron entries stops scheduled delivery; existing catalog refresh remains intact.
- Revoking the Resend key prevents outbound mail without affecting reporting.
- Pausing ChatGPT tasks or disconnecting Gmail/GitHub immediately removes AI access to new artifacts.
- The fallback repository can be archived without changing EdgeFit.
- The ledger is deleted only after delivery is disabled and pending/unknown states are resolved; analytics source rows are never deleted or rewritten.
- Each implementation task is reverted independently in reverse order: 5E, 5D, 5C verification/configuration, 5B delivery, then 5A projection.

Rollback must not make the internal report public, weaken authentication, migrate raw analytics, or place a production secret into another channel.

## 20. Open questions

These are deployment prerequisites, not unresolved architectural choices. Safe defaults are fixed:

1. **Sender domain:** which verified EdgeFit domain/address will send mail? Default: `analytics@<verified-edgefit-domain>`. Production delivery is blocked until domain verification succeeds.
2. **Recipient:** which dedicated owner-controlled Gmail address receives reports? It is configured as one server-only address and never sourced from lead data.
3. **Vercel plan precision:** does production support the specified minute-level cron schedule? If not, use the documented hourly delivery window and move ChatGPT analysis after that window; do not add an external scheduler merely for precision.
4. **Gmail task capability:** can the owner's ChatGPT account/workspace grant persistent scheduled-task access to Gmail with acceptable scope? If no, activate the private GitHub fallback.
5. **Mailbox retention:** can the dedicated label apply a 90-day operational policy? If not, the owner documents the actual mailbox retention while backend retention remains 90 days.
6. **Fallback repository:** create it only when Gmail capability fails. Default: private, dedicated, no forks, owner plus service identity only, 90-day issue lifecycle.

No open question permits a public endpoint, a secret in an automation prompt or URL, direct AI access to PostgreSQL/Yandex, or automatic partner contact.

### Reference contracts

- [OpenAI — Scheduled tasks](https://learn.chatgpt.com/docs/automations)
- [Vercel — Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Vercel — Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
- [Vercel — Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Resend — Idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Resend — Attachments](https://resend.com/docs/dashboard/emails/attachments)
- [Resend — Pricing](https://resend.com/pricing)

### Expected operating cost

- Vercel: about 30 daily, 4–5 weekly, and 30 lightweight retry-sweep function invocations per month, plus exceptional retries.
- Yandex: approximately `8 × (30 + 4–5) = 272–280` Reports API requests per month; retry sweeps do not call Yandex unless they must regenerate a missing digest.
- Resend: about 34–35 normal messages per month plus rare failure notices, well below the currently documented free allowance; pricing must be rechecked in Task 012J.5B.
- Storage: roughly 100 digest rows at steady state under a rolling 90-day policy, plus bounded attempt metadata.
- Maintenance: one privacy projection, one delivery provider, one ledger, and two scheduled AI tasks; no public API or dedicated queue service.

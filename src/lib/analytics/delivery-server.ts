import "server-only";
import { randomUUID } from "node:crypto";
import { Resend, type CreateEmailOptions, type ErrorResponse } from "resend";
import type { Sql } from "postgres";
import {
  buildDailyAnalyticsDigest,
  buildWeeklyAnalyticsDigest,
  getAnalyticsDigestPrivacyViolations,
  type AnalyticsDigest,
} from "@/lib/analytics/digest";
import {
  ANALYTICS_DELIVERY_LEASE_MS,
  ANALYTICS_DELIVERY_MAX_ATTEMPTS,
  ANALYTICS_DELIVERY_RETRY_BATCH_SIZE,
  ANALYTICS_DELIVERY_RETENTION_BATCH_SIZE,
  authorizeAnalyticsCron,
  buildAnalyticsDigestEmailEnvelope,
  buildAnalyticsFailureEmailEnvelope,
  classifyAnalyticsProviderResult,
  getAnalyticsDeliveryBackoffMs,
  getAnalyticsDeliveryClaimDecision,
  parseAnalyticsDeliveryConfig,
  validateStoredAnalyticsDigest,
  type AnalyticsDeliveryConfig,
  type AnalyticsDeliveryLedgerRow,
  type AnalyticsDeliveryResult,
  type AnalyticsProviderOutcome,
} from "@/lib/analytics/delivery-core";
import { getAnalyticsReport } from "@/lib/analytics/reporting-server";
import { получитьКлиентБазы } from "@/lib/database/client";

interface RawDeliveryRow {
  logicalId: string;
  kind: AnalyticsDigest["kind"];
  digest: unknown;
  digestStatus: AnalyticsDigest["status"];
  evidenceHash: string;
  contentHash: string;
  deliveryStatus: AnalyticsDeliveryLedgerRow["deliveryStatus"];
  attemptCount: number;
  leaseToken: string | null;
  leaseExpiresAt: string | Date | null;
  nextAttemptAt: string | Date | null;
  lastAttemptAt: string | Date | null;
  lastErrorCategory: string | null;
  createdAt: string | Date;
}

export interface AnalyticsDeliveryClaim {
  status: "claimed" | "noop" | "busy" | "failed" | "conflict";
  logicalId: string;
  digest?: AnalyticsDigest;
  leaseToken?: string;
  attemptCount?: number;
  category?: string;
}

export interface AnalyticsDeliveryRepository {
  claim(digest: AnalyticsDigest, now: Date): Promise<AnalyticsDeliveryClaim>;
  finish(
    claim: Required<Pick<AnalyticsDeliveryClaim, "logicalId" | "leaseToken" | "attemptCount">>,
    digest: AnalyticsDigest,
    outcome: AnalyticsProviderOutcome,
    now: Date,
  ): Promise<AnalyticsDeliveryResult>;
  listDue(now: Date, limit: number): Promise<AnalyticsDeliveryLedgerRow[]>;
  reject(logicalId: string, category: string, now: Date): Promise<void>;
  cleanup(now: Date, limit: number): Promise<number>;
}

export interface AnalyticsMailer {
  send(
    envelope: ReturnType<typeof buildAnalyticsDigestEmailEnvelope>,
  ): Promise<{ data: { id: string } | null; error: ErrorResponse | null }>;
}

export interface AnalyticsDeliveryDependencies {
  env: Record<string, string | undefined>;
  reportLoader: typeof getAnalyticsReport;
  repositoryFactory(config: AnalyticsDeliveryConfig): AnalyticsDeliveryRepository;
  mailerFactory(config: AnalyticsDeliveryConfig): AnalyticsMailer;
  logger: Pick<Console, "info" | "error">;
}

const defaultDependencies: AnalyticsDeliveryDependencies = {
  env: process.env,
  reportLoader: getAnalyticsReport,
  repositoryFactory: () => createPostgresAnalyticsDeliveryRepository(получитьКлиентБазы()),
  mailerFactory: (config) => createResendAnalyticsMailer(config),
  logger: console,
};

function asDate(value: string | Date | null) {
  return value == null ? null : value instanceof Date ? value : new Date(value);
}

function mapDeliveryRow(row: RawDeliveryRow): AnalyticsDeliveryLedgerRow {
  return {
    ...row,
    leaseExpiresAt: asDate(row.leaseExpiresAt),
    nextAttemptAt: asDate(row.nextAttemptAt),
    lastAttemptAt: asDate(row.lastAttemptAt),
    createdAt: asDate(row.createdAt) ?? new Date(0),
  };
}

function safeLog(
  logger: Pick<Console, "info" | "error">,
  level: "info" | "error",
  result: AnalyticsDeliveryResult,
) {
  logger[level]("analytics_delivery", {
    status: result.status,
    logicalId: result.logicalId,
    category: result.category,
    processed: result.processed,
    deleted: result.deleted,
  });
}

export function createPostgresAnalyticsDeliveryRepository(
  sql: Sql,
): AnalyticsDeliveryRepository {
  return {
    async claim(digest, now) {
      return sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtextextended(${digest.logicalId}, 0))`;
        const rows = await tx<RawDeliveryRow[]>`
          select
            logical_id as "logicalId",
            kind,
            digest,
            digest_status as "digestStatus",
            evidence_hash as "evidenceHash",
            content_hash as "contentHash",
            delivery_status as "deliveryStatus",
            attempt_count as "attemptCount",
            lease_token as "leaseToken",
            lease_expires_at as "leaseExpiresAt",
            next_attempt_at as "nextAttemptAt",
            last_attempt_at as "lastAttemptAt",
            last_error_category as "lastErrorCategory",
            created_at as "createdAt"
          from analytics_digest_deliveries
          where logical_id = ${digest.logicalId}
          for update
        `;
        const existing = rows[0] ? mapDeliveryRow(rows[0]) : null;
        const decision = getAnalyticsDeliveryClaimDecision(existing, digest, now);

        if (decision.action === "noop" || decision.action === "busy") {
          return { status: decision.action, logicalId: digest.logicalId };
        }
        if (decision.action === "conflict") {
          await tx`
            update analytics_digest_deliveries
            set delivery_status = 'conflict',
                last_error_category = ${decision.category},
                last_failure_at = ${now},
                updated_at = ${now}
            where logical_id = ${digest.logicalId}
          `;
          return {
            status: "conflict",
            logicalId: digest.logicalId,
            category: decision.category,
          };
        }
        if (decision.action === "fail") {
          if (existing?.deliveryStatus !== "failed") {
            await tx`
              update analytics_digest_deliveries
              set delivery_status = 'failed',
                  lease_token = null,
                  lease_expires_at = null,
                  next_attempt_at = null,
                  last_error_category = ${decision.category},
                  last_failure_at = ${now},
                  updated_at = ${now}
              where logical_id = ${digest.logicalId}
            `;
          }
          return {
            status: "failed",
            logicalId: digest.logicalId,
            category: decision.category,
          };
        }

        const leaseToken = randomUUID();
        const leaseExpiresAt = new Date(now.getTime() + ANALYTICS_DELIVERY_LEASE_MS);
        if (decision.action === "create_and_claim") {
          const period =
            digest.kind === "daily" ? digest.periods.yesterday : digest.periods.last7Days;
          await tx`
            insert into analytics_digest_deliveries (
              logical_id, kind, as_of_date, period_start, period_end,
              digest, digest_status, evidence_hash, content_hash,
              delivery_status, attempt_count, lease_token, lease_expires_at,
              last_attempt_at, created_at, updated_at
            ) values (
              ${digest.logicalId}, ${digest.kind}, ${digest.asOfDate},
              ${period.startDate}, ${period.endDate},
              ${tx.json(digest as unknown as Parameters<typeof tx.json>[0])}, ${digest.status},
              ${digest.sourceReport.evidenceHash}, ${digest.delivery.contentHash},
              'sending', 1, ${leaseToken}, ${leaseExpiresAt}, ${now}, ${now}, ${now}
            )
          `;
          return {
            status: "claimed",
            logicalId: digest.logicalId,
            digest,
            leaseToken,
            attemptCount: 1,
          };
        }

        const stored = validateStoredAnalyticsDigest(existing!);
        if (!stored.ok) {
          await tx`
            update analytics_digest_deliveries
            set delivery_status = 'conflict',
                last_error_category = ${stored.category},
                last_failure_at = ${now},
                updated_at = ${now}
            where logical_id = ${digest.logicalId}
          `;
          return {
            status: "conflict",
            logicalId: digest.logicalId,
            category: stored.category,
          };
        }
        const attemptCount = existing!.attemptCount + 1;
        await tx`
          update analytics_digest_deliveries
          set delivery_status = 'sending',
              attempt_count = ${attemptCount},
              lease_token = ${leaseToken},
              lease_expires_at = ${leaseExpiresAt},
              next_attempt_at = null,
              last_attempt_at = ${now},
              updated_at = ${now}
          where logical_id = ${digest.logicalId}
        `;
        return {
          status: "claimed",
          logicalId: digest.logicalId,
          digest: stored.digest,
          leaseToken,
          attemptCount,
        };
      });
    },

    async finish(claim, digest, outcome, now) {
      return sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtextextended(${claim.logicalId}, 0))`;
        if (outcome.type === "success") {
          const status = digest.status === "complete" ? "sent" : "partial_sent";
          const updated = await tx<{ logicalId: string }[]>`
            update analytics_digest_deliveries
            set delivery_status = ${status},
                lease_token = null,
                lease_expires_at = null,
                next_attempt_at = null,
                provider_message_id = ${outcome.messageId},
                last_error_category = null,
                sent_at = ${now},
                updated_at = ${now}
            where logical_id = ${claim.logicalId}
              and delivery_status = 'sending'
              and lease_token = ${claim.leaseToken}
            returning logical_id as "logicalId"
          `;
          return updated.length
            ? { status, logicalId: claim.logicalId }
            : { status: "failed", logicalId: claim.logicalId, category: "delivery_lease_lost" };
        }

        const terminal =
          outcome.type === "conflict" ||
          outcome.type === "failed" ||
          claim.attemptCount >= ANALYTICS_DELIVERY_MAX_ATTEMPTS;
        const status = outcome.type === "conflict" ? "conflict" : terminal ? "failed" : "pending";
        const nextAttemptAt =
          status === "pending"
            ? new Date(now.getTime() + getAnalyticsDeliveryBackoffMs(claim.attemptCount))
            : null;
        const updated = await tx<{ logicalId: string }[]>`
          update analytics_digest_deliveries
          set delivery_status = ${status},
              lease_token = null,
              lease_expires_at = null,
              next_attempt_at = ${nextAttemptAt},
              last_error_category = ${outcome.category},
              last_failure_at = ${now},
              updated_at = ${now}
          where logical_id = ${claim.logicalId}
            and delivery_status = 'sending'
            and lease_token = ${claim.leaseToken}
          returning logical_id as "logicalId"
        `;
        if (!updated.length) {
          return { status: "failed", logicalId: claim.logicalId, category: "delivery_lease_lost" };
        }
        return { status, logicalId: claim.logicalId, category: outcome.category };
      });
    },

    async listDue(now, limit) {
      const safeLimit = Math.min(Math.max(limit, 0), ANALYTICS_DELIVERY_RETRY_BATCH_SIZE);
      const rows = await sql<RawDeliveryRow[]>`
        select
          logical_id as "logicalId", kind, digest,
          digest_status as "digestStatus", evidence_hash as "evidenceHash",
          content_hash as "contentHash", delivery_status as "deliveryStatus",
          attempt_count as "attemptCount", lease_token as "leaseToken",
          lease_expires_at as "leaseExpiresAt", next_attempt_at as "nextAttemptAt",
          last_attempt_at as "lastAttemptAt", last_error_category as "lastErrorCategory",
          created_at as "createdAt"
        from analytics_digest_deliveries
        where (
            (delivery_status = 'pending' and (next_attempt_at is null or next_attempt_at <= ${now}))
            or
            (delivery_status = 'sending' and lease_expires_at <= ${now})
          )
        order by coalesce(next_attempt_at, lease_expires_at, created_at), logical_id
        limit ${safeLimit}
      `;
      return rows.map(mapDeliveryRow);
    },

    async reject(logicalId, category, now) {
      await sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtextextended(${logicalId}, 0))`;
        await tx`
          update analytics_digest_deliveries
          set delivery_status = 'conflict',
              lease_token = null,
              lease_expires_at = null,
              next_attempt_at = null,
              last_error_category = ${category},
              last_failure_at = ${now},
              updated_at = ${now}
          where logical_id = ${logicalId}
            and delivery_status in ('pending', 'sending')
        `;
      });
    },

    async cleanup(now, limit) {
      const safeLimit = Math.min(Math.max(limit, 0), ANALYTICS_DELIVERY_RETENTION_BATCH_SIZE);
      const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const deleted = await sql<{ id: string }[]>`
        delete from analytics_digest_deliveries
        where id in (
          select id
          from analytics_digest_deliveries
          where delivery_status in ('sent', 'partial_sent', 'failed', 'conflict')
            and created_at <= ${cutoff}
          order by created_at, logical_id
          limit ${safeLimit}
        )
        returning id
      `;
      return deleted.length;
    },
  };
}

export function createResendAnalyticsMailer(config: AnalyticsDeliveryConfig): AnalyticsMailer {
  const resend = new Resend(config.apiKey);
  return {
    async send(envelope) {
      return resend.emails.send(envelope.message as CreateEmailOptions, {
        idempotencyKey: envelope.idempotencyKey,
      });
    },
  };
}

async function sendClaimedDigest(
  claim: AnalyticsDeliveryClaim,
  config: AnalyticsDeliveryConfig,
  repository: AnalyticsDeliveryRepository,
  mailer: AnalyticsMailer,
  now: Date,
) {
  if (
    claim.status !== "claimed" ||
    !claim.digest ||
    !claim.leaseToken ||
    claim.attemptCount == null
  ) {
    return {
      status: claim.status === "claimed" ? "failed" : claim.status,
      logicalId: claim.logicalId,
      category: claim.category,
    } as AnalyticsDeliveryResult;
  }
  const validation = getAnalyticsDigestPrivacyViolations(claim.digest);
  if (validation.length > 0) {
    return repository.finish(
      claim as Required<Pick<AnalyticsDeliveryClaim, "logicalId" | "leaseToken" | "attemptCount">>,
      claim.digest,
      { type: "conflict", category: "stored_digest_invalid" },
      now,
    );
  }
  const envelope = buildAnalyticsDigestEmailEnvelope(claim.digest, config);
  let outcome: AnalyticsProviderOutcome;
  try {
    const response = await mailer.send(envelope);
    outcome = classifyAnalyticsProviderResult({
      messageId: response.data?.id,
      error: response.error,
    });
  } catch {
    outcome = classifyAnalyticsProviderResult({ threw: true });
  }
  return repository.finish(
    claim as Required<Pick<AnalyticsDeliveryClaim, "logicalId" | "leaseToken" | "attemptCount">>,
    claim.digest,
    outcome,
    now,
  );
}

async function attemptFailureNotice(
  kind: AnalyticsDigest["kind"],
  safeId: string,
  category: string,
  config: AnalyticsDeliveryConfig,
  mailer: AnalyticsMailer,
) {
  try {
    await mailer.send(buildAnalyticsFailureEmailEnvelope({ kind, safeId, category }, config));
  } catch {
    // Failure notices are best-effort and never turn a blocked digest into success.
  }
}

async function runGeneratedDelivery(
  kind: AnalyticsDigest["kind"],
  now: Date,
  dependencies: AnalyticsDeliveryDependencies,
): Promise<AnalyticsDeliveryResult> {
  const parsed = parseAnalyticsDeliveryConfig(dependencies.env);
  if (parsed.state === "disabled") return { status: "disabled" };
  if (parsed.state === "invalid") return { status: "failed", category: parsed.category };

  const mailer = dependencies.mailerFactory(parsed.config);
  let digest: AnalyticsDigest;
  try {
    const report = await dependencies.reportLoader({ now });
    digest = kind === "daily" ? buildDailyAnalyticsDigest(report) : buildWeeklyAnalyticsDigest(report);
  } catch {
    await attemptFailureNotice(kind, kind, "report_generation_failed", parsed.config, mailer);
    return { status: "failed", category: "report_generation_failed" };
  }

  if (digest.sourceStatus.firstParty.status !== "ok") {
    await attemptFailureNotice(
      kind,
      digest.logicalId,
      "first_party_unavailable",
      parsed.config,
      mailer,
    );
    return { status: "failed", logicalId: digest.logicalId, category: "first_party_unavailable" };
  }

  try {
    const repository = dependencies.repositoryFactory(parsed.config);
    const claim = await repository.claim(digest, now);
    return await sendClaimedDigest(claim, parsed.config, repository, mailer, now);
  } catch {
    await attemptFailureNotice(kind, digest.logicalId, "delivery_storage_unavailable", parsed.config, mailer);
    return { status: "failed", logicalId: digest.logicalId, category: "delivery_storage_unavailable" };
  }
}

export function runDailyAnalyticsDelivery({
  now = new Date(),
  dependencies = defaultDependencies,
}: {
  now?: Date;
  dependencies?: AnalyticsDeliveryDependencies;
} = {}) {
  return runGeneratedDelivery("daily", now, dependencies);
}

export function runWeeklyAnalyticsDelivery({
  now = new Date(),
  dependencies = defaultDependencies,
}: {
  now?: Date;
  dependencies?: AnalyticsDeliveryDependencies;
} = {}) {
  return runGeneratedDelivery("weekly", now, dependencies);
}

export async function runAnalyticsDeliveryRetrySweep({
  now = new Date(),
  dependencies = defaultDependencies,
}: {
  now?: Date;
  dependencies?: AnalyticsDeliveryDependencies;
} = {}): Promise<AnalyticsDeliveryResult> {
  const parsed = parseAnalyticsDeliveryConfig(dependencies.env);
  if (parsed.state === "disabled") return { status: "disabled" };
  if (parsed.state === "invalid") return { status: "failed", category: parsed.category };
  try {
    const repository = dependencies.repositoryFactory(parsed.config);
    const mailer = dependencies.mailerFactory(parsed.config);
    const due = await repository.listDue(now, ANALYTICS_DELIVERY_RETRY_BATCH_SIZE);
    let aggregate: AnalyticsDeliveryResult = { status: "noop" };
    const priority: Record<AnalyticsDeliveryResult["status"], number> = {
      disabled: 0,
      noop: 0,
      sent: 1,
      partial_sent: 1,
      busy: 2,
      pending: 3,
      conflict: 4,
      failed: 5,
    };
    const merge = (result: AnalyticsDeliveryResult) => {
      if (priority[result.status] > priority[aggregate.status]) aggregate = result;
    };
    let processed = 0;
    for (const row of due) {
      const stored = validateStoredAnalyticsDigest(row);
      if (!stored.ok) {
        await repository.reject(row.logicalId, stored.category, now);
        merge({
          status: "conflict",
          logicalId: row.logicalId,
          category: stored.category,
        });
        processed += 1;
        continue;
      }
      const claim = await repository.claim(stored.digest, now);
      merge(await sendClaimedDigest(claim, parsed.config, repository, mailer, now));
      processed += 1;
    }
    const deleted = await repository.cleanup(now, ANALYTICS_DELIVERY_RETENTION_BATCH_SIZE);
    return { ...aggregate, processed, deleted };
  } catch {
    return { status: "failed", category: "delivery_storage_unavailable" };
  }
}

export async function handleAnalyticsCronRequest(
  kind: "daily" | "weekly" | "retry",
  request: Request,
  dependencies: AnalyticsDeliveryDependencies = defaultDependencies,
) {
  const auth = authorizeAnalyticsCron(
    request.headers.get("authorization"),
    dependencies.env.CRON_SECRET,
  );
  if (!auth.ok) {
    return { httpStatus: auth.status, result: { status: "failed", category: auth.category } as AnalyticsDeliveryResult };
  }
  const parsed = parseAnalyticsDeliveryConfig(dependencies.env);
  if (parsed.state === "disabled") {
    return { httpStatus: 200, result: { status: "disabled" } as AnalyticsDeliveryResult };
  }
  const result =
    kind === "daily"
      ? await runDailyAnalyticsDelivery({ dependencies })
      : kind === "weekly"
        ? await runWeeklyAnalyticsDelivery({ dependencies })
        : await runAnalyticsDeliveryRetrySweep({ dependencies });
  safeLog(dependencies.logger, result.status === "failed" ? "error" : "info", result);
  const httpStatus = result.status === "conflict" ? 409 : result.status === "failed" ? 500 : 200;
  return { httpStatus, result };
}

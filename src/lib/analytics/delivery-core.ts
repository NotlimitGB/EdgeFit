import type { ErrorResponse } from "resend";
import {
  ANALYTICS_DIGEST_VERSION,
  canonicalizeAnalyticsDigest,
  getAnalyticsDigestPrivacyViolations,
  type AnalyticsDigest,
} from "@/lib/analytics/digest";

export const ANALYTICS_DELIVERY_LEASE_MS = 10 * 60 * 1000;
export const ANALYTICS_DELIVERY_MAX_ATTEMPTS = 5;
export const ANALYTICS_DELIVERY_RETRY_BATCH_SIZE = 10;
export const ANALYTICS_DELIVERY_RETENTION_DAYS = 90;
export const ANALYTICS_DELIVERY_RETENTION_BATCH_SIZE = 100;
export const ANALYTICS_DELIVERY_UNKNOWN_OUTCOME_GUARD_MS = 23 * 60 * 60 * 1000;

export type AnalyticsDeliveryStatus =
  | "pending"
  | "sending"
  | "sent"
  | "partial_sent"
  | "failed"
  | "conflict";

export type AnalyticsDeliveryRunStatus =
  | "disabled"
  | "sent"
  | "partial_sent"
  | "noop"
  | "pending"
  | "busy"
  | "failed"
  | "conflict";

export interface AnalyticsDeliveryConfig {
  apiKey: string;
  sender: string;
  recipient: string;
}

export type AnalyticsDeliveryConfigResult =
  | { state: "disabled" }
  | { state: "invalid"; category: "delivery_config_missing" }
  | { state: "enabled"; config: AnalyticsDeliveryConfig };

export interface AnalyticsDeliveryResult {
  status: AnalyticsDeliveryRunStatus;
  logicalId?: string;
  category?: string;
  processed?: number;
  deleted?: number;
}

export interface AnalyticsDeliveryLedgerRow {
  logicalId: string;
  kind: AnalyticsDigest["kind"];
  digest: unknown;
  digestStatus: AnalyticsDigest["status"];
  evidenceHash: string;
  contentHash: string;
  deliveryStatus: AnalyticsDeliveryStatus;
  attemptCount: number;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  nextAttemptAt: Date | null;
  lastAttemptAt: Date | null;
  lastErrorCategory: string | null;
  createdAt: Date;
}

export type AnalyticsDeliveryClaimDecision =
  | { action: "create_and_claim" }
  | { action: "claim_stored" }
  | { action: "noop" }
  | { action: "busy" }
  | { action: "conflict"; category: string }
  | { action: "fail"; category: string };

export interface AnalyticsEmailEnvelope {
  message: {
    from: string;
    to: string[];
    subject: string;
    text: string;
    html: string;
    attachments?: Array<{ filename: string; content: string }>;
  };
  idempotencyKey: string;
}

export type AnalyticsProviderOutcome =
  | { type: "success"; messageId: string }
  | { type: "retry"; category: string; unknownOutcome: boolean }
  | { type: "failed"; category: string }
  | { type: "conflict"; category: string };

export function parseAnalyticsDeliveryConfig(
  env: Record<string, string | undefined>,
): AnalyticsDeliveryConfigResult {
  if (env.ANALYTICS_DELIVERY_ENABLED?.trim().toLowerCase() !== "true") {
    return { state: "disabled" };
  }

  const apiKey = env.RESEND_API_KEY?.trim();
  const sender = env.ANALYTICS_DELIVERY_SENDER?.trim();
  const recipient = env.ANALYTICS_DELIVERY_RECIPIENT?.trim();
  if (!apiKey || !sender || !recipient) {
    return { state: "invalid", category: "delivery_config_missing" };
  }

  return { state: "enabled", config: { apiKey, sender, recipient } };
}

export function authorizeAnalyticsCron(
  authorization: string | null,
  cronSecret: string | undefined,
) {
  const secret = cronSecret?.trim();
  if (!secret) {
    return { ok: false as const, status: 500, category: "cron_secret_missing" };
  }
  if (authorization !== `Bearer ${secret}`) {
    return { ok: false as const, status: 401, category: "unauthorized" };
  }
  return { ok: true as const };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character];
  });
}

function formatMetric(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : String(value);
}

export function getAnalyticsDeliveryIdempotencyKey(digest: AnalyticsDigest) {
  const key = `edgefit/${digest.logicalId}/${digest.delivery.contentHash}`;
  if (key.length > 256) {
    throw new Error("delivery_idempotency_key_invalid");
  }
  return key;
}

export function buildAnalyticsDigestEmailEnvelope(
  digest: AnalyticsDigest,
  config: Pick<AnalyticsDeliveryConfig, "sender" | "recipient">,
): AnalyticsEmailEnvelope {
  const violations = getAnalyticsDigestPrivacyViolations(digest);
  if (violations.length > 0) {
    throw new Error("delivery_digest_invalid");
  }

  const canonical = canonicalizeAnalyticsDigest(digest);
  const last30Traffic = digest.traffic.last30Days;
  const last30Acquisition = digest.acquisition.last30Days?.goals;
  const funnel = digest.funnel.last30Days;
  const commerce = digest.commerce.windows.last30Days;
  const readiness = digest.partnerReadiness;
  const status = digest.status.toUpperCase();
  const subject =
    digest.kind === "daily"
      ? `EdgeFit Daily Analytics — ${digest.asOfDate} [${digest.logicalId}]`
      : `EdgeFit Weekly Analytics — ${digest.logicalId.slice("weekly:".length)} [${digest.logicalId}]`;
  const filename =
    digest.kind === "daily"
      ? `edgefit-daily-${digest.asOfDate}.json`
      : `edgefit-weekly-${digest.logicalId.slice("weekly:".length)}.json`;
  const warningCodes = digest.dataQuality.map((warning) => warning.code).join(", ") || "none";
  const lines = [
    "PRIVATE — EDGEFIT ANALYTICS",
    `Status: ${status}`,
    `Logical ID: ${digest.logicalId}`,
    `As of: ${digest.asOfDate}`,
    `Traffic 30d: ${formatMetric(last30Traffic?.users)} users / ${formatMetric(last30Traffic?.visits)} visits`,
    `Acquisition 30d: quiz ${formatMetric(last30Acquisition?.quizStarted.visits)}, result ${formatMetric(last30Acquisition?.resultViewed.visits)}, store ${formatMetric(last30Acquisition?.productClicked.visits)}`,
    `First-party 30d: ${funnel.quizCompletedSessions} quiz completions / ${funnel.resultViewedSessions} results / ${funnel.resultToStoreSessions} result-to-store`,
    `Store clicks 30d: ${commerce.uniqueClickSessions} sessions / ${commerce.clickEvents} events`,
    `Partner readiness: ${formatMetric(readiness.score)} / ${readiness.status}`,
    `Data quality: ${warningCodes}`,
    `Content hash: ${digest.delivery.contentHash}`,
    `Attachment: ${filename}`,
  ];
  const html = `<p><strong>PRIVATE — EDGEFIT ANALYTICS</strong></p><p><strong>Status: ${escapeHtml(status)}</strong></p><ul>${lines
    .slice(2)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("")}</ul>`;

  return {
    message: {
      from: config.sender,
      to: [config.recipient],
      subject,
      text: lines.join("\n"),
      html,
      attachments: [
        {
          filename,
          content: Buffer.from(canonical, "utf8").toString("base64"),
        },
      ],
    },
    idempotencyKey: getAnalyticsDeliveryIdempotencyKey(digest),
  };
}

export function buildAnalyticsFailureEmailEnvelope(
  input: {
    kind: AnalyticsDigest["kind"];
    safeId: string;
    category: string;
  },
  config: Pick<AnalyticsDeliveryConfig, "sender" | "recipient">,
): AnalyticsEmailEnvelope {
  const safeId = input.safeId.replace(/[^a-zA-Z0-9:_-]/g, "-").slice(0, 80) || input.kind;
  const category = input.category.replace(/[^a-z0-9_-]/gi, "_").slice(0, 80);
  const subject = `EdgeFit Analytics Delivery Failure — ${safeId}`;
  const lines = [
    "PRIVATE — EDGEFIT ANALYTICS",
    `Delivery kind: ${input.kind}`,
    `Safe ID: ${safeId}`,
    `Category: ${category}`,
  ];
  const key = `edgefit/failure/${input.kind}/${safeId}/${category}`;
  if (key.length > 256) {
    throw new Error("delivery_idempotency_key_invalid");
  }
  return {
    message: {
      from: config.sender,
      to: [config.recipient],
      subject,
      text: lines.join("\n"),
      html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join(""),
    },
    idempotencyKey: key,
  };
}

export function getAnalyticsDeliveryClaimDecision(
  existing: AnalyticsDeliveryLedgerRow | null,
  digest: AnalyticsDigest,
  now: Date,
): AnalyticsDeliveryClaimDecision {
  if (!existing) {
    return { action: "create_and_claim" };
  }
  if (existing.contentHash !== digest.delivery.contentHash) {
    return { action: "conflict", category: "logical_id_content_conflict" };
  }
  if (existing.deliveryStatus === "sent" || existing.deliveryStatus === "partial_sent") {
    return { action: "noop" };
  }
  if (existing.deliveryStatus === "conflict") {
    return { action: "conflict", category: existing.lastErrorCategory ?? "delivery_conflict" };
  }
  if (existing.deliveryStatus === "failed") {
    return { action: "fail", category: existing.lastErrorCategory ?? "delivery_failed" };
  }
  if (
    existing.deliveryStatus === "sending" &&
    existing.leaseExpiresAt &&
    existing.leaseExpiresAt.getTime() > now.getTime()
  ) {
    return { action: "busy" };
  }
  if (existing.attemptCount >= ANALYTICS_DELIVERY_MAX_ATTEMPTS) {
    return { action: "fail", category: "delivery_attempts_exhausted" };
  }
  if (existing.nextAttemptAt && existing.nextAttemptAt.getTime() > now.getTime()) {
    return { action: "busy" };
  }
  if (
    existing.lastErrorCategory === "provider_outcome_unknown" &&
    existing.lastAttemptAt &&
    now.getTime() - existing.lastAttemptAt.getTime() >=
      ANALYTICS_DELIVERY_UNKNOWN_OUTCOME_GUARD_MS
  ) {
    return { action: "fail", category: "provider_outcome_unknown_expired" };
  }
  return { action: "claim_stored" };
}

export function getAnalyticsDeliveryBackoffMs(attemptCount: number) {
  const values = [15 * 60_000, 60 * 60_000, 6 * 60 * 60_000, 12 * 60 * 60_000];
  return values[Math.min(Math.max(attemptCount - 1, 0), values.length - 1)];
}

export function classifyAnalyticsProviderResult(input: {
  messageId?: string | null;
  error?: Pick<ErrorResponse, "name" | "statusCode"> | null;
  threw?: boolean;
}): AnalyticsProviderOutcome {
  if (input.messageId) {
    return { type: "success", messageId: input.messageId };
  }
  if (input.threw || !input.error) {
    return { type: "retry", category: "provider_outcome_unknown", unknownOutcome: true };
  }
  if (input.error.name === "invalid_idempotent_request") {
    return { type: "conflict", category: "provider_idempotency_conflict" };
  }
  if (input.error.name === "concurrent_idempotent_requests") {
    return { type: "retry", category: "provider_concurrent_request", unknownOutcome: false };
  }
  if (input.error.statusCode === 429 || input.error.name === "rate_limit_exceeded") {
    return { type: "retry", category: "provider_rate_limited", unknownOutcome: false };
  }
  if (input.error.statusCode == null) {
    return { type: "retry", category: "provider_outcome_unknown", unknownOutcome: true };
  }
  if ((input.error.statusCode ?? 0) >= 500) {
    return { type: "retry", category: "provider_unavailable", unknownOutcome: false };
  }
  return { type: "failed", category: "provider_request_rejected" };
}

export function validateStoredAnalyticsDigest(row: AnalyticsDeliveryLedgerRow) {
  const violations = getAnalyticsDigestPrivacyViolations(row.digest);
  if (violations.length > 0 || !row.digest || typeof row.digest !== "object") {
    return { ok: false as const, category: "stored_digest_invalid" };
  }
  const digest = row.digest as AnalyticsDigest;
  if (
    digest.version !== ANALYTICS_DIGEST_VERSION ||
    digest.logicalId !== row.logicalId ||
    digest.kind !== row.kind ||
    digest.status !== row.digestStatus ||
    digest.delivery.contentHash !== row.contentHash ||
    digest.sourceReport.evidenceHash !== row.evidenceHash
  ) {
    return { ok: false as const, category: "stored_digest_hash_mismatch" };
  }
  return { ok: true as const, digest };
}

export function isAnalyticsDeliveryRetentionEligible(
  row: Pick<AnalyticsDeliveryLedgerRow, "deliveryStatus" | "createdAt">,
  now: Date,
) {
  const terminal = ["sent", "partial_sent", "failed", "conflict"].includes(
    row.deliveryStatus,
  );
  return (
    terminal &&
    row.createdAt.getTime() <=
      now.getTime() - ANALYTICS_DELIVERY_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
}

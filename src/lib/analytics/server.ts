import "server-only";
import { базаНастроена } from "@/lib/database/config";
import { получитьКлиентБазы } from "@/lib/database/client";

export interface AnalyticsEventPayload {
  sessionId: string;
  eventName: string;
  requestUrl: string;
  pagePath?: string;
  payload?: Record<string, unknown>;
}

interface AnalyticsPersistencePolicyInput {
  nodeEnv: string | undefined;
  requestUrl: string;
}

function normalizeRequestHostname(requestUrl: string) {
  try {
    return new URL(requestUrl).hostname
      .toLowerCase()
      .replace(/^\[|\]$/gu, "")
      .replace(/\.+$/gu, "");
  } catch {
    return null;
  }
}

export function shouldPersistAnalyticsEvent({
  nodeEnv,
  requestUrl,
}: AnalyticsPersistencePolicyInput) {
  if (nodeEnv !== "production") {
    return false;
  }

  const hostname = normalizeRequestHostname(requestUrl);

  if (!hostname) {
    return false;
  }

  return !(
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1"
  );
}

export async function saveAnalyticsEvent({
  sessionId,
  eventName,
  requestUrl,
  pagePath,
  payload = {},
}: AnalyticsEventPayload) {
  if (
    !shouldPersistAnalyticsEvent({
      nodeEnv: process.env.NODE_ENV,
      requestUrl,
    })
  ) {
    return;
  }

  if (!базаНастроена()) {
    return;
  }

  const sql = получитьКлиентБазы();

  await sql`
    insert into analytics_events (
      session_id,
      event_name,
      page_path,
      payload
    ) values (
      ${sessionId},
      ${eventName},
      ${pagePath ?? null},
      ${sql.json(payload as Parameters<typeof sql.json>[0])}
    )
  `;
}

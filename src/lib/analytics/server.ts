import "server-only";
import { headers } from "next/headers";
import { getHostingProvider, isCanonicalProductionHost } from "@/lib/deployment-policy";
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
  requestHost?: string | null;
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
  requestHost,
}: AnalyticsPersistencePolicyInput) {
  if (nodeEnv !== "production") {
    return false;
  }

  if (getHostingProvider() === "timeweb") return isCanonicalProductionHost(requestHost);

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
  let requestHost: string | null = null;
  if (getHostingProvider() === "timeweb") {
    // Standalone request.url can contain the internal bind address. Use only Host,
    // not caller payload or untrusted forwarded headers. No request context fails closed.
    try { requestHost = (await headers()).get("host"); } catch { return; }
  }
  if (
    !shouldPersistAnalyticsEvent({
      nodeEnv: process.env.NODE_ENV,
      requestUrl,
      requestHost,
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

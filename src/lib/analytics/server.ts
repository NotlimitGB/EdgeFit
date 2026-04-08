import "server-only";
import { базаНастроена } from "@/lib/database/config";
import { получитьКлиентБазы } from "@/lib/database/client";

export interface AnalyticsEventPayload {
  sessionId: string;
  eventName: string;
  pagePath?: string;
  payload?: Record<string, unknown>;
}

export async function saveAnalyticsEvent({
  sessionId,
  eventName,
  pagePath,
  payload = {},
}: AnalyticsEventPayload) {
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
      ${JSON.stringify(payload)}::jsonb
    )
  `;
}

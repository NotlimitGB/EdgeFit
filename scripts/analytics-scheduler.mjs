import { pathToFileURL } from "node:url";

const paths = {
  weekly: "/api/cron/analytics-weekly",
  retry: "/api/cron/analytics-retry",
};

export const HTTP_TIMEOUT_MS = 420_000;

export function expectedWeeklyId(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const monday = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  const minute = Number(values.hour) * 60 + Number(values.minute);
  if (monday.getUTCDay() !== 1 || minute < 15 || minute >= 23 * 60 + 45) {
    throw new Error("weekly_outside_moscow_monday");
  }
  // The preceding Sunday identifies the completed ISO week.
  const thursday = new Date(monday.getTime() - 4 * 86_400_000);
  const isoYear = thursday.getUTCFullYear();
  const firstDay = Date.UTC(isoYear, 0, 1);
  const isoWeek = Math.ceil(((thursday.getTime() - firstDay) / 86_400_000 + 1) / 7);
  return `weekly:${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
}

export async function invokeAnalyticsScheduler(kind, secret, fetcher = fetch, now = new Date()) {
  if (!Object.hasOwn(paths, kind) || !secret?.trim()) throw new Error("scheduler_configuration_invalid");
  const expectedId = kind === "weekly" ? expectedWeeklyId(now) : null;
  const response = await fetcher(`https://snowdex.ru${paths[kind]}`, {
    headers: { Authorization: `Bearer ${secret.trim()}` },
    redirect: "error",
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  let body;
  try { body = await response.json(); } catch { throw new Error("scheduler_response_invalid"); }
  if (!response.ok || !["sent", "partial_sent", "noop"].includes(body?.status)) {
    throw new Error("scheduler_delivery_not_complete");
  }
  if (expectedId && body.logicalId !== expectedId) throw new Error("scheduler_period_mismatch");
  return body.status;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  invokeAnalyticsScheduler(process.argv[2], process.env.CRON_SECRET)
    .then((status) => console.log(`analytics scheduler: ${status}`))
    .catch(() => { console.error("analytics scheduler failed; inspect sanitized server logs"); process.exitCode = 1; });
}

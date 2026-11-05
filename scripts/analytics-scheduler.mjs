import { pathToFileURL } from "node:url";

const paths = {
  weekly: "/api/cron/analytics-weekly",
  retry: "/api/cron/analytics-retry",
};

export async function invokeAnalyticsScheduler(kind, secret, fetcher = fetch) {
  if (!Object.hasOwn(paths, kind) || !secret?.trim()) throw new Error("scheduler_configuration_invalid");
  const response = await fetcher(`https://snowdex.ru${paths[kind]}`, {
    headers: { Authorization: `Bearer ${secret.trim()}` },
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
  });
  let body;
  try { body = await response.json(); } catch { throw new Error("scheduler_response_invalid"); }
  if (!response.ok || !["sent", "partial_sent", "noop"].includes(body?.status)) {
    throw new Error("scheduler_delivery_not_complete");
  }
  return body.status;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  invokeAnalyticsScheduler(process.argv[2], process.env.CRON_SECRET)
    .then((status) => console.log(`analytics scheduler: ${status}`))
    .catch(() => { console.error("analytics scheduler failed; inspect sanitized server logs"); process.exitCode = 1; });
}

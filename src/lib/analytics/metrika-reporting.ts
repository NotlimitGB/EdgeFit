import "server-only";
import {
  reportWindowKeys,
  type AnalyticsSourceStatus,
  type ReportWindows,
  type ReportWindowKey,
  type SamplingMetadata,
  type TrafficMetrics,
  type TrafficSourceMetric,
} from "@/lib/analytics/reporting-core";

const METRIKA_ENDPOINT = "https://api-metrika.yandex.net/stat/v1/data";
const TRAFFIC_METRICS = [
  "ym:s:users",
  "ym:s:visits",
  "ym:s:bounceRate",
  "ym:s:pageDepth",
  "ym:s:avgVisitDurationSeconds",
] as const;
const SOURCE_DIMENSION = "ym:s:lastsignTrafficSource";

interface MetrikaResponse {
  totals?: unknown;
  data?: unknown;
  sampled?: unknown;
  sample_share?: unknown;
  sample_size?: unknown;
  sample_space?: unknown;
  data_lag?: unknown;
}

export interface MetrikaReportingResult {
  sourceStatus: AnalyticsSourceStatus;
  traffic: Partial<Record<ReportWindowKey, TrafficMetrics>> & {
    sources30Days: TrafficSourceMetric[];
    sourcesSampling: SamplingMetadata;
  };
}

type FetchImplementation = typeof fetch;

function nullableFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getSamplingMetadata(payload: MetrikaResponse): SamplingMetadata {
  return {
    status:
      payload.sampled === true
        ? "sampled"
        : payload.sampled === false
          ? "unsampled"
          : "unknown",
    sampleShare: nullableFiniteNumber(payload.sample_share),
    sampleSize: nullableFiniteNumber(payload.sample_size),
    sampleSpace: nullableFiniteNumber(payload.sample_space),
    dataLag: nullableFiniteNumber(payload.data_lag),
  };
}

function emptySampling(): SamplingMetadata {
  return {
    status: "unknown",
    sampleShare: null,
    sampleSize: null,
    sampleSpace: null,
    dataLag: null,
  };
}

function buildBaseUrl(counterId: number, date1: string, date2: string) {
  const url = new URL(METRIKA_ENDPOINT);
  url.searchParams.set("ids", String(counterId));
  url.searchParams.set("date1", date1);
  url.searchParams.set("date2", date2);
  url.searchParams.set("timezone", "+03:00");
  url.searchParams.set("accuracy", "full");
  url.searchParams.set("lang", "ru");
  return url;
}

function classifyStatus(status: number) {
  if (status === 401 || status === 403) {
    return "authentication";
  }
  if (status === 429) {
    return "rate_limited";
  }
  return "upstream";
}

function isRetryableStatus(status: number) {
  return status === 429 || status >= 500;
}

async function waitForRetry() {
  await new Promise((resolve) => setTimeout(resolve, 250));
}

export async function requestMetrikaData({
  url,
  token,
  fetchImpl = fetch,
  timeoutMs = 5_000,
}: {
  url: URL;
  token: string;
  fetchImpl?: FetchImplementation;
  timeoutMs?: number;
}): Promise<
  | { ok: true; payload: MetrikaResponse }
  | {
      ok: false;
      diagnostic: { category: string; httpStatus?: number };
    }
> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method: "GET",
        headers: { Authorization: `OAuth ${token}` },
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        if (attempt === 1 && isRetryableStatus(response.status)) {
          await waitForRetry();
          continue;
        }

        return {
          ok: false,
          diagnostic: {
            category: classifyStatus(response.status),
            httpStatus: response.status,
          },
        };
      }

      try {
        return {
          ok: true,
          payload: (await response.json()) as MetrikaResponse,
        };
      } catch {
        return { ok: false, diagnostic: { category: "invalid_response" } };
      }
    } catch (error) {
      if (attempt === 1) {
        await waitForRetry();
        continue;
      }

      return {
        ok: false,
        diagnostic: {
          category:
            error instanceof Error && error.name === "AbortError"
              ? "timeout"
              : "network",
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  return { ok: false, diagnostic: { category: "network" } };
}

function parseTrafficMetrics(payload: MetrikaResponse): TrafficMetrics | null {
  if (!Array.isArray(payload.totals) || payload.totals.length < TRAFFIC_METRICS.length) {
    return null;
  }

  const values = payload.totals.map(nullableFiniteNumber);
  if (values.some((value) => value === null)) {
    return null;
  }

  return {
    users: values[0] ?? 0,
    visits: values[1] ?? 0,
    bounceRate: Math.max(0, Math.min((values[2] ?? 0) / 100, 1)),
    pageDepth: values[3] ?? 0,
    avgVisitDurationSeconds: values[4] ?? 0,
    sampling: getSamplingMetadata(payload),
  };
}

function parseTrafficSources(payload: MetrikaResponse): TrafficSourceMetric[] | null {
  if (!Array.isArray(payload.data)) {
    return null;
  }

  const rows = payload.data.flatMap((row) => {
    if (!row || typeof row !== "object") {
      return [];
    }

    const dimensions = (row as { dimensions?: unknown }).dimensions;
    const metrics = (row as { metrics?: unknown }).metrics;
    if (!Array.isArray(dimensions) || !Array.isArray(metrics)) {
      return [];
    }

    const dimension = dimensions[0];
    const visits = nullableFiniteNumber(metrics[0]);
    const users = nullableFiniteNumber(metrics[1]);
    if (!dimension || typeof dimension !== "object" || visits === null || users === null) {
      return [];
    }

    const id = (dimension as { id?: unknown }).id;
    const name = (dimension as { name?: unknown }).name;
    const source = typeof id === "string" && id.trim() ? id.trim() : null;
    const label = typeof name === "string" && name.trim() ? name.trim() : source;
    if (!source || !label) {
      return [];
    }

    return [{ source, label, visits, users }];
  });
  const totalVisits = rows.reduce((sum, row) => sum + row.visits, 0);

  return rows.map((row) => ({
    ...row,
    share:
      totalVisits === 0
        ? null
        : Math.round((row.visits / totalVisits + Number.EPSILON) * 10_000) / 10_000,
  }));
}

export async function getMetrikaReporting({
  counterIdValue = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID,
  tokenValue = process.env.YANDEX_METRIKA_OAUTH_TOKEN,
  windows,
  fetchImpl = fetch,
  timeoutMs = 5_000,
}: {
  counterIdValue?: string;
  tokenValue?: string;
  windows: ReportWindows;
  fetchImpl?: FetchImplementation;
  timeoutMs?: number;
}): Promise<MetrikaReportingResult> {
  const counterId = Number(counterIdValue?.trim());
  const token = tokenValue?.trim();
  const emptyTraffic = {
    sources30Days: [],
    sourcesSampling: emptySampling(),
  };

  if (!Number.isInteger(counterId) || counterId <= 0 || !token) {
    return {
      sourceStatus: { status: "not_configured" },
      traffic: emptyTraffic,
    };
  }

  const trafficRequests = reportWindowKeys.map(async (key) => {
    const window = windows[key];
    const url = buildBaseUrl(counterId, window.startDate, window.endDate);
    url.searchParams.set("metrics", TRAFFIC_METRICS.join(","));
    const result = await requestMetrikaData({ url, token, fetchImpl, timeoutMs });
    return { key, result };
  });
  const sourceUrl = buildBaseUrl(
    counterId,
    windows.last30Days.startDate,
    windows.last30Days.endDate,
  );
  sourceUrl.searchParams.set("metrics", "ym:s:visits,ym:s:users");
  sourceUrl.searchParams.set("dimensions", SOURCE_DIMENSION);
  sourceUrl.searchParams.set("sort", "-ym:s:visits");
  sourceUrl.searchParams.set("limit", "10");

  const [trafficResults, sourceResult] = await Promise.all([
    Promise.all(trafficRequests),
    requestMetrikaData({ url: sourceUrl, token, fetchImpl, timeoutMs }),
  ]);
  const failedResult = trafficResults.find(({ result }) => !result.ok)?.result;

  if (failedResult && !failedResult.ok) {
    return {
      sourceStatus: { status: "unavailable", diagnostic: failedResult.diagnostic },
      traffic: emptyTraffic,
    };
  }
  if (!sourceResult.ok) {
    return {
      sourceStatus: { status: "unavailable", diagnostic: sourceResult.diagnostic },
      traffic: emptyTraffic,
    };
  }

  const traffic: MetrikaReportingResult["traffic"] = { ...emptyTraffic };
  for (const { key, result } of trafficResults) {
    if (!result.ok) {
      continue;
    }
    const metrics = parseTrafficMetrics(result.payload);
    if (!metrics) {
      return {
        sourceStatus: {
          status: "unavailable",
          diagnostic: { category: "invalid_response" },
        },
        traffic: emptyTraffic,
      };
    }
    traffic[key] = metrics;
  }
  const sources = parseTrafficSources(sourceResult.payload);
  if (!sources) {
    return {
      sourceStatus: {
        status: "unavailable",
        diagnostic: { category: "invalid_response" },
      },
      traffic: emptyTraffic,
    };
  }
  traffic.sources30Days = sources;
  traffic.sourcesSampling = getSamplingMetadata(sourceResult.payload);

  return { sourceStatus: { status: "ok" }, traffic };
}

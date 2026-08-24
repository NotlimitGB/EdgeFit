import "server-only";
import { базаНастроена } from "@/lib/database/config";
import { получитьКлиентБазы } from "@/lib/database/client";
import { getMetrikaReporting } from "@/lib/analytics/metrika-reporting";
import {
  ANALYTICS_REPORT_TIMEZONE,
  ANALYTICS_REPORT_VERSION,
  buildQuizAbandonmentReport,
  buildFunnelMetrics,
  buildPartnerReadiness,
  buildReportWindows,
  calculateTrend,
  getHistoryDays,
  getAnalyticsReportPrivacyViolations,
  quizCompletionAcquisitionPolicy,
  reportWindowKeys,
  reportedEventNames,
  type AnalyticsSourceStatus,
  type CommerceBreakdownItem,
  type CommerceMetrics,
  type DataQualityWarning,
  type EventMetrics,
  type FunnelMetrics,
  type MerchantEvidence,
  type QuizAbandonmentReport,
  type QuizProgressionEvent,
  type ReportWindowKey,
  type TopBoardMetric,
  type TopOfferMetric,
  type TrafficMetrics,
} from "@/lib/analytics/reporting-core";

interface HistoryRow {
  firstEventAt: string | null;
  legacyPayloadRows: number;
  invalidPayloadRows: number;
}

interface EventAggregateRow {
  windowKey: ReportWindowKey;
  eventName: (typeof reportedEventNames)[number];
  eventCount: number;
  uniqueSessions: number;
}

interface FunnelRow {
  windowKey: ReportWindowKey;
  quizStartSessions: number;
  quizCompletedSessions: number;
  resultViewedSessions: number;
  resultToStoreSessions: number;
  storeClickSessions: number;
}

interface CommerceRow {
  kind: "total" | "source" | "placement" | "size" | "merchant" | "merchant_board" | "merchant_offer" | "merchant_size";
  windowKey: ReportWindowKey | null;
  groupValue: string | null;
  itemValue: string | null;
  eventCount: number;
  uniqueSessions: number;
}

interface TopCommerceRow {
  kind: "board" | "offer";
  identity: string;
  eventCount: number;
  uniqueSessions: number;
  source: string | null;
  merchant: string | null;
}

type QuizProgressionRow = QuizProgressionEvent;

interface QuizStepAvailabilityRow {
  availableFrom: string | null;
}

interface FirstPartyResult {
  sourceStatus: AnalyticsSourceStatus;
  historyDays: number | null;
  legacyPayloadRows: number;
  invalidPayloadRows: number;
  events: Record<ReportWindowKey, EventMetrics>;
  funnel: Record<ReportWindowKey, FunnelMetrics>;
  commerce: Record<ReportWindowKey, CommerceMetrics>;
  clickSources30Days: CommerceBreakdownItem[];
  placements30Days: CommerceBreakdownItem[];
  sizes30Days: CommerceBreakdownItem[];
  merchants30Days: MerchantEvidence[];
  topBoards30Days: TopBoardMetric[];
  topOffers30Days: TopOfferMetric[];
  quizAbandonment: QuizAbandonmentReport;
}

function emptyEventMetrics(): EventMetrics {
  return Object.fromEntries(
    reportedEventNames.map((eventName) => [
      eventName,
      { eventCount: 0, uniqueSessions: 0 },
    ]),
  ) as EventMetrics;
}

function emptyFunnel() {
  return buildFunnelMetrics({
    quizStartSessions: 0,
    quizCompletedSessions: 0,
    resultViewedSessions: 0,
    resultToStoreSessions: 0,
    storeClickSessions: 0,
  });
}

function emptyFirstParty(status: AnalyticsSourceStatus): FirstPartyResult {
  return {
    sourceStatus: status,
    historyDays: null,
    legacyPayloadRows: 0,
    invalidPayloadRows: 0,
    events: Object.fromEntries(
      reportWindowKeys.map((key) => [key, emptyEventMetrics()]),
    ) as Record<ReportWindowKey, EventMetrics>,
    funnel: Object.fromEntries(
      reportWindowKeys.map((key) => [key, emptyFunnel()]),
    ) as Record<ReportWindowKey, FunnelMetrics>,
    commerce: Object.fromEntries(
      reportWindowKeys.map((key) => [
        key,
        { clickEvents: 0, uniqueClickSessions: 0 },
      ]),
    ) as Record<ReportWindowKey, CommerceMetrics>,
    clickSources30Days: [],
    placements30Days: [],
    sizes30Days: [],
    merchants30Days: [],
    topBoards30Days: [],
    topOffers30Days: [],
    quizAbandonment: buildQuizAbandonmentReport([]),
  };
}

function addShares<T extends { eventCount: number; uniqueSessions: number }>(
  rows: T[],
  total: number,
) {
  return rows.map((row) => ({
    value: "groupValue" in row ? (row as T & { groupValue: string | null }).groupValue : null,
    clickEvents: row.eventCount,
    uniqueClickSessions: row.uniqueSessions,
    shareOfClicks:
      total === 0
        ? null
        : Math.round((row.eventCount / total + Number.EPSILON) * 10_000) / 10_000,
  }));
}

async function loadFirstPartyReport(
  windows: ReturnType<typeof buildReportWindows>["windows"],
  asOfDate: string,
): Promise<FirstPartyResult> {
  if (!базаНастроена()) {
    return emptyFirstParty({ status: "not_configured" });
  }

  const sql = получитьКлиентБазы();

  try {
    return await sql.begin("isolation level repeatable read read only", async (tx) => {
      const historyRows = await tx<HistoryRow[]>`
        select
          min(created_at)::text as "firstEventAt",
          count(*) filter (where jsonb_typeof(payload) = 'string')::int as "legacyPayloadRows",
          count(*) filter (
            where jsonb_typeof(payload) not in ('object', 'string')
               or (
                 jsonb_typeof(payload) = 'string'
                 and not pg_input_is_valid(payload #>> '{}', 'jsonb')
               )
          )::int as "invalidPayloadRows"
        from analytics_events
      `;

      const eventRows = await tx<EventAggregateRow[]>`
        with windows("windowKey", start_date, end_date) as (
          values
            ('yesterday', ${windows.yesterday.startDate}::date, ${windows.yesterday.endDate}::date),
            ('last7Days', ${windows.last7Days.startDate}::date, ${windows.last7Days.endDate}::date),
            ('previous7Days', ${windows.previous7Days.startDate}::date, ${windows.previous7Days.endDate}::date),
            ('last30Days', ${windows.last30Days.startDate}::date, ${windows.last30Days.endDate}::date),
            ('previous30Days', ${windows.previous30Days.startDate}::date, ${windows.previous30Days.endDate}::date)
        )
        select
          w."windowKey",
          e.event_name as "eventName",
          count(*)::int as "eventCount",
          count(distinct e.session_id)::int as "uniqueSessions"
        from windows w
        join analytics_events e
          on e.created_at >= (w.start_date::timestamp at time zone 'Europe/Moscow')
         and e.created_at < ((w.end_date + 1)::timestamp at time zone 'Europe/Moscow')
        where e.event_name in (
          'home_viewed', 'quiz_started', 'quiz_completed',
          'result_viewed', 'product_clicked', 'email_submitted'
        )
        group by w."windowKey", e.event_name
        order by w."windowKey", e.event_name
      `;

      const funnelRows = await tx<FunnelRow[]>`
        with windows("windowKey", start_date, end_date) as (
          values
            ('yesterday', ${windows.yesterday.startDate}::date, ${windows.yesterday.endDate}::date),
            ('last7Days', ${windows.last7Days.startDate}::date, ${windows.last7Days.endDate}::date),
            ('previous7Days', ${windows.previous7Days.startDate}::date, ${windows.previous7Days.endDate}::date),
            ('last30Days', ${windows.last30Days.startDate}::date, ${windows.last30Days.endDate}::date),
            ('previous30Days', ${windows.previous30Days.startDate}::date, ${windows.previous30Days.endDate}::date)
        ), relevant as (
          select w."windowKey", e.session_id, e.event_name, e.created_at
          from windows w
          join analytics_events e
            on e.created_at >= (w.start_date::timestamp at time zone 'Europe/Moscow')
           and e.created_at < ((w.end_date + 1)::timestamp at time zone 'Europe/Moscow')
          where e.event_name in (
            'quiz_started', 'quiz_completed', 'result_viewed', 'product_clicked'
          )
        ), sessions as (
          select
            "windowKey",
            session_id,
            min(created_at) filter (where event_name = 'quiz_started') as quiz_started_at,
            min(created_at) filter (where event_name = 'result_viewed') as result_viewed_at,
            bool_or(event_name = 'product_clicked') as has_store_click
          from relevant
          group by "windowKey", session_id
        )
        select
          w."windowKey",
          count(*) filter (where s.quiz_started_at is not null)::int as "quizStartSessions",
          count(*) filter (
            where s.quiz_started_at is not null
              and exists (
                select 1 from relevant q
                where q."windowKey" = s."windowKey"
                  and q.session_id = s.session_id
                  and q.event_name = 'quiz_completed'
                  and q.created_at >= s.quiz_started_at
              )
          )::int as "quizCompletedSessions",
          count(*) filter (where s.result_viewed_at is not null)::int as "resultViewedSessions",
          count(*) filter (
            where s.result_viewed_at is not null
              and exists (
                select 1 from relevant c
                where c."windowKey" = s."windowKey"
                  and c.session_id = s.session_id
                  and c.event_name = 'product_clicked'
                  and c.created_at > s.result_viewed_at
              )
          )::int as "resultToStoreSessions",
          count(*) filter (where s.has_store_click)::int as "storeClickSessions"
        from windows w
        left join sessions s on s."windowKey" = w."windowKey"
        group by w."windowKey"
        order by w."windowKey"
      `;

      const quizProgressionRows = await tx<QuizProgressionRow[]>`
        with windows("windowKey", start_date, end_date) as (
          values
            ('yesterday', ${windows.yesterday.startDate}::date, ${windows.yesterday.endDate}::date),
            ('last7Days', ${windows.last7Days.startDate}::date, ${windows.last7Days.endDate}::date),
            ('previous7Days', ${windows.previous7Days.startDate}::date, ${windows.previous7Days.endDate}::date),
            ('last30Days', ${windows.last30Days.startDate}::date, ${windows.last30Days.endDate}::date),
            ('previous30Days', ${windows.previous30Days.startDate}::date, ${windows.previous30Days.endDate}::date)
        ), normalized as (
          select
            w."windowKey",
            e.session_id,
            e.event_name,
            e.created_at,
            case
              when jsonb_typeof(e.payload) = 'object' then e.payload
              when jsonb_typeof(e.payload) = 'string'
                and pg_input_is_valid(e.payload #>> '{}', 'jsonb')
                then case
                  when jsonb_typeof((e.payload #>> '{}')::jsonb) = 'object'
                    then (e.payload #>> '{}')::jsonb
                  else '{}'::jsonb
                end
              else '{}'::jsonb
            end as properties
          from windows w
          join analytics_events e
            on e.created_at >= (w.start_date::timestamp at time zone 'Europe/Moscow')
           and e.created_at < ((w.end_date + 1)::timestamp at time zone 'Europe/Moscow')
          where e.event_name in ('quiz_started', 'quiz_step_completed', 'quiz_completed')
        )
        select
          "windowKey",
          session_id as "sessionId",
          event_name as "eventName",
          created_at::text as "createdAt",
          nullif(btrim(properties->>'quiz_version'), '') as "quizVersion",
          case when properties->>'step_index' ~ '^[1-9][0-9]*$'
            then (properties->>'step_index')::int else null end as "stepIndex",
          nullif(btrim(properties->>'step_key'), '') as "stepKey",
          case when properties->>'total_steps' ~ '^[1-9][0-9]*$'
            then (properties->>'total_steps')::int else null end as "totalSteps"
        from normalized
        order by "windowKey", created_at, session_id, event_name
      `;

      const quizStepAvailabilityRows = await tx<QuizStepAvailabilityRow[]>`
        with normalized as (
          select
            e.created_at,
            case
              when jsonb_typeof(e.payload) = 'object' then e.payload
              when jsonb_typeof(e.payload) = 'string'
                and pg_input_is_valid(e.payload #>> '{}', 'jsonb')
                then case
                  when jsonb_typeof((e.payload #>> '{}')::jsonb) = 'object'
                    then (e.payload #>> '{}')::jsonb
                  else '{}'::jsonb
                end
              else '{}'::jsonb
            end as properties
          from analytics_events e
          where e.event_name = 'quiz_step_completed'
        )
        select min(created_at)::text as "availableFrom"
        from normalized
        where nullif(btrim(properties->>'quiz_version'), '') is not null
          and properties->>'step_index' ~ '^[1-9][0-9]*$'
          and nullif(btrim(properties->>'step_key'), '') is not null
          and properties->>'total_steps' ~ '^[1-9][0-9]*$'
      `;

      const commerceRows = await tx<CommerceRow[]>`
        with windows("windowKey", start_date, end_date) as (
          values
            ('yesterday', ${windows.yesterday.startDate}::date, ${windows.yesterday.endDate}::date),
            ('last7Days', ${windows.last7Days.startDate}::date, ${windows.last7Days.endDate}::date),
            ('previous7Days', ${windows.previous7Days.startDate}::date, ${windows.previous7Days.endDate}::date),
            ('last30Days', ${windows.last30Days.startDate}::date, ${windows.last30Days.endDate}::date),
            ('previous30Days', ${windows.previous30Days.startDate}::date, ${windows.previous30Days.endDate}::date)
        ), normalized as (
          select
            e.session_id,
            e.created_at,
            case
              when jsonb_typeof(e.payload) = 'object' then e.payload
              when jsonb_typeof(e.payload) = 'string'
                and pg_input_is_valid(e.payload #>> '{}', 'jsonb')
                then case
                  when jsonb_typeof((e.payload #>> '{}')::jsonb) = 'object'
                    then (e.payload #>> '{}')::jsonb
                  else '{}'::jsonb
                end
              else '{}'::jsonb
            end as properties
          from analytics_events e
          where e.event_name = 'product_clicked'
            and e.created_at >= (${windows.previous30Days.startDate}::date::timestamp at time zone 'Europe/Moscow')
            and e.created_at < ((${windows.last30Days.endDate}::date + 1)::timestamp at time zone 'Europe/Moscow')
        ), clicks as (
          select
            n.*,
            nullif(btrim(n.properties->>'source'), '') as source,
            nullif(btrim(n.properties->>'placement'), '') as placement,
            nullif(btrim(n.properties->>'board_slug'), '') as board_slug,
            nullif(btrim(n.properties->>'offer_slug'), '') as offer_slug,
            nullif(btrim(n.properties->>'size_label'), '') as size_label,
            nullif(
              lower(regexp_replace(
                substring(n.properties->>'destination_url' from '^[a-zA-Z][a-zA-Z0-9+.-]*://([^/:?#]+)'),
                '^www\\.',
                ''
              )),
              ''
            ) as merchant
          from normalized n
        ), merchant_items as (
          select merchant, 'merchant_board'::text as kind, board_slug as item,
                 count(*)::int event_count, count(distinct session_id)::int unique_sessions
          from clicks
          where created_at >= (${windows.last30Days.startDate}::date::timestamp at time zone 'Europe/Moscow')
            and merchant is not null and board_slug is not null
          group by merchant, board_slug
          union all
          select merchant, 'merchant_offer', offer_slug,
                 count(*)::int, count(distinct session_id)::int
          from clicks
          where created_at >= (${windows.last30Days.startDate}::date::timestamp at time zone 'Europe/Moscow')
            and merchant is not null and offer_slug is not null
          group by merchant, offer_slug
          union all
          select merchant, 'merchant_size', size_label,
                 count(*)::int, count(distinct session_id)::int
          from clicks
          where created_at >= (${windows.last30Days.startDate}::date::timestamp at time zone 'Europe/Moscow')
            and merchant is not null and size_label is not null
          group by merchant, size_label
        ), ranked_items as (
          select *, row_number() over (
            partition by merchant, kind order by event_count desc, item
          ) as rank
          from merchant_items
        )
        select 'total'::text as kind, w."windowKey", null::text as "groupValue",
               null::text as "itemValue", count(c.*)::int as "eventCount",
               count(distinct c.session_id)::int as "uniqueSessions"
        from windows w
        left join clicks c
          on c.created_at >= (w.start_date::timestamp at time zone 'Europe/Moscow')
         and c.created_at < ((w.end_date + 1)::timestamp at time zone 'Europe/Moscow')
        group by w."windowKey"
        union all
        select 'source', 'last30Days', source, null, count(*)::int,
               count(distinct session_id)::int
        from clicks
        where created_at >= (${windows.last30Days.startDate}::date::timestamp at time zone 'Europe/Moscow')
        group by source
        union all
        select 'placement', 'last30Days', placement, null, count(*)::int,
               count(distinct session_id)::int
        from clicks
        where created_at >= (${windows.last30Days.startDate}::date::timestamp at time zone 'Europe/Moscow')
        group by placement
        union all
        select 'size', 'last30Days', size_label, null, count(*)::int,
               count(distinct session_id)::int
        from clicks
        where created_at >= (${windows.last30Days.startDate}::date::timestamp at time zone 'Europe/Moscow')
        group by size_label
        union all
        select 'merchant', 'last30Days', merchant, null, count(*)::int,
               count(distinct session_id)::int
        from clicks
        where created_at >= (${windows.last30Days.startDate}::date::timestamp at time zone 'Europe/Moscow')
        group by merchant
        union all
        select kind, 'last30Days', merchant, item, event_count, unique_sessions
        from ranked_items where rank <= 5
      `;

      const topRows = await tx<TopCommerceRow[]>`
        with normalized as (
          select
            e.session_id,
            case
              when jsonb_typeof(e.payload) = 'object' then e.payload
              when jsonb_typeof(e.payload) = 'string'
                and pg_input_is_valid(e.payload #>> '{}', 'jsonb')
                then case
                  when jsonb_typeof((e.payload #>> '{}')::jsonb) = 'object'
                    then (e.payload #>> '{}')::jsonb
                  else '{}'::jsonb
                end
              else '{}'::jsonb
            end as properties
          from analytics_events e
          where e.event_name = 'product_clicked'
            and e.created_at >= (${windows.last30Days.startDate}::date::timestamp at time zone 'Europe/Moscow')
            and e.created_at < ((${windows.last30Days.endDate}::date + 1)::timestamp at time zone 'Europe/Moscow')
        ), clicks as (
          select
            session_id,
            nullif(btrim(properties->>'board_slug'), '') as board_slug,
            nullif(btrim(properties->>'offer_slug'), '') as offer_slug,
            nullif(btrim(properties->>'source'), '') as source,
            nullif(lower(regexp_replace(
              substring(properties->>'destination_url' from '^[a-zA-Z][a-zA-Z0-9+.-]*://([^/:?#]+)'),
              '^www\\.', ''
            )), '') as merchant
          from normalized
        ), boards as (
          select 'board'::text as kind, board_slug as identity,
                 count(*)::int event_count, count(distinct session_id)::int unique_sessions,
                 null::text as source, null::text as merchant
          from clicks where board_slug is not null
          group by board_slug
          order by event_count desc, board_slug
          limit 10
        ), offers as (
          select 'offer'::text as kind, offer_slug as identity,
                 count(*)::int event_count, count(distinct session_id)::int unique_sessions,
                 case when count(distinct source) filter (where source is not null) = 1
                   then min(source) else null end as source,
                 case when count(distinct merchant) filter (where merchant is not null) = 1
                   then min(merchant) else null end as merchant
          from clicks where offer_slug is not null
          group by offer_slug
          order by event_count desc, offer_slug
          limit 10
        )
        select kind, identity, event_count as "eventCount",
               unique_sessions as "uniqueSessions", source, merchant from boards
        union all
        select kind, identity, event_count, unique_sessions, source, merchant from offers
      `;

      const result = emptyFirstParty({ status: "ok" });
      const history = historyRows[0];
      result.historyDays = getHistoryDays(history?.firstEventAt ?? null, asOfDate);
      result.legacyPayloadRows = history?.legacyPayloadRows ?? 0;
      result.invalidPayloadRows = history?.invalidPayloadRows ?? 0;

      for (const row of eventRows) {
        if (result.events[row.windowKey] && row.eventName in result.events[row.windowKey]) {
          result.events[row.windowKey][row.eventName] = {
            eventCount: row.eventCount,
            uniqueSessions: row.uniqueSessions,
          };
        }
      }
      for (const row of funnelRows) {
        result.funnel[row.windowKey] = buildFunnelMetrics(row);
      }
      result.quizAbandonment = buildQuizAbandonmentReport(
        quizProgressionRows.map((row) => ({
          ...row,
          createdAt: new Date(row.createdAt).toISOString(),
        })),
      );
      const stepAvailableFrom = quizStepAvailabilityRows[0]?.availableFrom;
      result.quizAbandonment.availableFrom = stepAvailableFrom
        ? new Date(stepAvailableFrom).toISOString()
        : null;
      for (const row of commerceRows.filter((row) => row.kind === "total")) {
        if (row.windowKey) {
          result.commerce[row.windowKey] = {
            clickEvents: row.eventCount,
            uniqueClickSessions: row.uniqueSessions,
          };
        }
      }
      const total30d = result.commerce.last30Days.clickEvents;
      result.clickSources30Days = addShares(
        commerceRows.filter((row) => row.kind === "source"),
        total30d,
      );
      result.placements30Days = addShares(
        commerceRows.filter((row) => row.kind === "placement"),
        total30d,
      );
      result.sizes30Days = addShares(
        commerceRows.filter((row) => row.kind === "size"),
        total30d,
      );
      const merchantRows = commerceRows.filter((row) => row.kind === "merchant");
      result.merchants30Days = merchantRows.map((merchantRow) => ({
        merchant: merchantRow.groupValue,
        value: merchantRow.groupValue,
        clickEvents: merchantRow.eventCount,
        uniqueClickSessions: merchantRow.uniqueSessions,
        shareOfClicks:
          total30d === 0
            ? null
            : Math.round((merchantRow.eventCount / total30d + Number.EPSILON) * 10_000) /
              10_000,
        topBoards: commerceRows
          .filter(
            (row) =>
              row.kind === "merchant_board" &&
              row.groupValue === merchantRow.groupValue &&
              row.itemValue,
          )
          .map((row) => ({ boardSlug: row.itemValue!, clickEvents: row.eventCount })),
        topOffers: commerceRows
          .filter(
            (row) =>
              row.kind === "merchant_offer" &&
              row.groupValue === merchantRow.groupValue &&
              row.itemValue,
          )
          .map((row) => ({ offerSlug: row.itemValue!, clickEvents: row.eventCount })),
        topSizes: commerceRows
          .filter(
            (row) =>
              row.kind === "merchant_size" &&
              row.groupValue === merchantRow.groupValue &&
              row.itemValue,
          )
          .map((row) => ({ sizeLabel: row.itemValue!, clickEvents: row.eventCount })),
      }));
      result.topBoards30Days = topRows
        .filter((row) => row.kind === "board")
        .map((row) => ({
          boardSlug: row.identity,
          clickEvents: row.eventCount,
          uniqueClickSessions: row.uniqueSessions,
        }));
      result.topOffers30Days = topRows
        .filter((row) => row.kind === "offer")
        .map((row) => ({
          offerSlug: row.identity,
          clickEvents: row.eventCount,
          uniqueClickSessions: row.uniqueSessions,
          source: row.source,
          merchant: row.merchant,
        }));

      return result;
    });
  } catch (error) {
    console.error("Analytics first-party reporting source is unavailable.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return emptyFirstParty({
      status: "unavailable",
      diagnostic: { category: "database" },
    });
  }
}

function buildDataQuality({
  firstParty,
  metrikaStatus,
  acquisitionStatus,
  referralBreakdownStatus,
  traffic30d,
}: {
  firstParty: FirstPartyResult;
  metrikaStatus: AnalyticsSourceStatus;
  acquisitionStatus: AnalyticsSourceStatus;
  referralBreakdownStatus: AnalyticsSourceStatus;
  traffic30d: TrafficMetrics | null;
}) {
  const warnings: DataQualityWarning[] = [];
  const add = (code: string, message: string, severity: "info" | "warning" = "warning") =>
    warnings.push({ code, message, severity });

  if (firstParty.legacyPayloadRows > 0) {
    add(
      "legacy_payload_string_encoding",
      `${firstParty.legacyPayloadRows} analytics payload rows use legacy string encoding.`,
      "info",
    );
  }
  if (firstParty.invalidPayloadRows > 0) {
    add("invalid_payload_rows", "Some analytics payload rows could not be normalized.");
  }
  if (firstParty.sourceStatus.status !== "ok") {
    add(
      firstParty.sourceStatus.status === "not_configured"
        ? "first_party_not_configured"
        : "first_party_unavailable",
      "First-party analytics is not available for this report.",
    );
  }
  if (firstParty.historyDays !== null && firstParty.historyDays < 60) {
    add("insufficient_history", "First-party analytics history is shorter than 60 days.");
  }
  for (const key of reportWindowKeys) {
    const funnel = firstParty.funnel[key];
    if (funnel.quizCompletedSessions > funnel.quizStartSessions) {
      add("quiz_completion_exceeds_starts", `Quiz completions exceed starts in ${key}.`);
    }
    if (funnel.resultToStoreSessions > funnel.resultViewedSessions) {
      add("result_to_store_exceeds_views", `Result-to-store sessions exceed views in ${key}.`);
    }
  }
  const clicks30d = firstParty.commerce.last30Days.clickEvents;
  const exactOfferClicks30d = firstParty.topOffers30Days.reduce(
    (sum, offer) => sum + offer.clickEvents,
    0,
  );
  if (clicks30d > 0 && exactOfferClicks30d < clicks30d) {
    add(
      "incomplete_exact_offer_provenance",
      "Some clicks predate exact offer_slug provenance and remain board-only evidence.",
      "info",
    );
  }
  const unattributedMerchant = firstParty.merchants30Days.find(
    (merchant) => merchant.merchant === null,
  );
  if ((unattributedMerchant?.shareOfClicks ?? 0) >= 0.5) {
    add("unknown_merchant_dominance", "Unattributed merchants represent at least half of clicks.");
  }
  if (metrikaStatus.status !== "ok") {
    add(
      metrikaStatus.status === "not_configured"
        ? "metrika_not_configured"
        : "metrika_unavailable",
      "Yandex Metrica traffic is not available for this report.",
    );
  } else if (acquisitionStatus.status === "unavailable") {
    add(
      "metrika_acquisition_unavailable",
      "Yandex Metrica acquisition conversions are not available for this report.",
    );
  }
  if (referralBreakdownStatus.status === "unavailable") {
    add(
      "metrika_referral_breakdown_unavailable",
      "Metrika referral-domain detail is not available for this report.",
    );
  }
  if (traffic30d && traffic30d.users > 0 && traffic30d.visits === 0) {
    add("metrika_users_without_visits", "Metrika reports users but zero visits.");
  }

  return warnings;
}

export async function getAnalyticsReport({ now = new Date() } = {}) {
  const generatedAt = now.toISOString();
  const { asOfDate, windows } = buildReportWindows(now);
  const [firstParty, metrika] = await Promise.all([
    loadFirstPartyReport(windows, asOfDate),
    getMetrikaReporting({ windows }),
  ]);
  const traffic30d = metrika.traffic.last30Days ?? null;
  const partnerReadiness = buildPartnerReadiness({
    users30d: traffic30d?.users ?? null,
    quizCompletedSessions30d:
      firstParty.sourceStatus.status === "ok"
        ? firstParty.funnel.last30Days.quizCompletedSessions
        : null,
    storeClickSessions30d:
      firstParty.sourceStatus.status === "ok"
        ? firstParty.commerce.last30Days.uniqueClickSessions
        : null,
    resultToStoreRate30d:
      firstParty.sourceStatus.status === "ok"
        ? firstParty.funnel.last30Days.resultToStoreRate
        : null,
    firstPartyHistoryDays:
      firstParty.sourceStatus.status === "ok" ? firstParty.historyDays : null,
  });
  const weekOverWeek = {
    users: calculateTrend(
      metrika.traffic.last7Days?.users ?? 0,
      metrika.traffic.previous7Days?.users ?? 0,
    ),
    visits: calculateTrend(
      metrika.traffic.last7Days?.visits ?? 0,
      metrika.traffic.previous7Days?.visits ?? 0,
    ),
    quizCompletedSessions: calculateTrend(
      firstParty.funnel.last7Days.quizCompletedSessions,
      firstParty.funnel.previous7Days.quizCompletedSessions,
    ),
    resultViewedSessions: calculateTrend(
      firstParty.funnel.last7Days.resultViewedSessions,
      firstParty.funnel.previous7Days.resultViewedSessions,
    ),
    storeClickSessions: calculateTrend(
      firstParty.commerce.last7Days.uniqueClickSessions,
      firstParty.commerce.previous7Days.uniqueClickSessions,
    ),
  };
  const monthOverMonth = {
    users: calculateTrend(
      metrika.traffic.last30Days?.users ?? 0,
      metrika.traffic.previous30Days?.users ?? 0,
    ),
    visits: calculateTrend(
      metrika.traffic.last30Days?.visits ?? 0,
      metrika.traffic.previous30Days?.visits ?? 0,
    ),
    quizCompletedSessions: calculateTrend(
      firstParty.funnel.last30Days.quizCompletedSessions,
      firstParty.funnel.previous30Days.quizCompletedSessions,
    ),
    resultViewedSessions: calculateTrend(
      firstParty.funnel.last30Days.resultViewedSessions,
      firstParty.funnel.previous30Days.resultViewedSessions,
    ),
    storeClickSessions: calculateTrend(
      firstParty.commerce.last30Days.uniqueClickSessions,
      firstParty.commerce.previous30Days.uniqueClickSessions,
    ),
  };

  const report = {
    version: ANALYTICS_REPORT_VERSION,
    generatedAt,
    asOfDate,
    timezone: ANALYTICS_REPORT_TIMEZONE,
    windows,
    sourceStatus: {
      firstParty: firstParty.sourceStatus,
      metrika: metrika.sourceStatus,
    },
    traffic: {
      yesterday: metrika.traffic.yesterday ?? null,
      last7Days: metrika.traffic.last7Days ?? null,
      previous7Days: metrika.traffic.previous7Days ?? null,
      last30Days: traffic30d,
      previous30Days: metrika.traffic.previous30Days ?? null,
      sources30Days: metrika.traffic.sources30Days,
      sourcesSampling: metrika.traffic.sourcesSampling,
    },
    acquisition: {
      ...metrika.acquisition,
      quizCompletionPolicy: quizCompletionAcquisitionPolicy,
    },
    firstParty: {
      historyDays: firstParty.historyDays,
      events: firstParty.events,
    },
    funnel: firstParty.funnel,
    quizAbandonment: firstParty.quizAbandonment,
    commerce: {
      windows: firstParty.commerce,
      clickSources30Days: firstParty.clickSources30Days,
      placements30Days: firstParty.placements30Days,
      sizes30Days: firstParty.sizes30Days,
      merchants30Days: firstParty.merchants30Days,
      topBoards30Days: firstParty.topBoards30Days,
      topOffers30Days: firstParty.topOffers30Days,
    },
    trends: { weekOverWeek, monthOverMonth },
    partnerReadiness,
    dataQuality: buildDataQuality({
      firstParty,
      metrikaStatus: metrika.sourceStatus,
      acquisitionStatus: metrika.acquisition.sourceStatus,
      referralBreakdownStatus: metrika.acquisition.referralBreakdownStatus,
      traffic30d,
    }),
  };

  if (getAnalyticsReportPrivacyViolations(report).length > 0) {
    throw new Error("Analytics report privacy projection failed.");
  }

  return report;
}

export type AnalyticsReport = Awaited<ReturnType<typeof getAnalyticsReport>>;

export function hasUsableAnalyticsSource(report: AnalyticsReport) {
  return (
    report.sourceStatus.firstParty.status === "ok" ||
    report.sourceStatus.metrika.status === "ok"
  );
}

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { InternalAuthBar } from "@/components/internal/internal-auth-bar";
import {
  getAnalyticsReport,
  type AnalyticsReport,
} from "@/lib/analytics/reporting-server";
import type {
  AcquisitionGoalKey,
  GoalConversionMetric,
} from "@/lib/analytics/reporting-core";
import {
  INTERNAL_ACCESS_COOKIE,
  INTERNAL_LOGIN_PATH,
  isInternalAccessConfigured,
  isValidInternalAccessToken,
} from "@/lib/internal/access";

export const metadata: Metadata = {
  title: "Внутренняя аналитика",
  description: "Агрегированный операционный отчёт EdgeFit.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

const integerFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 0,
});
const decimalFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1,
});
const percentFormatter = new Intl.NumberFormat("ru-RU", {
  style: "percent",
  maximumFractionDigits: 1,
});

function formatInteger(value: number | null | undefined) {
  return value == null ? "—" : integerFormatter.format(value);
}

function formatDecimal(value: number | null | undefined) {
  return value == null ? "—" : decimalFormatter.format(value);
}

function formatPercent(value: number | null | undefined) {
  return value == null ? "—" : percentFormatter.format(value);
}

const acquisitionGoalLabels: Record<AcquisitionGoalKey, string> = {
  quizStarted: "Quiz started",
  resultViewed: "Result viewed",
  productClicked: "Store click",
};

function AcquisitionGoalValue({ goal }: { goal: GoalConversionMetric | undefined }) {
  return (
    <>
      <strong className="block text-slate-900">{formatInteger(goal?.visits)}</strong>
      <span className="text-xs text-slate-500">
        {formatPercent(goal?.visitConversionRate)} визитов
      </span>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isOk = status === "ok" || status === "metric_ready";
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] ${
        isOk
          ? "bg-emerald-100 text-emerald-800"
          : "bg-amber-100 text-amber-900"
      }`}
    >
      {status}
    </span>
  );
}

function MetricCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-bold text-slate-950">{value}</p>
      {note ? <p className="mt-2 text-sm text-slate-600">{note}</p> : null}
    </article>
  );
}

function TrendTable({
  report,
  period,
}: {
  report: AnalyticsReport;
  period: "weekOverWeek" | "monthOverMonth";
}) {
  const trends = report.trends[period];
  const rows = [
    ["Пользователи", trends.users],
    ["Визиты", trends.visits],
    ["Завершения квиза", trends.quizCompletedSessions],
    ["Просмотры результата", trends.resultViewedSessions],
    ["Сессии с кликом", trends.storeClickSessions],
  ] as const;
  const currentLabel = period === "weekOverWeek" ? "7 дней" : "30 дней";
  const previousLabel = period === "weekOverWeek" ? "Предыдущие 7" : "Предыдущие 30";

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[42rem] w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-slate-500">
          <tr>
            <th className="px-3 py-3">Метрика</th>
            <th className="px-3 py-3">{currentLabel}</th>
            <th className="px-3 py-3">{previousLabel}</th>
            <th className="px-3 py-3">Δ</th>
            <th className="px-3 py-3">Δ%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, trend]) => (
            <tr key={label} className="border-b border-slate-100 last:border-0">
              <th className="px-3 py-3 font-semibold text-slate-800">{label}</th>
              <td className="px-3 py-3">{formatInteger(trend.current)}</td>
              <td className="px-3 py-3">{formatInteger(trend.previous)}</td>
              <td className="px-3 py-3">{formatInteger(trend.absolute)}</td>
              <td className="px-3 py-3">{formatPercent(trend.percent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function InternalAnalyticsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(INTERNAL_ACCESS_COOKIE)?.value;

  if (!(await isValidInternalAccessToken(token))) {
    const reason = isInternalAccessConfigured() ? "" : "&reason=config";
    redirect(`${INTERNAL_LOGIN_PATH}?next=/internal/analytics${reason}`);
  }

  const report = await getAnalyticsReport();
  const traffic30d = report.traffic.last30Days;
  const funnel30d = report.funnel.last30Days;
  const commerce30d = report.commerce.windows.last30Days;
  const acquisition30d = report.acquisition.last30Days;

  return (
    <div className="container-shell py-10 sm:py-14">
      <InternalAuthBar />
      <header className="mt-8 flex flex-col gap-4 border-b border-slate-200 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-sky-700">
            EdgeFit / internal analytics
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950 sm:text-4xl">
            Аналитический отчёт
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Данные по завершённый день {report.asOfDate}, {report.timezone}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={report.sourceStatus.firstParty.status} />
          <StatusBadge status={report.sourceStatus.metrika.status} />
        </div>
      </header>

      <main className="space-y-10 py-8">
        <section aria-labelledby="readiness-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="readiness-title" className="text-2xl font-bold text-slate-950">
              Partner Readiness
            </h2>
            <StatusBadge status={report.partnerReadiness.status} />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              label="Score"
              value={formatDecimal(report.partnerReadiness.score)}
              note="Из 100; manual gates не входят в score."
            />
            <MetricCard
              label="Strict outreach ready"
              value={report.partnerReadiness.strictOutreachReady ? "Да" : "Нет"}
              note={`${report.partnerReadiness.failingMetrics.length} незакрытых metric gates`}
            />
            <MetricCard
              label="История first-party"
              value={formatInteger(report.firstParty.historyDays)}
              note="Завершённых календарных дней"
            />
          </div>
        </section>

        <section aria-labelledby="kpi-title">
          <h2 id="kpi-title" className="text-2xl font-bold text-slate-950">KPI за 30 дней</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard label="Yandex users" value={formatInteger(traffic30d?.users)} />
            <MetricCard label="Yandex visits" value={formatInteger(traffic30d?.visits)} />
            <MetricCard
              label="Завершили квиз"
              value={formatInteger(funnel30d.quizCompletedSessions)}
              note={formatPercent(funnel30d.quizCompletionRate)}
            />
            <MetricCard
              label="Увидели результат"
              value={formatInteger(funnel30d.resultViewedSessions)}
            />
            <MetricCard
              label="Сессии с кликом"
              value={formatInteger(commerce30d.uniqueClickSessions)}
              note={`${formatInteger(commerce30d.clickEvents)} событий`}
            />
            <MetricCard
              label="Result → store"
              value={formatPercent(funnel30d.resultToStoreRate)}
            />
          </div>
        </section>

        <section className="min-w-0" aria-labelledby="acquisition-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="acquisition-title" className="text-2xl font-bold text-slate-950">
                Yandex acquisition
              </h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Конверсия traffic → goal за последние 30 завершённых дней. Это не
                последовательная конверсия first-party funnel.
              </p>
            </div>
            <StatusBadge status={report.acquisition.sourceStatus.status} />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(acquisitionGoalLabels) as AcquisitionGoalKey[]).map((key) => {
              const goal = acquisition30d?.goals[key];
              return (
                <MetricCard
                  key={key}
                  label={acquisitionGoalLabels[key]}
                  value={formatInteger(goal?.visits)}
                  note={`${formatPercent(goal?.visitConversionRate)} визитов · ${formatInteger(goal?.users)} пользователей · ${formatPercent(goal?.userConversionRate)} пользователей`}
                />
              );
            })}
          </div>

          <div className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sm text-sky-950">
            <strong>Quiz completion: first-party ordered funnel.</strong>{" "}
            Yandex goal {report.acquisition.quizCompletionPolicy.yandexGoalId} намеренно
            исключён из acquisition reporting из-за исторического загрязнения; чистая
            Yandex-история начинается с {report.acquisition.quizCompletionPolicy.cleanFrom}.
          </div>

          <div className="mt-6 grid min-w-0 gap-6">
            <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-xl font-bold text-slate-950">Traffic source → goals</h3>
              {report.acquisition.sources30Days.length > 0 ? (
                <div className="mt-4 max-w-full overflow-x-auto">
                  <table className="min-w-[46rem] w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-slate-500">
                      <tr>
                        <th className="px-3 py-3">Источник</th>
                        <th className="px-3 py-3">Визиты</th>
                        <th className="px-3 py-3">Quiz start</th>
                        <th className="px-3 py-3">Result</th>
                        <th className="px-3 py-3">Store</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.acquisition.sources30Days.map((item) => (
                        <tr key={item.source} className="border-b border-slate-100 last:border-0">
                          <th className="px-3 py-3 font-semibold text-slate-800">
                            {item.label}
                            <span className="mt-1 block text-xs font-normal text-slate-500">
                              {item.source}
                            </span>
                          </th>
                          <td className="px-3 py-3">{formatInteger(item.visits)}</td>
                          <td className="px-3 py-3"><AcquisitionGoalValue goal={item.goals.quizStarted} /></td>
                          <td className="px-3 py-3"><AcquisitionGoalValue goal={item.goals.resultViewed} /></td>
                          <td className="px-3 py-3"><AcquisitionGoalValue goal={item.goals.productClicked} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-600">Нет доступных данных по источникам.</p>
              )}
            </article>

            <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-xl font-bold text-slate-950">Landing page → goals</h3>
              {report.acquisition.landingPages30Days.length > 0 ? (
                <div className="mt-4 max-w-full overflow-x-auto">
                  <table className="min-w-[46rem] w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-slate-500">
                      <tr>
                        <th className="px-3 py-3">Landing path</th>
                        <th className="px-3 py-3">Визиты</th>
                        <th className="px-3 py-3">Quiz start</th>
                        <th className="px-3 py-3">Result</th>
                        <th className="px-3 py-3">Store</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.acquisition.landingPages30Days.map((item) => (
                        <tr key={item.path} className="border-b border-slate-100 last:border-0">
                          <th className="px-3 py-3 font-semibold text-slate-800">
                            <span className="break-all">{item.path}</span>
                          </th>
                          <td className="px-3 py-3">{formatInteger(item.visits)}</td>
                          <td className="px-3 py-3"><AcquisitionGoalValue goal={item.goals.quizStarted} /></td>
                          <td className="px-3 py-3"><AcquisitionGoalValue goal={item.goals.resultViewed} /></td>
                          <td className="px-3 py-3"><AcquisitionGoalValue goal={item.goals.productClicked} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-600">Нет доступных данных по landing pages.</p>
              )}
            </article>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2" aria-label="KPI trends">
          <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">7 дней vs предыдущие 7</h2>
            <div className="mt-4"><TrendTable report={report} period="weekOverWeek" /></div>
          </article>
          <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">30 дней vs предыдущие 30</h2>
            <div className="mt-4"><TrendTable report={report} period="monthOverMonth" /></div>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-2" aria-label="Commerce evidence">
          <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">Merchant evidence</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[30rem] w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-500"><tr><th className="py-3">Hostname</th><th>Клики</th><th>Сессии</th><th>Доля</th></tr></thead>
                <tbody>{report.commerce.merchants30Days.map((item) => <tr key={item.merchant ?? "unattributed"} className="border-b border-slate-100"><td className="py-3 font-medium">{item.merchant ?? "unattributed"}</td><td>{item.clickEvents}</td><td>{item.uniqueClickSessions}</td><td>{formatPercent(item.shareOfClicks)}</td></tr>)}</tbody>
              </table>
            </div>
          </article>
          <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">Click origins</h2>
            <ul className="mt-4 divide-y divide-slate-100 text-sm">
              {report.commerce.clickSources30Days.map((item) => <li key={item.value ?? "unknown"} className="flex justify-between gap-4 py-3"><span>{item.value ?? "unknown"}</span><strong>{item.clickEvents}</strong></li>)}
            </ul>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">Top canonical boards</h2>
            <ol className="mt-4 divide-y divide-slate-100 text-sm">{report.commerce.topBoards30Days.map((item) => <li key={item.boardSlug} className="flex justify-between gap-4 py-3"><span className="break-all">{item.boardSlug}</span><strong>{item.clickEvents}</strong></li>)}</ol>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">Top exact offers</h2>
            <ol className="mt-4 divide-y divide-slate-100 text-sm">{report.commerce.topOffers30Days.map((item) => <li key={item.offerSlug} className="py-3"><div className="flex justify-between gap-4"><span className="break-all">{item.offerSlug}</span><strong>{item.clickEvents}</strong></div><p className="mt-1 text-xs text-slate-500">{item.merchant ?? "merchant unknown"}</p></li>)}</ol>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-xl font-bold text-amber-950">Data quality</h2>
            <ul className="mt-4 space-y-3 text-sm text-amber-950">{report.dataQuality.map((warning) => <li key={warning.code}><strong>{warning.code}</strong><br />{warning.message}</li>)}</ul>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">Manual gates</h2>
            <ul className="mt-4 space-y-3 text-sm">{report.partnerReadiness.manualChecks.map((check) => <li key={check.id} className="flex flex-wrap justify-between gap-2"><span>{check.id}</span><StatusBadge status={check.status} /></li>)}</ul>
          </article>
        </section>
      </main>
    </div>
  );
}

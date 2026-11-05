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

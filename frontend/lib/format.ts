/**
 * Formatting helpers. API timestamps are already in home-terminal time
 * ("2026-10-01T06:00:00-05:00"), so times and dates are read from the string —
 * never converted through the browser's time zone.
 */

/** "2026-10-01T06:00:00-05:00" → "06:00". */
export function clockTime(iso: string): string {
  return iso.slice(11, 16);
}

/** "2026-10-01T06:00:00-05:00" → "2026-10-01". */
export function isoDate(iso: string): string {
  return iso.slice(0, 10);
}

/** "2026-10-01" → "Thu, Oct 1". */
export function shortDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** 45 → "45 min", 90 → "1h30", 600 → "10h". */
export function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours}h`;
}

/** Hours as written on a paper log: 11 → "11", 7.75 → "7.75". */
export function logHours(hours: number): string {
  return String(Number(hours.toFixed(2)));
}

/** 2934.7 → "2,935". */
export function miles(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** Whole minutes between two ISO timestamps. */
export function minutesBetween(startIso: string, endIso: string): number {
  return Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000);
}

/** Minutes after midnight → "HH:MM" (1440 → "24:00"). */
export function minuteLabel(minuteOfDay: number): string {
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** "St. Louis, MO" → "St. Louis". */
export function cityOf(label: string): string {
  return label.split(",")[0].trim();
}

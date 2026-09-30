/**
 * Connects log-sheet brackets and itinerary stops. Both use the same home-terminal clock,
 * so "YYYY-MM-DDTHH:MM" strings compare chronologically as plain text.
 */
import type { Bracket, DailyLog, Stop } from "@/lib/api/types";
import { minuteLabel } from "@/lib/format";

export function stopForBracket(stops: readonly Stop[], date: string, bracket: Bracket): Stop | undefined {
  const at = `${date}T${minuteLabel(bracket.start_minute)}`;
  return stops.find(
    (stop) => stop.kind !== "start" && stop.starts_at.slice(0, 16) <= at && at < stop.ends_at.slice(0, 16),
  );
}

export function dayIndexForStop(logs: readonly DailyLog[], stop: Stop): number {
  const index = logs.findIndex((log) => log.date === stop.starts_at.slice(0, 10));
  return index === -1 ? 0 : index;
}

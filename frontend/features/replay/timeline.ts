/**
 * The trip as a timeline for replay: what the driver is doing, and where the truck is, at any
 * minute. Pure functions; times come from the API's home-terminal timestamps (never converted
 * through the browser's time zone).
 */
import type { DutyStatus, StopKind, Trip } from "@/lib/api/types";
import { addDays, clockTime, isoDate, miles, minuteLabel, minutesBetween, shortDate } from "@/lib/format";
import { STATUS_NAMES, STOP_STYLE } from "@/lib/stops";

export type LngLat = [number, number];
export type IntervalKind = "drive" | StopKind;

/** A stretch of the trip, in minutes from the first stop's start: one stop, or the drive between two. */
export interface Interval {
  startMin: number;
  endMin: number;
  status: DutyStatus;
  kind: IntervalKind;
  /** Stops only: the stop being served. */
  stopId?: string;
  /** Drives only: the stop the truck left and the one it is heading for. */
  fromStopId?: string;
  toStopId?: string;
  mileStart: number;
  mileEnd: number;
}

export interface ReplayState {
  /** Index of the current interval in the timeline. */
  index: number;
  status: DutyStatus;
  kind: IntervalKind;
  stopId?: string;
  toStopId?: string;
  mile: number;
}

export interface Clock {
  /** "Fri, Oct 2". */
  dateLabel: string;
  /** "09:45" (whole minutes). */
  time: string;
  /** "2026-10-02", as in `daily_logs[].date`. */
  isoDate: string;
  /** Minutes after midnight, fractional while the replay glides between minutes. */
  minuteOfDay: number;
}

type TripStops = Pick<Trip, "stops">;

/**
 * Stops come in time order and the truck drives between consecutive ones: from the previous
 * stop's end to the next stop's start, from its mile to the next one's. Zero-length intervals
 * (the start marker, back-to-back stops) are left out, so the list is contiguous.
 */
export function buildTimeline(trip: TripStops): Interval[] {
  const { stops } = trip;
  if (stops.length === 0) return [];
  const origin = stops[0].starts_at;
  const intervals: Interval[] = [];
  stops.forEach((stop, index) => {
    const startMin = minutesBetween(origin, stop.starts_at);
    const endMin = minutesBetween(origin, stop.ends_at);
    const previous = stops[index - 1];
    if (previous) {
      const driveStart = minutesBetween(origin, previous.ends_at);
      if (startMin > driveStart) {
        intervals.push({
          startMin: driveStart,
          endMin: startMin,
          status: "driving",
          kind: "drive",
          fromStopId: previous.id,
          toStopId: stop.id,
          mileStart: previous.mile,
          mileEnd: stop.mile,
        });
      }
    }
    if (endMin > startMin) {
      intervals.push({
        startMin,
        endMin,
        status: stop.status,
        kind: stop.kind,
        stopId: stop.id,
        mileStart: stop.mile,
        mileEnd: stop.mile,
      });
    }
  });
  return intervals;
}

export function totalMinutes(timeline: readonly Interval[]): number {
  return timeline.at(-1)?.endMin ?? 0;
}

/** The interval holding minute `t` (each owns its start, the last one also its end). */
function indexAt(timeline: readonly Interval[], t: number): number {
  let low = 0;
  let high = timeline.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (timeline[middle].startMin <= t) low = middle;
    else high = middle - 1;
  }
  return low;
}

/** What is happening at minute `t` (clamped to the trip). While driving, the mile is interpolated. */
export function stateAt(timeline: readonly Interval[], t: number): ReplayState {
  if (timeline.length === 0) return { index: -1, status: "off_duty", kind: "start", mile: 0 };
  const at = Math.min(Math.max(t, 0), totalMinutes(timeline));
  const index = indexAt(timeline, at);
  const interval = timeline[index];
  const { status, kind, stopId, toStopId } = interval;
  const progress = (at - interval.startMin) / (interval.endMin - interval.startMin);
  const mile = interval.mileStart + (interval.mileEnd - interval.mileStart) * progress;
  return {
    index,
    status,
    kind,
    ...(stopId !== undefined && { stopId }),
    ...(toStopId !== undefined && { toStopId }),
    mile,
  };
}

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

function haversine([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Measures a line once and returns a function from a fraction of its length to a point on it,
 * so a replay frame costs a binary search, not a re-measure.
 */
export function routeLocator(coordinates: readonly LngLat[]): (fraction: number) => LngLat | null {
  const cumulative = [0];
  for (let i = 1; i < coordinates.length; i += 1) {
    cumulative.push(cumulative[i - 1] + haversine(coordinates[i - 1], coordinates[i]));
  }
  const length = cumulative.at(-1) ?? 0;
  return (fraction) => {
    if (coordinates.length === 0) return null;
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    if (length === 0 || fraction <= 0) return [first[0], first[1]];
    if (fraction >= 1) return [last[0], last[1]];
    const target = fraction * length;
    let low = 0;
    let high = cumulative.length - 1;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (cumulative[middle] <= target) low = middle;
      else high = middle;
    }
    const span = cumulative[high] - cumulative[low];
    const along = span === 0 ? 0 : (target - cumulative[low]) / span;
    const [lng1, lat1] = coordinates[low];
    const [lng2, lat2] = coordinates[high];
    return [lng1 + (lng2 - lng1) * along, lat1 + (lat2 - lat1) * along];
  };
}

/**
 * The point `fraction` of the way along a line, by great-circle length. The route geometry is
 * simplified, so `mile / total miles` is the right fraction to ask for.
 */
export function pointAlong(coordinates: readonly LngLat[], fraction: number): LngLat | null {
  return routeLocator(coordinates)(fraction);
}

function origin(trip: Pick<Trip, "stops" | "summary">): string {
  return trip.stops[0]?.starts_at ?? trip.summary.starts_at;
}

/** Home-terminal date and time `t` minutes into the trip: read from the start timestamp, plus minute arithmetic. */
export function clockAt(trip: Pick<Trip, "stops" | "summary">, t: number): Clock {
  const start = origin(trip);
  const [hours, minutes] = clockTime(start).split(":").map(Number);
  const elapsed = hours * 60 + minutes + t;
  const days = Math.floor(elapsed / 1440);
  const minuteOfDay = elapsed - days * 1440;
  const date = addDays(isoDate(start), days);
  return { dateLabel: shortDate(date), time: minuteLabel(Math.floor(minuteOfDay)), isoDate: date, minuteOfDay };
}

export interface DayMark {
  t: number;
  label: string;
}

/** "Day 1" at the start, then a mark at every midnight before the end. */
export function dayMarks(trip: Pick<Trip, "stops" | "summary">, total: number): DayMark[] {
  const startMinute = clockAt(trip, 0).minuteOfDay;
  const marks: DayMark[] = [{ t: 0, label: "Day 1" }];
  for (let day = 1, t = 1440 - startMinute; t < total; day += 1, t += 1440) {
    if (t > 0) marks.push({ t, label: `Day ${day + 1}` });
  }
  return marks;
}

export interface StopMark {
  t: number;
  id: string;
  kind: StopKind;
}

/** Every stop, the start included, at the minute it begins. */
export function stopMarks(trip: TripStops): StopMark[] {
  const start = trip.stops[0]?.starts_at;
  return trip.stops.map((stop) => ({ t: minutesBetween(start, stop.starts_at), id: stop.id, kind: stop.kind }));
}

/** Where reduced-motion playback stops: the start of each stop, then the end of the trip. */
export function stopSteps(timeline: readonly Interval[]): number[] {
  const steps = timeline.filter((interval) => interval.kind !== "drive").map((interval) => interval.startMin);
  const total = totalMinutes(timeline);
  return steps.at(-1) === total ? steps : [...steps, total];
}

/** "mile 662" while driving; "10-h rest at Adel, GA" during a stop. */
export function stateDetail(trip: TripStops, state: ReplayState): string {
  if (state.kind === "drive" || state.stopId === undefined) return `mile ${miles(state.mile)}`;
  const stop = trip.stops.find((candidate) => candidate.id === state.stopId);
  return stop ? `${STOP_STYLE[stop.kind].label} at ${stop.place}` : STOP_STYLE[state.kind].label;
}

/** Read out as the replay moves on: "Driving to St. Louis, MO", "Sleeper berth: 10-h rest at Jasper, AR". */
export function announcement(trip: TripStops, state: ReplayState): string {
  if (state.kind === "drive") {
    const next = trip.stops.find((stop) => stop.id === state.toStopId);
    return next ? `Driving to ${next.place}` : STATUS_NAMES.driving;
  }
  return `${STATUS_NAMES[state.status]}: ${stateDetail(trip, state)}`;
}

/** Read out once when playback reaches the end: "Arrived at Dallas, TX". */
export function arrivalText(trip: TripStops): string {
  const last = trip.stops.at(-1);
  return last ? `Arrived at ${last.place}` : "";
}

/**
 * The scrubber's aria-valuetext while playing: the day and the stretch ("Thu, Oct 1: Driving to St. Louis,
 * MO"), with no clock or mile, so a focused slider is re-read when the stretch changes, not every frame.
 */
export function stretchText(trip: TripStops, clock: Clock, state: ReplayState): string {
  const what =
    state.kind === "drive" ? announcement(trip, state) : `${STATUS_NAMES[state.status]}, ${stateDetail(trip, state)}`;
  return `${clock.dateLabel}: ${what}`;
}

/** The scrubber's aria-valuetext: "Fri, Oct 2, 09:45 EDT: Driving, mile 662". */
export function valueText(trip: Pick<Trip, "stops" | "home_time_zone">, clock: Clock, state: ReplayState): string {
  const zone = trip.home_time_zone.abbreviation;
  return `${clock.dateLabel}, ${clock.time} ${zone}: ${STATUS_NAMES[state.status]}, ${stateDetail(trip, state)}`;
}

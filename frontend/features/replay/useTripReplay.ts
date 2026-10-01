"use client";

import { useMemo } from "react";
import type { DutyStatus, Trip } from "@/lib/api/types";
import {
  type Clock,
  type DayMark,
  type LngLat,
  type ReplayState,
  type StopMark,
  announcement,
  arrivalText,
  buildTimeline,
  clockAt,
  dayMarks,
  routeLocator,
  stateAt,
  stateDetail,
  stopMarks,
  stopSteps,
  stretchText,
  totalMinutes,
  valueText,
} from "./timeline";
import { type Playback, usePlayback } from "./usePlayback";

export interface TruckPosition {
  lngLat: LngLat;
  status: DutyStatus;
}

export interface Playhead {
  isoDate: string;
  minuteOfDay: number;
  playing: boolean;
}

/** Playback for one trip, plus everything the map, panel, logs and bar show for the current minute. */
export interface TripReplay extends Playback {
  total: number;
  state: ReplayState;
  clock: Clock;
  /** Home-terminal zone abbreviation ("CDT"). */
  zone: string;
  /** "mile 662" or "10-h rest at Adel, GA". */
  detail: string;
  /** The scrubber's aria-valuetext: the exact minute when paused, the stretch while playing. */
  valueText: string;
  /** For the live region: the stretch while playing, then the arrival once playback ends. */
  announcement: string;
  arrival: string;
  days: DayMark[];
  stops: StopMark[];
  /** The rest are null unless the replay is on screen. */
  truck: TruckPosition | null;
  currentStopId: string | null;
  drivingToStopId: string | null;
  playhead: Playhead | null;
}

const NO_CLOCK: Clock = { dateLabel: "", time: "", isoDate: "", minuteOfDay: 0 };

/**
 * Owns the replay of the trip on screen (null: none). The timeline, marks and route measure are
 * memoised per trip, so a frame costs a binary search or two and some string formatting.
 */
export function useTripReplay(trip: Trip | null): TripReplay {
  const timeline = useMemo(() => (trip ? buildTimeline(trip) : []), [trip]);
  const total = totalMinutes(timeline);
  const steps = useMemo(() => stopSteps(timeline), [timeline]);
  const locate = useMemo(() => routeLocator((trip?.route.geometry.coordinates ?? []) as LngLat[]), [trip]);
  const days = useMemo(() => (trip ? dayMarks(trip, total) : []), [trip, total]);
  const stops = useMemo(() => (trip ? stopMarks(trip) : []), [trip]);
  const playback = usePlayback({ total, steps, resetKey: trip?.id ?? null });

  const state = stateAt(timeline, playback.t);
  const clock = trip ? clockAt(trip, playback.t) : NO_CLOCK;
  const onScreen = playback.active && trip !== null;
  const totalMiles = trip?.summary.total_miles ?? 0;
  const lngLat = onScreen ? locate(totalMiles > 0 ? state.mile / totalMiles : 0) : null;
  const driving = state.kind === "drive";

  return {
    ...playback,
    total,
    state,
    clock,
    zone: trip?.home_time_zone.abbreviation ?? "",
    detail: trip ? stateDetail(trip, state) : "",
    valueText: !trip ? "" : playback.playing ? stretchText(trip, clock, state) : valueText(trip, clock, state),
    announcement: trip ? announcement(trip, state) : "",
    arrival: trip ? arrivalText(trip) : "",
    days,
    stops,
    truck: lngLat ? { lngLat, status: state.status } : null,
    currentStopId: onScreen && !driving ? (state.stopId ?? null) : null,
    drivingToStopId: onScreen && driving ? (state.toStopId ?? null) : null,
    playhead: onScreen
      ? { isoDate: clock.isoDate, minuteOfDay: clock.minuteOfDay, playing: playback.playing }
      : null,
  };
}

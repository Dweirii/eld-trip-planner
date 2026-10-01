"use client";

import clsx from "clsx";
import { useEffectEvent, useId, useLayoutEffect, useMemo, useState } from "react";
import { TabPanel, Tabs } from "@/components/ui/Tabs";
import type { DailyLog, Trip } from "@/lib/api/types";
import { addDays, shortDate } from "@/lib/format";
import { LogSheet } from "./LogSheet";
import { dayIndexForStop, stopForBracket } from "./linking";
import { dailyMiles } from "./miles";

/** The Daily logs heading; the results panel's "Daily logs ↓" jumps here. */
export const DAILY_LOGS_ID = "daily-logs";

/** Scroll to the daily logs (smoothly, unless the user prefers reduced motion) and focus their heading. */
export function showDailyLogs() {
  const heading = document.getElementById(DAILY_LOGS_ID);
  if (!heading) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  heading.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  heading.focus({ preventScroll: true });
}

/** Trip replay: the home-terminal date and minute the replay is at, and whether it is playing. */
export interface LogPlayhead {
  isoDate: string;
  minuteOfDay: number;
  playing?: boolean;
}

/**
 * The sheet and minute a playhead falls on. A trip that ends at midnight has no sheet for the day it
 * ends on, so 00:00 there is 24:00 on the sheet before.
 */
export function sheetPlayhead(
  logs: readonly DailyLog[],
  playhead: Pick<LogPlayhead, "isoDate" | "minuteOfDay"> | null | undefined,
): { index: number; minute: number } | null {
  if (!playhead) return null;
  const index = logs.findIndex((log) => log.date === playhead.isoDate);
  if (index !== -1) return { index, minute: playhead.minuteOfDay };
  if (playhead.minuteOfDay === 0) {
    const previous = logs.findIndex((log) => log.date === addDays(playhead.isoDate, -1));
    if (previous !== -1) return { index: previous, minute: 1440 };
  }
  return null;
}

export interface LogSheetsProps {
  trip: Trip;
  selectedStopId: string | null;
  onSelectStop: (stopId: string | null) => void;
  /** Trip replay: draws a now line on the playhead's sheet and follows it from day to day. */
  playhead?: LogPlayhead | null;
  /** The day shown (an index into the daily logs). Pass it to control the day (the guided tour does). */
  activeDay?: number;
  /** Called with the day the user picks, or the one the replay moves to. */
  onActiveDayChange?: (day: number) => void;
}

/** Day tabs over the paper sheets. Every sheet stays in the DOM so "Print / PDF" gets all days. */
export function LogSheets({
  trip,
  selectedStopId,
  onSelectStop,
  playhead = null,
  activeDay: controlledDay,
  onActiveDayChange,
}: LogSheetsProps) {
  const logs = trip.daily_logs;
  const [ownDay, setOwnDay] = useState(0);
  const activeDay = controlledDay ?? ownDay;
  const [showAll, setShowAll] = useState(false);
  // A day the replay moved to, for the parent: told after rendering, never while rendering.
  const [followedTo, setFollowedTo] = useState<{ day: number } | null>(null);
  const reportFollow = useEffectEvent((day: number) => onActiveDayChange?.(day));
  useLayoutEffect(() => {
    if (followedTo) reportFollow(followedTo.day);
  }, [followedTo]);
  const now = sheetPlayhead(logs, playhead);

  // Follow the replay to its day when the day changes or play (re)starts, never in between, so a day
  // the user picks stays put. A stop selected before that no longer pins its day, until a new selection.
  const nowDay = now?.index ?? -1;
  const nowPlaying = Boolean(playhead?.playing);
  const [followed, setFollowed] = useState({ day: -1, playing: false });
  const [overriddenStopId, setOverriddenStopId] = useState<string | null>(null);
  if (nowDay !== followed.day || nowPlaying !== followed.playing) {
    setFollowed({ day: nowDay, playing: nowPlaying });
    if (nowDay !== -1 && (nowDay !== followed.day || (nowPlaying && !followed.playing))) {
      setOwnDay(nowDay);
      if (onActiveDayChange && nowDay !== activeDay) setFollowedTo({ day: nowDay });
      setOverriddenStopId(selectedStopId);
    }
  }
  if (overriddenStopId !== null && overriddenStopId !== selectedStopId) setOverriddenStopId(null);

  const selectedStop = trip.stops.find((stop) => stop.id === selectedStopId);
  const pinnedBySelection = selectedStop && selectedStopId !== overriddenStopId;
  const visibleDay = pinnedBySelection ? dayIndexForStop(logs, selectedStop) : activeDay;
  const tabsId = useId();
  // Per trip, not per frame: the sheets are memoised, so they must get the same props while the replay runs.
  const milesPerDay = useMemo(
    () =>
      dailyMiles(
        trip.daily_logs.map((log) => log.miles_today),
        trip.summary.total_miles,
      ),
    [trip],
  );
  const bracketStopIds = useMemo(
    () =>
      trip.daily_logs.map((log) =>
        log.brackets.map((bracket) => stopForBracket(trip.stops, log.date, bracket)?.id ?? null),
      ),
    [trip],
  );
  const dayTabs = logs.map((log) => ({ id: log.date, label: `Day ${log.day_number} · ${shortDate(log.date)}` }));

  function chooseDay(date: string) {
    const day = Math.max(0, logs.findIndex((log) => log.date === date));
    setShowAll(false);
    setOwnDay(day);
    onActiveDayChange?.(day);
    if (selectedStop) onSelectStop(null);
  }

  const pill = (active: boolean) =>
    clsx("rounded-full px-3 py-1.5 text-xs font-semibold", active ? "bg-brand text-white" : "bg-[#e3eeee] text-text");

  return (
    <section aria-labelledby={DAILY_LOGS_ID} data-tour="daily-logs" className="px-4 pb-10 pt-6 print:p-0">
      <div className="mx-auto flex max-w-[1000px] flex-wrap items-center gap-2 print:hidden">
        <h2 id={DAILY_LOGS_ID} tabIndex={-1} className="mr-2 scroll-mt-4 rounded-sm text-base font-extrabold">
          Daily logs
        </h2>
        <Tabs
          idBase={tabsId}
          label="Log days"
          items={dayTabs}
          selected={showAll ? null : (logs[visibleDay]?.date ?? null)}
          onSelect={chooseDay}
          className="flex flex-wrap gap-2"
          tabClassName={pill}
        />
        <button type="button" aria-pressed={showAll} onClick={() => setShowAll(true)} className={pill(showAll)}>
          Show all
        </button>
        <button
          type="button"
          data-tour="print"
          onClick={() => window.print()}
          className="ml-auto rounded-full bg-coral-ink px-4 py-1.5 text-xs font-bold text-white"
        >
          <span aria-hidden="true">⎙</span> Print / PDF all
        </button>
      </div>

      <div className="mt-4 space-y-8 print:mt-0 print:space-y-0">
        {logs.map((log, index) => (
          <TabPanel
            key={log.date}
            idBase={tabsId}
            id={log.date}
            // Hidden days stay in the DOM (class, not the hidden attribute) so printing gets every day.
            className={clsx(
              "overflow-x-auto pb-2 print:overflow-visible print:pb-0",
              index < logs.length - 1 && "print:break-after-page",
              !showAll && index !== visibleDay && "hidden print:block",
            )}
          >
            <LogSheet
              log={log}
              milesToday={milesPerDay[index]}
              bracketStopIds={bracketStopIds[index]}
              selectedStopId={selectedStopId}
              onSelectStop={onSelectStop}
              nowMinute={now?.index === index ? now.minute : null}
            />
          </TabPanel>
        ))}
      </div>
    </section>
  );
}

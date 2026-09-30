"use client";

import clsx from "clsx";
import { useState } from "react";
import type { Trip } from "@/lib/api/types";
import { shortDate } from "@/lib/format";
import { LogSheet } from "./LogSheet";
import { dayIndexForStop, stopForBracket } from "./linking";

export interface LogSheetsProps {
  trip: Trip;
  selectedStopId: string | null;
  onSelectStop: (stopId: string | null) => void;
}

/** Day tabs over the paper sheets. Every sheet stays in the DOM so "Print / PDF" gets all days. */
export function LogSheets({ trip, selectedStopId, onSelectStop }: LogSheetsProps) {
  const logs = trip.daily_logs;
  const [activeDay, setActiveDay] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const selectedStop = trip.stops.find((stop) => stop.id === selectedStopId);
  const visibleDay = selectedStop ? dayIndexForStop(logs, selectedStop) : activeDay;

  function chooseDay(index: number) {
    setShowAll(false);
    setActiveDay(index);
    if (selectedStop) onSelectStop(null);
  }

  return (
    <section aria-labelledby="daily-logs-heading" className="px-4 pb-10 pt-6 print:p-0">
      <div className="mx-auto flex max-w-[1000px] flex-wrap items-center gap-2 print:hidden">
        <h2 id="daily-logs-heading" className="mr-2 text-base font-extrabold">
          Daily logs
        </h2>
        <div role="tablist" aria-label="Log days" className="flex flex-wrap gap-2">
          {logs.map((log, index) => (
            <button
              key={log.date}
              type="button"
              role="tab"
              aria-selected={!showAll && index === visibleDay}
              onClick={() => chooseDay(index)}
              className={clsx(
                "rounded-full px-3 py-1.5 text-xs font-semibold",
                !showAll && index === visibleDay ? "bg-brand text-white" : "bg-[#e3eeee] text-text",
              )}
            >
              {`Day ${log.day_number} · ${shortDate(log.date)}`}
            </button>
          ))}
          <button
            type="button"
            role="tab"
            aria-selected={showAll}
            onClick={() => setShowAll(true)}
            className={clsx(
              "rounded-full px-3 py-1.5 text-xs font-semibold",
              showAll ? "bg-brand text-white" : "bg-[#e3eeee] text-text",
            )}
          >
            Show all
          </button>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="ml-auto rounded-full bg-coral px-4 py-1.5 text-xs font-bold text-white"
        >
          ⎙ Print / PDF all
        </button>
      </div>

      <div className="mt-4 space-y-8 print:mt-0 print:space-y-0">
        {logs.map((log, index) => (
          <div
            key={log.date}
            className={clsx(
              "overflow-x-auto pb-2 print:overflow-visible print:pb-0",
              index < logs.length - 1 && "print:break-after-page",
              !showAll && index !== visibleDay && "hidden print:block",
            )}
          >
            <LogSheet
              log={log}
              bracketStopIds={log.brackets.map((bracket) => stopForBracket(trip.stops, log.date, bracket)?.id ?? null)}
              selectedStopId={selectedStopId}
              onSelectStop={onSelectStop}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

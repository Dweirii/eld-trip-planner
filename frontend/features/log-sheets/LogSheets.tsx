"use client";

import clsx from "clsx";
import { useId, useState } from "react";
import { TabPanel, Tabs } from "@/components/ui/Tabs";
import type { Trip } from "@/lib/api/types";
import { shortDate } from "@/lib/format";
import { LogSheet } from "./LogSheet";
import { dayIndexForStop, stopForBracket } from "./linking";
import { dailyMiles } from "./miles";

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
  const tabsId = useId();
  const milesPerDay = dailyMiles(
    logs.map((log) => log.miles_today),
    trip.summary.total_miles,
  );
  const dayTabs = logs.map((log) => ({ id: log.date, label: `Day ${log.day_number} · ${shortDate(log.date)}` }));

  function chooseDay(date: string) {
    setShowAll(false);
    setActiveDay(Math.max(0, logs.findIndex((log) => log.date === date)));
    if (selectedStop) onSelectStop(null);
  }

  const pill = (active: boolean) =>
    clsx("rounded-full px-3 py-1.5 text-xs font-semibold", active ? "bg-brand text-white" : "bg-[#e3eeee] text-text");

  return (
    <section aria-labelledby="daily-logs-heading" className="px-4 pb-10 pt-6 print:p-0">
      <div className="mx-auto flex max-w-[1000px] flex-wrap items-center gap-2 print:hidden">
        <h2 id="daily-logs-heading" className="mr-2 text-base font-extrabold">
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
              bracketStopIds={log.brackets.map((bracket) => stopForBracket(trip.stops, log.date, bracket)?.id ?? null)}
              selectedStopId={selectedStopId}
              onSelectStop={onSelectStop}
            />
          </TabPanel>
        ))}
      </div>
    </section>
  );
}

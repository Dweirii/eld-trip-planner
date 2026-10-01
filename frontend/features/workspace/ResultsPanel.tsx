"use client";

import clsx from "clsx";
import { type Ref, memo, useId, useState } from "react";
import { type TabItem, TabPanel, Tabs } from "@/components/ui/Tabs";
import { Assumptions } from "@/features/compliance/Assumptions";
import { RuleChecks } from "@/features/compliance/RuleChecks";
import { Directions } from "@/features/directions/Directions";
import { Itinerary } from "@/features/itinerary/Itinerary";
import { showDailyLogs } from "@/features/log-sheets/LogSheets";
import type { Trip } from "@/lib/api/types";
import { cityOf, clockTime, duration, isoDate, logHours, miles, minutesBetween, shortDate } from "@/lib/format";

export type ResultsTab = "itinerary" | "directions" | "rules" | "assumptions";

export interface ResultsPanelProps {
  trip: Trip;
  selectedStopId: string | null;
  onSelectStop: (id: string) => void;
  onEdit: () => void;
  onNewTrip: () => void;
  /** Focused by the workspace when the panel switches to these results. */
  headingRef?: Ref<HTMLHeadingElement>;
  /** Trip replay, for the itinerary: the stop the driver is at, or the one the truck is driving to. */
  currentStopId?: string | null;
  drivingToStopId?: string | null;
  /** Keep the itinerary's current row in view (while the replay plays). */
  followCurrent?: boolean;
  /** The tab shown. Pass it to control the tab (the guided tour does); leave it out and the panel keeps its own. */
  tab?: ResultsTab;
  /** Called with the tab the user picks. */
  onTabChange?: (tab: ResultsTab) => void;
}

/** Memoised: a replay re-renders the workspace every frame, but the panel only when the current stop changes. */
export const ResultsPanel = memo(function ResultsPanel({
  trip,
  selectedStopId,
  onSelectStop,
  onEdit,
  onNewTrip,
  headingRef,
  currentStopId = null,
  drivingToStopId = null,
  followCurrent = false,
  tab: controlledTab,
  onTabChange,
}: ResultsPanelProps) {
  const [ownTab, setOwnTab] = useState<ResultsTab>("itinerary");
  const tab = controlledTab ?? ownTab;
  const selectTab = (next: ResultsTab) => {
    setOwnTab(next);
    onTabChange?.(next);
  };
  const tabsId = useId();
  const { inputs, summary } = trip;
  const passed = trip.compliance.filter((check) => check.passed).length;
  const title = [inputs.current_location, inputs.pickup_location, inputs.dropoff_location]
    .map((place) => cityOf(place.label))
    .join(" → ");
  const allPassed = passed === trip.compliance.length;
  const tabs: TabItem<ResultsTab>[] = [
    { id: "itinerary", label: "Itinerary" },
    { id: "directions", label: "Directions" },
    {
      id: "rules",
      label: (
        <>
          {`Rules ${passed}/${trip.compliance.length}`} <span aria-hidden="true">{allPassed ? "✓" : "✕"}</span>
        </>
      ),
    },
    { id: "assumptions", label: "Assumptions" },
  ];

  return (
    <div className="flex flex-col gap-3" data-tour="results">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          {/* Focused when these results appear: a highlight inside its own box, clear of the line below. */}
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="-mx-1.5 rounded-md px-1.5 text-[14px] font-extrabold leading-snug focus-visible:bg-[#e6f3f3] focus-visible:shadow-[inset_3px_0_0_var(--color-teal)] focus-visible:outline-hidden"
          >
            {title}
          </h2>
          <p className="text-[11px] text-muted">
            {`Cycle used ${logHours(inputs.current_cycle_used_hours)} h · starts ${shortDate(isoDate(summary.starts_at))}, ${clockTime(summary.starts_at)} ${trip.home_time_zone.abbreviation}`}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-full border-[1.5px] border-brand px-2.5 py-1 text-[11px] font-bold text-brand"
          >
            <span aria-hidden="true">✎</span> Edit trip
          </button>
          <button type="button" onClick={onNewTrip} className="text-[11px] font-semibold text-muted hover:text-brand">
            New trip
          </button>
        </div>
      </div>

      <dl data-tour="stats" className="grid grid-cols-3 gap-1.5 rounded-xl bg-[#f3f8f8] p-2.5">
        <Stat label="miles" value={miles(summary.total_miles)} />
        <Stat label="log days" value={String(summary.days)} />
        <Stat label="door to door" value={duration(minutesBetween(summary.starts_at, summary.arrives_at))} />
      </dl>

      <button
        type="button"
        onClick={showDailyLogs}
        className="-mt-1 flex items-center justify-between rounded-xl border-[1.5px] border-[#cfe3e3] px-3 py-1.5 text-[12px] font-bold text-brand transition hover:bg-surface"
      >
        Daily logs
        <span aria-hidden="true" className="text-teal">
          ↓
        </span>
      </button>

      <Tabs
        idBase={tabsId}
        label="Trip details"
        items={tabs}
        selected={tab}
        onSelect={selectTab}
        className="flex gap-0.5 rounded-full bg-[#eef4f4] p-1"
        // Four tabs share a ~300px panel: size each to its label and keep it on one line.
        tabClassName={(selected) =>
          clsx(
            "flex-auto whitespace-nowrap rounded-full px-1.5 py-1.5 text-[11px] font-bold",
            selected ? "bg-white text-text shadow-[0_1px_4px_rgb(4_59_75/0.12)]" : "text-[#4b6770]",
          )
        }
      />

      <TabPanel idBase={tabsId} id="itinerary" hidden={tab !== "itinerary"}>
        <Itinerary
          stops={trip.stops}
          selectedStopId={selectedStopId}
          onSelectStop={onSelectStop}
          currentStopId={currentStopId}
          drivingToStopId={drivingToStopId}
          followCurrent={followCurrent}
        />
      </TabPanel>
      <TabPanel idBase={tabsId} id="directions" hidden={tab !== "directions"}>
        <Directions legs={trip.route.legs} />
      </TabPanel>
      <TabPanel idBase={tabsId} id="rules" hidden={tab !== "rules"}>
        <RuleChecks checks={trip.compliance} />
      </TabPanel>
      <TabPanel idBase={tabsId} id="assumptions" hidden={tab !== "assumptions"}>
        <Assumptions assumptions={trip.assumptions} />
      </TabPanel>
    </div>
  );
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col-reverse gap-1">
      <dt className="text-[9.5px] uppercase tracking-[0.07em] text-muted">{label}</dt>
      <dd className="text-[19px] font-extrabold leading-none">{value}</dd>
    </div>
  );
}

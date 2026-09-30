"use client";

import clsx from "clsx";
import { useState } from "react";
import { Assumptions } from "@/features/compliance/Assumptions";
import { RuleChecks } from "@/features/compliance/RuleChecks";
import { Itinerary } from "@/features/itinerary/Itinerary";
import type { Trip } from "@/lib/api/types";
import { cityOf, clockTime, duration, isoDate, logHours, miles, minutesBetween, shortDate } from "@/lib/format";

type Tab = "itinerary" | "rules" | "assumptions";

export interface ResultsPanelProps {
  trip: Trip;
  selectedStopId: string | null;
  onSelectStop: (id: string) => void;
  onEdit: () => void;
  onNewTrip: () => void;
}

export function ResultsPanel({ trip, selectedStopId, onSelectStop, onEdit, onNewTrip }: ResultsPanelProps) {
  const [tab, setTab] = useState<Tab>("itinerary");
  const { inputs, summary } = trip;
  const passed = trip.compliance.filter((check) => check.passed).length;
  const title = [inputs.current_location, inputs.pickup_location, inputs.dropoff_location]
    .map((place) => cityOf(place.label))
    .join(" → ");
  const tabs: [Tab, string][] = [
    ["itinerary", "Itinerary"],
    ["rules", `Rules ${passed}/${trip.compliance.length} ${passed === trip.compliance.length ? "✓" : "✕"}`],
    ["assumptions", "Assumptions"],
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <h2 className="text-[14px] font-extrabold leading-snug">{title}</h2>
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
            ✎ Edit trip
          </button>
          <button type="button" onClick={onNewTrip} className="text-[11px] font-semibold text-muted hover:text-brand">
            New trip
          </button>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-1.5 rounded-xl bg-[#f3f8f8] p-2.5">
        <Stat label="miles" value={miles(summary.total_miles)} />
        <Stat label="log days" value={String(summary.days)} />
        <Stat label="door to door" value={duration(minutesBetween(summary.starts_at, summary.arrives_at))} />
      </dl>

      <div role="tablist" aria-label="Trip details" className="flex gap-1 rounded-full bg-[#eef4f4] p-1">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={clsx(
              "flex-1 rounded-full px-2 py-1.5 text-[11.5px] font-bold",
              tab === id ? "bg-white text-text shadow-[0_1px_4px_rgb(4_59_75/0.12)]" : "text-[#4b6770]",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={tabs.find(([id]) => id === tab)?.[1]}>
        {tab === "itinerary" && (
          <Itinerary stops={trip.stops} selectedStopId={selectedStopId} onSelectStop={onSelectStop} />
        )}
        {tab === "rules" && <RuleChecks checks={trip.compliance} />}
        {tab === "assumptions" && <Assumptions assumptions={trip.assumptions} />}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col-reverse gap-1">
      <dt className="text-[9.5px] uppercase tracking-[0.07em] text-muted">{label}</dt>
      <dd className="text-[19px] font-extrabold leading-none">{value}</dd>
    </div>
  );
}

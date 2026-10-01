"use client";

import { useId, useState } from "react";
import type { RouteLeg, RouteStep } from "@/lib/api/types";
import { cityOf, duration, miles, stepMiles } from "@/lib/format";

/** Steps shown before a long leg needs "Show all". */
const PREVIEW_STEPS = 8;

/** The road, unless the instruction already names that whole road ("I 55" doesn't name "I 5"). */
function roadNote(step: RouteStep): string | null {
  if (!step.road) return null;
  const escaped = step.road.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Lookarounds rather than \b, which misfires next to punctuation such as "(Local)".
  return new RegExp(`(?<!\\w)${escaped}(?!\\w)`, "i").test(step.instruction) ? null : step.road;
}

/** Turn-by-turn route instructions, one section per leg (served by the API from openrouteservice). */
export function Directions({ legs }: { legs: readonly RouteLeg[] }) {
  return (
    <div data-tour="directions" className="space-y-4 text-[12px]">
      {legs.map((leg, index) => (
        <LegDirections key={index} leg={leg} number={index + 1} />
      ))}
      <p className="text-[10.5px] leading-snug text-muted">
        Directions: openrouteservice.org (heavy-goods vehicle profile). Rest, break and fuel stops are in the Itinerary.
      </p>
    </div>
  );
}

function LegDirections({ leg, number }: { leg: RouteLeg; number: number }) {
  const [expanded, setExpanded] = useState(false);
  const headingId = useId();
  const listId = useId();
  // The schema requires steps, but a frontend deployed before the API can still get old responses without them.
  const steps = leg.steps ?? [];
  const shown = expanded ? steps : steps.slice(0, PREVIEW_STEPS);

  return (
    <div>
      <h3 id={headingId} className="text-[12px] font-extrabold leading-snug">
        {`Leg ${number} · ${leg.from} → ${leg.to}`}
      </h3>
      <p className="text-[11px] text-muted">{`${miles(leg.miles)} mi · ${duration(Math.round(leg.hours * 60))}`}</p>

      {steps.length === 0 ? (
        <p className="mt-1.5 text-[11.5px] text-muted">
          {leg.miles === 0
            ? "Already at the pickup, so there's nothing to drive."
            : "Turn-by-turn directions aren't available for this saved trip. Plan it again to get them."}
        </p>
      ) : (
        <ol
          id={listId}
          aria-labelledby={headingId}
          className="mt-1 list-decimal divide-y divide-dashed divide-line pl-5 marker:text-[10.5px] marker:text-muted"
        >
          {shown.map((step, index) => {
            const road = roadNote(step);
            return (
              <li key={index} className="py-1.5 pl-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span>
                    {step.instruction}
                    {road && <span className="block text-[11px] text-muted">{`on ${road}`}</span>}
                  </span>
                  {step.miles > 0 && (
                    <span className="shrink-0 tabular-nums text-muted">{`${stepMiles(step.miles)} mi`}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {steps.length > PREVIEW_STEPS && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((open) => !open)}
          className="mt-1 text-[11px] font-bold text-brand hover:text-teal"
        >
          {expanded ? "Show fewer steps" : `Show all ${steps.length} steps`}{" "}
          <span className="sr-only">{`to ${cityOf(leg.to)}`}</span>
        </button>
      )}
    </div>
  );
}

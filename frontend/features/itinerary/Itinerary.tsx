"use client";

import clsx from "clsx";
import { useEffect, useRef } from "react";
import { StopIcon } from "@/components/StopIcon";
import type { Stop } from "@/lib/api/types";
import { clockTime, duration, isoDate, miles, shortDate } from "@/lib/format";
import { STATUS_NAMES, STOP_STYLE } from "@/lib/stops";

/** Stops grouped by the (home-terminal) date they start, in order. */
export function groupByDate(stops: readonly Stop[]): [string, Stop[]][] {
  const days = new Map<string, Stop[]>();
  for (const stop of stops) {
    const date = isoDate(stop.starts_at);
    days.set(date, [...(days.get(date) ?? []), stop]);
  }
  return [...days.entries()];
}

function details(stop: Stop): string {
  const parts = [STATUS_NAMES[stop.status]];
  if (stop.duration_minutes > 0) parts.push(duration(stop.duration_minutes));
  parts.push(`mile ${miles(stop.mile)}`);
  return parts.join(" · ");
}

/** Room kept above and below a row scrolled into view. */
const SCROLL_MARGIN = 8;

function scrollingAncestor(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

/**
 * Like scrollIntoView({ block: "nearest" }), but only scrolls the panel the row is in, never the page:
 * someone reading the daily logs below while the replay plays must not be pulled back up.
 */
function keepInPanel(row: HTMLElement) {
  if (row.closest("[hidden]")) return; // another tab is open
  const panel = scrollingAncestor(row);
  if (!panel) return;
  const box = panel.getBoundingClientRect();
  const rect = row.getBoundingClientRect();
  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  if (rect.top < box.top + SCROLL_MARGIN) {
    panel.scrollBy({ top: rect.top - box.top - SCROLL_MARGIN, behavior });
  } else if (rect.bottom > box.bottom - SCROLL_MARGIN) {
    panel.scrollBy({ top: rect.bottom - box.bottom + SCROLL_MARGIN, behavior });
  }
}

export interface ItineraryProps {
  stops: readonly Stop[];
  selectedStopId: string | null;
  onSelectStop: (id: string) => void;
  /** Trip replay: the stop the driver is at… */
  currentStopId?: string | null;
  /** …or the one the truck is driving to. */
  drivingToStopId?: string | null;
  /** Keep that row in view (while the replay plays). */
  followCurrent?: boolean;
}

export function Itinerary({
  stops,
  selectedStopId,
  onSelectStop,
  currentStopId = null,
  drivingToStopId = null,
  followCurrent = false,
}: ItineraryProps) {
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!followCurrent) return;
    const row = listRef.current?.querySelector<HTMLElement>("[data-now]");
    if (row) keepInPanel(row);
  }, [followCurrent, currentStopId, drivingToStopId]);

  return (
    <ol ref={listRef} aria-label="Itinerary" className="space-y-3">
      {groupByDate(stops).map(([date, dayStops]) => (
        <li key={date}>
          <h3 className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-muted">{shortDate(date)}</h3>
          <ul className="mt-1 space-y-0.5">
            {dayStops.map((stop) => {
              const selected = stop.id === selectedStopId;
              const now = stop.id === currentStopId;
              const style = STOP_STYLE[stop.kind];
              return (
                <li key={stop.id}>
                  {stop.id === drivingToStopId && <DrivingTo place={stop.place} />}
                  <button
                    type="button"
                    aria-pressed={selected}
                    data-now={now || undefined}
                    onClick={() => onSelectStop(stop.id)}
                    className={clsx(
                      "relative grid w-full grid-cols-[40px_14px_1fr] items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition",
                      selected ? "bg-[#e6f3f3]" : now ? "bg-[#fff4f5]" : "hover:bg-surface",
                      // "Now" (replay) is a coral accent; selection keeps its teal one.
                      now
                        ? "pr-14 shadow-[inset_3px_0_0_var(--color-coral-ink)]"
                        : selected && "shadow-[inset_3px_0_0_var(--color-teal)]",
                    )}
                  >
                    <span className="tabular-nums text-muted">{clockTime(stop.starts_at)}</span>
                    <StopIcon kind={stop.kind} className="mt-px" />
                    <span>
                      <b>{style.label}</b> · {stop.place}
                      <span className="block text-[11px] text-muted">{details(stop)}</span>
                    </span>
                    {now && <NowBadge />}
                  </button>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/** A small coral "Now" pill with a live dot (still under reduced motion). */
function NowBadge() {
  return (
    <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-coral-ink px-1.5 py-0.5 text-[9px] font-extrabold uppercase leading-none tracking-[0.08em] text-white">
      <span aria-hidden="true" className="relative flex size-1.5">
        <span className="absolute inset-0 animate-ping rounded-full bg-white/80 motion-reduce:hidden" />
        <span className="relative size-1.5 rounded-full bg-white" />
      </span>
      Now
    </span>
  );
}

/** Between two rows while the replay drives: where the truck is heading. */
function DrivingTo({ place }: { place: string }) {
  return (
    <p
      data-now
      className="relative mb-0.5 grid grid-cols-[40px_14px_1fr] items-center gap-2 rounded-lg bg-[#fff4f5] py-1.5 pl-2 pr-14 text-[11.5px] font-semibold text-text shadow-[inset_3px_0_0_var(--color-coral-ink)]"
    >
      <span aria-hidden="true" className="col-start-2 flex justify-center">
        <span className="size-2 rounded-full bg-teal ring-[3px] ring-teal/20" />
      </span>
      <span>{`Driving to ${place}…`}</span>
      <NowBadge />
    </p>
  );
}

import clsx from "clsx";
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

export interface ItineraryProps {
  stops: readonly Stop[];
  selectedStopId: string | null;
  onSelectStop: (id: string) => void;
}

export function Itinerary({ stops, selectedStopId, onSelectStop }: ItineraryProps) {
  return (
    <ol aria-label="Itinerary" className="space-y-3">
      {groupByDate(stops).map(([date, dayStops]) => (
        <li key={date}>
          <h3 className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-muted">{shortDate(date)}</h3>
          <ul className="mt-1 space-y-0.5">
            {dayStops.map((stop) => {
              const selected = stop.id === selectedStopId;
              const style = STOP_STYLE[stop.kind];
              return (
                <li key={stop.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelectStop(stop.id)}
                    className={clsx(
                      "grid w-full grid-cols-[40px_12px_1fr] items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition",
                      selected ? "bg-[#e6f3f3] shadow-[inset_3px_0_0_var(--color-teal)]" : "hover:bg-surface",
                    )}
                  >
                    <span className="tabular-nums text-muted">{clockTime(stop.starts_at)}</span>
                    <span
                      aria-hidden="true"
                      className={clsx(
                        "mt-0.5 h-3 w-3 border-2 border-white shadow-[0_0_0_1px_#cfdede]",
                        style.shape === "square" || style.shape === "diamond" ? "rounded-[3px]" : "rounded-full",
                        style.shape === "diamond" && "rotate-45",
                      )}
                      style={{ background: style.shape === "ring" ? "#fff" : style.color }}
                    />
                    <span>
                      <b>{style.label}</b> · {stop.place}
                      <span className="block text-[11px] text-muted">{details(stop)}</span>
                    </span>
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

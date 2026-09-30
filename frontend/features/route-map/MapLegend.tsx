import { StopIcon } from "@/components/StopIcon";
import type { StopKind } from "@/lib/api/types";
import { STOP_STYLE } from "@/lib/stops";

const KINDS: StopKind[] = ["start", "pickup", "dropoff", "fuel", "break", "rest", "restart"];

function LegendList() {
  return (
    <ul aria-label="Map legend" className="grid gap-1">
      {KINDS.map((kind) => (
        <li key={kind} className="flex items-center gap-2">
          <StopIcon kind={kind} />
          {STOP_STYLE[kind].label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Desktop: always shown, bottom right (clear of the credits). Small screens: a "Legend" disclosure
 * top right, clear of the credits (top left) and the bottom sheet.
 */
export function MapLegend() {
  return (
    <>
      <div className="pointer-events-none absolute bottom-9 right-3 hidden rounded-xl bg-white/95 p-2.5 text-[10.5px] text-text shadow-md lg:block">
        <LegendList />
      </div>
      <details className="group absolute right-3 top-3 rounded-xl bg-white/95 text-[11px] text-text shadow-md lg:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-xl px-3 py-1.5 font-bold [&::-webkit-details-marker]:hidden">
          Legend
          <span aria-hidden="true" className="text-muted transition group-open:rotate-180 motion-reduce:transition-none">
            ▾
          </span>
        </summary>
        <div className="px-3 pb-2.5">
          <LegendList />
        </div>
      </details>
    </>
  );
}

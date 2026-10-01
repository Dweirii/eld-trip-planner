"use client";

import clsx from "clsx";
import { useId, useState } from "react";
import { StopIcon } from "@/components/StopIcon";
import type { StopKind } from "@/lib/api/types";
import { STOP_STYLE } from "@/lib/stops";

const KINDS: StopKind[] = ["start", "pickup", "dropoff", "fuel", "break", "rest", "restart"];

function LegendList({ id }: { id?: string }) {
  return (
    <ul id={id} aria-label="Map legend" className="grid gap-1">
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
 * Desktop: always shown, bottom right, above the map credits. Small screens: a "Legend" button on the
 * right, just above the bottom sheet's tallest extent, clear of the credits (top left, shown expanded
 * until the map is first moved) and of the sheet; the list opens upwards. While a trip replays, the
 * playback bar takes that spot on small screens, so the button is `raised` above it.
 */
export function MapLegend({ raised = false }: { raised?: boolean }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <>
      <div className="pointer-events-none absolute bottom-9 right-3 hidden rounded-xl bg-white/95 p-2.5 text-[10.5px] text-text shadow-md lg:block">
        <LegendList />
      </div>
      <div
        className={clsx(
          "absolute right-3 text-[11px] text-text lg:hidden",
          raised ? "bottom-[calc(60%+0.75rem+6.75rem)]" : "bottom-[calc(60%+0.75rem)]",
        )}
      >
        <div hidden={!open} className="absolute bottom-full right-0 mb-2 w-max rounded-xl bg-white/95 p-2.5 shadow-md">
          <LegendList id={listId} />
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((value) => !value)}
          className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 font-bold shadow-md"
        >
          Legend
          <span aria-hidden="true" className="text-muted">
            {open ? "▾" : "▴"}
          </span>
        </button>
      </div>
    </>
  );
}

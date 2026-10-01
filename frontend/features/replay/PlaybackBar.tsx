"use client";

import clsx from "clsx";
import { memo, useEffect, useRef } from "react";
import { StopIcon } from "@/components/StopIcon";
import type { DutyStatus } from "@/lib/api/types";
import { STATUS_NAMES } from "@/lib/stops";
import type { DayMark, StopMark } from "./timeline";
import type { Speed } from "./usePlayback";
import type { TripReplay } from "./useTripReplay";

/** The scrubber moves in the paper log's quarter hours. */
const SCRUB_STEP = 15;

/** Status chip colours; white text passes WCAG AA on each. */
const STATUS_CHIP: Record<DutyStatus, string> = {
  driving: "bg-teal",
  off_duty: "bg-muted",
  sleeper_berth: "bg-brand",
  on_duty: "bg-coral-ink",
};

const SPEED_LABELS: Record<Speed, string> = { 0.5: "½×", 1: "1×", 2: "2×" };

/**
 * Plays the trip back over the map. A compact "Play trip" button until first used, then a card with
 * play/pause, the home-terminal clock and duty status, a scrubber, the speed and close.
 * Desktop: bottom centre of the map, right of the panel, above the credits and clear of the legend.
 * Small screens: just above the bottom sheet.
 */
export function PlaybackBar({ replay }: { replay: TripReplay }) {
  const { active, playing, t, total, state, speed } = replay;
  const playRef = useRef<HTMLButtonElement>(null);
  const finished = active && !playing && t >= total;

  function close() {
    replay.reset();
    playRef.current?.focus();
  }

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-[calc(60%+0.75rem)] z-10 flex lg:bottom-12 lg:left-[372px] lg:right-[140px] lg:justify-center">
      <div
        role="group"
        aria-label="Trip replay"
        className={clsx(
          "pointer-events-auto bg-white text-text shadow-[0_8px_30px_rgb(4_59_75/0.18)]",
          active
            ? "animate-bar-in grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-2xl px-3 pb-1.5 pt-2.5 lg:max-w-[600px]"
            : "rounded-full",
        )}
      >
        {/* One button throughout, so focus stays on it when the card expands. */}
        <button
          ref={playRef}
          type="button"
          aria-label={playing ? "Pause trip" : "Play trip"}
          onClick={playing ? replay.pause : replay.play}
          className={clsx(
            "group flex items-center rounded-full font-bold text-brand transition",
            active ? "self-center lg:row-span-2" : "gap-2 py-1.5 pl-1.5 pr-4 text-[12.5px] hover:bg-surface",
          )}
        >
          <span
            className={clsx(
              "grid place-items-center rounded-full bg-brand text-white transition group-hover:bg-[#0a4f63] group-active:scale-95",
              active ? "size-10" : "size-7",
            )}
          >
            {playing ? <PauseIcon /> : finished ? <ReplayIcon /> : <PlayIcon />}
          </span>
          {!active && "Play trip"}
        </button>

        {active && (
          <>
            <div className="flex min-w-0 flex-col items-start gap-1 lg:flex-row lg:items-center lg:gap-2.5">
              <p className="whitespace-nowrap text-[12.5px] font-bold leading-tight tabular-nums">
                {`${replay.clock.dateLabel} · ${replay.clock.time} ${replay.zone}`}
              </p>
              <p
                title={`${STATUS_NAMES[state.status]} · ${replay.detail}`}
                className={clsx(
                  "flex max-w-full items-center gap-1.5 rounded-full px-2 py-[3px] text-[11px] font-bold leading-tight text-white transition-colors duration-300",
                  STATUS_CHIP[state.status],
                )}
              >
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-white/85" />
                <span className="truncate tabular-nums">{`${STATUS_NAMES[state.status]} · ${replay.detail}`}</span>
              </p>
            </div>

            <div className="flex items-center gap-1 self-start lg:self-center">
              <button
                type="button"
                onClick={replay.cycleSpeed}
                aria-label={`Playback speed ${SPEED_LABELS[speed]}`}
                // Plex Mono draws a proper "×" (Plus Jakarta's reads like a subscript x).
                className="h-7 min-w-11 rounded-full border-[1.5px] border-line px-2 font-mono text-[11px] font-semibold text-brand transition hover:border-teal hover:bg-surface"
              >
                {SPEED_LABELS[speed]}
              </button>
              <button
                type="button"
                onClick={close}
                aria-label="Close trip replay"
                className="grid size-7 place-items-center rounded-full text-muted transition hover:bg-surface hover:text-brand"
              >
                <CloseIcon />
              </button>
            </div>

            <Scrubber replay={replay} />
          </>
        )}
      </div>
      {/* Mounted from the start so screen readers announce changes: each stretch while playing, then the arrival. */}
      <p aria-live="polite" className="sr-only">
        {playing ? replay.announcement : replay.ended ? replay.arrival : ""}
      </p>
    </div>
  );
}

function Scrubber({ replay }: { replay: TripReplay }) {
  const { t, total, playing } = replay;
  const fraction = total > 0 ? Math.min(Math.max(t / total, 0), 1) : 0;
  const dragged = useRef(t);
  const drag = useRef<AbortController | null>(null);
  // A drag still under way when the bar goes away (Close, Edit trip) leaves no listeners behind.
  useEffect(() => () => drag.current?.abort(), []);

  // Dragging pauses playback and picks it up again on release, like a video player (unless dropped at the end).
  function holdWhileDragging() {
    if (!playing) return;
    replay.pause();
    dragged.current = t;
    drag.current?.abort();
    const controller = new AbortController();
    drag.current = controller;
    const release = () => {
      controller.abort();
      if (dragged.current < total) replay.play();
    };
    window.addEventListener("pointerup", release, { signal: controller.signal });
    window.addEventListener("pointercancel", release, { signal: controller.signal });
  }

  return (
    <div className="relative col-span-3 h-[30px] lg:col-span-2 lg:col-start-2">
      <input
        type="range"
        aria-label="Trip time"
        aria-valuetext={replay.valueText}
        min={0}
        max={total}
        step={SCRUB_STEP}
        value={t}
        onChange={(event) => {
          dragged.current = Number(event.target.value);
          replay.seek(dragged.current);
        }}
        onPointerDown={holdWhileDragging}
        // The whole 30px strip, track and marks, is the touch target (WCAG 2.2: at least 24px).
        className="scrubber-input peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0"
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-2 top-[7px] h-1.5 rounded-full bg-[#e3eeee]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-teal" style={{ width: `${fraction * 100}%` }} />
      </div>
      <Marks days={replay.days} stops={replay.stops} total={total} />
      <div
        aria-hidden="true"
        className={clsx(
          "pointer-events-none absolute top-[2px] size-4 -translate-x-1/2 rounded-full border-[3px] border-brand bg-white",
          "shadow-[0_1px_4px_rgb(4_59_75/0.35)] transition-[scale] duration-150 peer-hover:scale-115 peer-active:scale-115",
          // The input itself is invisible, so its keyboard focus ring is drawn on this thumb.
          "peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-solid peer-focus-visible:outline-teal",
        )}
        style={{ left: `calc(8px + (100% - 16px) * ${fraction})` }}
      />
    </div>
  );
}

/** Day labels closer than this (a share of the track) would overprint; only the first is written. */
const MIN_LABEL_GAP = 0.1;

function withLabels(days: readonly DayMark[], total: number) {
  let last = Number.NEGATIVE_INFINITY;
  return days.map((day) => {
    const at = day.t / total;
    const labelled = at - last >= MIN_LABEL_GAP;
    if (labelled) last = at;
    return { ...day, at, labelled };
  });
}

/** Decorative: midnight ticks with day labels under the track, and each stop's icon on it. Per trip, not per frame. */
const Marks = memo(function Marks({
  days,
  stops,
  total,
}: {
  days: readonly DayMark[];
  stops: readonly StopMark[];
  total: number;
}) {
  if (total <= 0) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-2 top-0 h-full">
      {stops.map((stop) => (
        <span
          key={stop.id}
          className="absolute top-[10px] -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${(stop.t / total) * 100}%` }}
        >
          <StopIcon kind={stop.kind} size={11} className="block" />
        </span>
      ))}
      {withLabels(days, total).map((day) => (
        <span key={day.t} className="absolute top-[16px] h-[14px]" style={{ left: `${day.at * 100}%` }}>
          {day.t > 0 && <span className="absolute left-0 top-0 h-[5px] w-px bg-[#9fb9b9]" />}
          {day.labelled && (
            <span
              className={clsx(
                "absolute top-[3px] whitespace-nowrap text-[10.5px] font-semibold leading-none text-muted",
                day.at > 0.94 ? "right-0 pr-[3px]" : day.t > 0 ? "left-0 pl-[3px]" : "left-0",
              )}
            >
              {day.label}
            </span>
          )}
        </span>
      ))}
    </div>
  );
});

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false" className="translate-x-px">
      <path
        d="M4.5 2.9v10.2a.8.8 0 0 0 1.22.68l8.1-5.1a.8.8 0 0 0 0-1.36l-8.1-5.1A.8.8 0 0 0 4.5 2.9z"
        fill="currentColor"
      />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <rect x="3.5" y="2.5" width="3.2" height="11" rx="1.1" fill="currentColor" />
      <rect x="9.3" y="2.5" width="3.2" height="11" rx="1.1" fill="currentColor" />
    </svg>
  );
}

function ReplayIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.2 8a4.8 4.8 0 1 0 1.5-3.5" />
        <path d="M2.6 2.4v3.4H6" />
      </g>
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

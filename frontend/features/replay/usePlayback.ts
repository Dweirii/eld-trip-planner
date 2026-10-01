"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** At 1× the whole trip plays in this long, however many days it spans. */
export const TRIP_PLAY_MS = 24_000;
export const SPEEDS = [0.5, 1, 2] as const;
export type Speed = (typeof SPEEDS)[number];
/** Reduced motion: one stop per tick instead of a continuous drive. */
export const STEP_MS = 1_000;
/** A frame later than this (a background tab, a debugger) counts as this long, so the truck never leaps. */
const MAX_FRAME_MS = 100;

export interface PlaybackOptions {
  /** Length of the trip, in minutes. */
  total: number;
  /** Minutes to stop at, in order, when the user prefers reduced motion (see `stopSteps`). */
  steps: readonly number[];
  /** Playback resets whenever this changes (the trip id). */
  resetKey?: unknown;
}

export interface Playback {
  /** Minutes from the start of the trip (fractional while playing). */
  t: number;
  playing: boolean;
  /** Played or scrubbed since the last reset: the replay is on screen. */
  active: boolean;
  speed: Speed;
  play: () => void;
  pause: () => void;
  seek: (t: number) => void;
  reset: () => void;
  cycleSpeed: () => void;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/** Play, pause and scrub a trip's clock with requestAnimationFrame (or stop to stop, under reduced motion). */
export function usePlayback({ total, steps, resetKey }: PlaybackOptions): Playback {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [active, setActive] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(1);
  const speed = SPEEDS[speedIndex];
  // The loop reads and writes the clock here, so consecutive frames never wait for a render.
  const clock = useRef(0);

  const commit = useCallback((next: number) => {
    clock.current = next;
    setT(next);
  }, []);

  // A new trip starts over (state adjusted while rendering; the clock ref follows in an effect).
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) {
    setKey(resetKey);
    setT(0);
    setPlaying(false);
    setActive(false);
  }
  useEffect(() => {
    clock.current = 0;
  }, [resetKey]);

  useEffect(() => {
    if (!playing) return;
    if (prefersReducedMotion()) {
      const id = window.setInterval(() => {
        const next = steps.find((step) => step > clock.current) ?? total;
        commit(Math.min(next, total));
        if (next >= total) setPlaying(false);
      }, STEP_MS);
      return () => window.clearInterval(id);
    }
    const perMs = (total / TRIP_PLAY_MS) * speed;
    let frame = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      if (last !== null) {
        const next = Math.min(total, clock.current + Math.min(now - last, MAX_FRAME_MS) * perMs);
        commit(next);
        if (next >= total) {
          setPlaying(false);
          return;
        }
      }
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, total, steps, commit]);

  const play = useCallback(() => {
    if (total <= 0) return;
    if (clock.current >= total) commit(0);
    setActive(true);
    setPlaying(true);
  }, [total, commit]);

  const pause = useCallback(() => setPlaying(false), []);

  const seek = useCallback(
    (next: number) => {
      commit(Math.min(Math.max(next, 0), total));
      setActive(true);
    },
    [total, commit],
  );

  const reset = useCallback(() => {
    commit(0);
    setPlaying(false);
    setActive(false);
  }, [commit]);

  const cycleSpeed = useCallback(() => setSpeedIndex((index) => (index + 1) % SPEEDS.length), []);

  return { t, playing, active, speed, play, pause, seek, reset, cycleSpeed };
}

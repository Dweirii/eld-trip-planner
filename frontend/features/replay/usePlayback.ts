"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/** At 1× the whole trip plays in this long, however many days it spans. */
export const TRIP_PLAY_MS = 24_000;
export const SPEEDS = [0.5, 1, 2] as const;
export type Speed = (typeof SPEEDS)[number];
/** Reduced motion: one stop per tick (at 1×) instead of a continuous drive. */
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
  /** Playback ran to the end of the trip (not just scrubbed there); cleared when the replay moves again. */
  ended: boolean;
  speed: Speed;
  play: () => void;
  pause: () => void;
  seek: (t: number) => void;
  reset: () => void;
  cycleSpeed: () => void;
  setSpeed: (speed: Speed) => void;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia?.(REDUCED_MOTION);
  query?.addEventListener?.("change", onChange);
  return () => query?.removeEventListener?.("change", onChange);
}

const prefersReducedMotion = () => Boolean(window.matchMedia?.(REDUCED_MOTION)?.matches);
const onServer = () => false;

/** Play, pause and scrub a trip's clock with requestAnimationFrame (or stop to stop, under reduced motion). */
export function usePlayback({ total, steps, resetKey }: PlaybackOptions): Playback {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [active, setActive] = useState(false);
  const [ended, setEnded] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(1);
  const speed = SPEEDS[speedIndex];
  // Followed live: switching the OS setting mid-replay swaps the animation for stop-to-stop steps.
  const reducedMotion = useSyncExternalStore(subscribeToReducedMotion, prefersReducedMotion, onServer);
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
    setEnded(false);
  }
  useEffect(() => {
    clock.current = 0;
  }, [resetKey]);

  useEffect(() => {
    if (!playing) return;
    const finish = () => {
      setPlaying(false);
      setEnded(true);
    };
    if (reducedMotion) {
      const id = window.setInterval(() => {
        const next = steps.find((step) => step > clock.current) ?? total;
        commit(Math.min(next, total));
        if (next >= total) finish();
      }, STEP_MS / speed);
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
          finish();
          return;
        }
      }
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, reducedMotion, speed, total, steps, commit]);

  const play = useCallback(() => {
    if (total <= 0) return;
    if (clock.current >= total) commit(0);
    setActive(true);
    setEnded(false);
    setPlaying(true);
  }, [total, commit]);

  const pause = useCallback(() => setPlaying(false), []);

  const seek = useCallback(
    (next: number) => {
      commit(Math.min(Math.max(next, 0), total));
      setActive(true);
      setEnded(false);
    },
    [total, commit],
  );

  const reset = useCallback(() => {
    commit(0);
    setPlaying(false);
    setActive(false);
    setEnded(false);
  }, [commit]);

  const cycleSpeed = useCallback(() => setSpeedIndex((index) => (index + 1) % SPEEDS.length), []);
  const setSpeed = useCallback((next: Speed) => setSpeedIndex(Math.max(0, SPEEDS.indexOf(next))), []);

  return { t, playing, active, ended, speed, play, pause, seek, reset, cycleSpeed, setSpeed };
}

"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { TourController } from "./controller";
import { type TourInviteStore, tourInvite } from "./invite";
import { type Narrator, createNarrator } from "./narrator";
import {
  IDLE_SNAPSHOT,
  type RunnerOptions,
  type Scheduler,
  type TourRunner,
  type TourStep,
  type TourTarget,
  createTourRunner,
} from "./runner";
import { TOUR_STEPS } from "./steps";

const CAPTIONS_KEY = "milepost:tour-captions";
const VOICE_KEY = "milepost:tour-voice";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
/** Marks the tour's own controls: clicks there are not the user taking over. */
export const TOUR_UI_ATTRIBUTE = "data-tour-ui";

const prefersReducedMotion = () => Boolean(window.matchMedia?.(REDUCED_MOTION)?.matches);

/** The test-only speed-up from `?tourSpeed=`, clamped to 1–20 (1 when absent or not a number). */
export function tourSpeed(param: string | null): number {
  const speed = param ? Number(param) : Number.NaN;
  return Number.isFinite(speed) ? Math.min(20, Math.max(1, speed)) : 1;
}

/** On, unless this browser remembers the setting off. */
function readSetting(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== "off";
  } catch {
    return true;
  }
}

function writeSetting(key: string, on: boolean) {
  try {
    window.localStorage.setItem(key, on ? "on" : "off");
  } catch {
    // Storage blocked (private mode, embedded): the choice lasts until the page closes.
  }
}

/** A setting that starts on and is remembered in this browser. */
function useSetting(key: string) {
  const [on, setOn] = useState(() => readSetting(key));
  const toggle = useCallback(() => {
    setOn((value) => !value);
  }, []);
  useEffect(() => {
    if (on !== readSetting(key)) writeSetting(key, on);
  }, [key, on]);
  return [on, toggle] as const;
}

/** Captions on or off; off shrinks the caption card to a slim control pill. Remembered in this browser. */
export function useTourCaptions() {
  const [captions, toggleCaptions] = useSetting(CAPTIONS_KEY);
  return { captions, toggleCaptions };
}

const notBlocked = () => false;

/**
 * The voice on or off: on when the tour starts, unless this browser remembers it off. `silent` (the
 * test-only speed-up) forces it off and leaves the remembered choice alone.
 */
export function useTourVoice(narrator: Narrator, silent = false) {
  const [wanted, toggle] = useSetting(VOICE_KEY);
  const blocked = useSyncExternalStore(narrator.subscribe, () => narrator.blocked, notBlocked);
  const voice = wanted && !silent;
  useEffect(() => {
    narrator.setEnabled(voice);
  }, [narrator, voice]);
  const toggleVoice = useCallback(() => {
    if (silent) return;
    // The browser wanted a click before it would play anything: this is that click, and the voice stays on.
    const unblocking = wanted && narrator.blocked;
    narrator.unblock();
    if (!unblocking) toggle();
  }, [narrator, silent, wanted, toggle]);
  return { voice, voiceBlocked: voice && blocked, toggleVoice };
}

/** One tour at a time: starting again replaces the run under way. */
function createSession() {
  let runner: TourRunner | null = null;
  let speed = 1;
  let unsubscribe = () => undefined as void;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  function stop() {
    unsubscribe();
    runner?.exit();
    runner = null;
    notify();
  }
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => runner?.getSnapshot() ?? IDLE_SNAPSHOT,
    get runner() {
      return runner;
    },
    /** The speed the tour under way was started at (the URL loses its params once it starts). */
    get speed() {
      return speed;
    },
    start(options: RunnerOptions<TourController>) {
      stop();
      speed = options.speed ?? 1;
      runner = createTourRunner(options);
      unsubscribe = runner.subscribe(notify);
      runner.start();
    },
    stop,
  };
}

/** Typing in a field: the tour leaves every key alone. */
function isTyping(target: Element): boolean {
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return !["button", "checkbox", "radio", "range", "submit", "reset", "color", "file", "image"].includes(target.type);
}

/** Arrow keys already mean something here (tabs, sliders, listboxes, the map). */
function usesArrows(target: Element): boolean {
  return Boolean(
    target.closest('[role="tab"], [role="tablist"], [role="slider"], [role="listbox"], input[type="range"], [data-tour="map"]'),
  );
}

/** Space presses these itself, so the tour leaves Space to them. */
const SPACE_PRESSES =
  'button, a[href], summary, select, [role="button"], [role="tab"], [role="option"], [role="slider"]';

const MODIFIERS = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta", "CapsLock", "Fn", "OS"]);

/** The key belongs to what has focus, not to the tour: typing, Space on a button, arrows on tabs. */
function leftToTarget(key: string, target: Element): boolean {
  if (isTyping(target)) return true;
  if (key === " ") return target.closest(SPACE_PRESSES) !== null;
  return key.startsWith("Arrow") && usesArrows(target);
}

export interface UseTourOptions {
  steps?: readonly TourStep<TourController>[];
  scheduler?: Scheduler;
  narrator?: Narrator;
  invite?: TourInviteStore;
}

export interface Tour {
  /** Running or paused. */
  active: boolean;
  paused: boolean;
  index: number;
  total: number;
  /** Counts step entries: a new caption to announce. */
  entry: number;
  caption: string;
  detail: string | null;
  target: TourTarget | null;
  captions: boolean;
  toggleCaptions: () => void;
  /** The narration is on (it may still be waiting for a click: `voiceBlocked`). */
  voice: boolean;
  /** The browser won't play the voice until the user clicks its button. */
  voiceBlocked: boolean;
  toggleVoice: () => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  exit: () => void;
}

/**
 * The guided tour in the workspace: starts on `?tour=1` (then strips it, so a reload doesn't restart
 * it), takes Space, ←, →, C, V and Esc, and pauses when the user clicks in the app or works it from the
 * keyboard. Each step is spoken, unless the voice is off; sped up (`?tourSpeed=`), the tour is silent.
 */
export function useTour(
  controller: TourController | null,
  { steps = TOUR_STEPS, scheduler, narrator: givenNarrator, invite = tourInvite }: UseTourOptions = {},
): Tour {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [session] = useState(createSession);
  const [narrator] = useState(() => givenNarrator ?? createNarrator());
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const { captions, toggleCaptions } = useTourCaptions();

  const query = params.toString();
  const requested = params.get("tour") === "1";
  const speed = tourSpeed(params.get("tourSpeed"));
  // Before the effect below starts the tour, so the first step already knows whether to speak.
  const { voice, voiceBlocked, toggleVoice } = useTourVoice(narrator, (session.runner ? session.speed : speed) > 1);

  useEffect(() => {
    if (!requested || !controller) return;
    if (pathname !== "/") {
      // A saved trip's link: the tour types its own trip, so it starts from a fresh planner at "/".
      router.replace(`/?${query}`);
      return;
    }
    window.history.replaceState(null, "", "/");
    session.start({
      steps,
      app: controller,
      scheduler,
      speed,
      reducedMotion: prefersReducedMotion,
      narrator: speed > 1 ? undefined : narrator,
    });
  }, [requested, controller, pathname, router, query, session, steps, scheduler, speed, narrator]);

  // Leaving the page ends the tour.
  useEffect(() => () => session.stop(), [session]);

  const active = snapshot.status === "running" || snapshot.status === "paused";
  const running = snapshot.status === "running";

  // A tour that has started has been seen: the top bar stops inviting people to it.
  useEffect(() => {
    if (!active) return;
    invite.tourStarted();
    return () => invite.tourEnded();
  }, [active, invite]);

  useEffect(() => {
    if (!active) return;
    const shortcuts: Record<string, () => void> = {
      " ": () => session.runner?.toggle(),
      ArrowRight: () => session.runner?.next(),
      ArrowLeft: () => session.runner?.previous(),
      c: toggleCaptions,
      C: toggleCaptions,
      v: toggleVoice,
      V: toggleVoice,
      Escape: () => session.runner?.exit(),
    };
    function onKeyDown(event: KeyboardEvent) {
      // An open dialog (How it works) has the keyboard: every key is its own.
      if (document.querySelector("dialog[open]")) return;
      // A lone modifier, or a browser or system shortcut (Cmd+C, a screen recorder's hotkey), is no one's step.
      if (MODIFIERS.has(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target instanceof Element ? event.target : null;
      const onTourControls = target?.closest(`[${TOUR_UI_ATTRIBUTE}]`) != null;
      // Space and Enter press the tour's own buttons, which do the right thing once.
      if (onTourControls && (event.key === " " || event.key === "Enter")) return;
      const action = shortcuts[event.key];
      if (action && !event.defaultPrevented && !(target && leftToTarget(event.key, target))) {
        event.preventDefault();
        if (!event.repeat) action();
        return;
      }
      // Anything else (Enter or Space on the app's buttons, typing, arrows on its tabs): the user takes over.
      if (!onTourControls) session.runner?.takeOver();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, session, toggleCaptions, toggleVoice]);

  // The user clicking in the app takes over (as does working it from the keyboard, above): pause, and
  // let their click do what it does.
  useEffect(() => {
    if (!running) return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Element && event.target.closest(`[${TOUR_UI_ATTRIBUTE}]`)) return;
      session.runner?.takeOver();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [running, session]);

  const runner = session.runner;
  return {
    active,
    paused: snapshot.status === "paused",
    index: snapshot.index,
    total: steps.length,
    entry: snapshot.entry,
    caption: active && runner ? runner.caption() : "",
    detail: active && runner ? runner.detail() : null,
    target: snapshot.target,
    captions,
    toggleCaptions,
    voice,
    voiceBlocked,
    toggleVoice,
    toggle: () => session.runner?.toggle(),
    next: () => session.runner?.next(),
    previous: () => session.runner?.previous(),
    exit: () => session.runner?.exit(),
  };
}

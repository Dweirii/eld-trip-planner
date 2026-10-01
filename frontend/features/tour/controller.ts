"use client";

import { createContext, useLayoutEffect, useState } from "react";
import type { Speed } from "@/features/replay/usePlayback";
import type { TripFormValues } from "@/features/trip-form/model";
import type { ResultsTab } from "@/features/workspace/ResultsPanel";
import type { Notice } from "@/features/workspace/usePlanner";
import type { Trip } from "@/lib/api/types";

/** What the tour reads from the workspace. */
export interface TourAppState {
  values: TripFormValues;
  trip: Trip | null;
  /** The results panel is showing `trip`. */
  results: boolean;
  pending: boolean;
  notice: Notice | null;
  /** The form shows validation errors. */
  invalid: boolean;
  selectedStopId: string | null;
  tab: ResultsTab;
  logDay: number;
  replay: { active: boolean; playing: boolean; ended: boolean };
}

/** What the tour can do in the workspace: the same calls the form, panel, logs and replay bar make. */
export interface TourActions {
  /** An empty planner at "/". */
  reset(): void;
  setValues(values: TripFormValues): void;
  /** Plan these values, exactly as the form's Plan trip button does. */
  plan(values: TripFormValues): void;
  selectStop(id: string | null): void;
  showTab(tab: ResultsTab): void;
  showDay(day: number): void;
  playReplay(): void;
  pauseReplay(): void;
  resetReplay(): void;
  setReplaySpeed(speed: Speed): void;
}

export interface TourController extends TourActions {
  /** The workspace as of its last render, plus what the tour has set since (values, selection, tab, day). */
  readonly state: TourAppState;
  /** Counts the workspace's renders. */
  readonly version: number;
  /**
   * Resolves with the state once `predicate` holds, checked now and after every render. With `since`
   * (a `version`), only a render after that one counts: use it right after an action, so a state
   * from before the action can't satisfy the wait. Rejects when `signal` aborts.
   */
  waitFor(predicate: (state: TourAppState) => boolean, signal: AbortSignal, since?: number): Promise<TourAppState>;
}

/** The workspace's controller for the guided tour (null outside a workspace). */
export const TourControllerContext = createContext<TourController | null>(null);

function createStore(initialState: TourAppState, initialActions: TourActions) {
  let state = initialState;
  let actions = initialActions;
  let version = 0;
  const checks = new Set<() => void>();

  const controller: TourController = {
    get state() {
      return state;
    },
    get version() {
      return version;
    },
    waitFor(predicate, signal, since = -1) {
      return new Promise((resolve, reject) => {
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        const check = () => {
          if (version <= since || !predicate(state)) return;
          stop();
          resolve(state);
        };
        const abort = () => {
          stop();
          reject(signal.reason);
        };
        const stop = () => {
          checks.delete(check);
          signal.removeEventListener("abort", abort);
        };
        checks.add(check);
        signal.addEventListener("abort", abort, { once: true });
        check();
      });
    },
    reset: () => actions.reset(),
    setValues(values) {
      // Read back at once: the next keystroke may come before the workspace renders.
      state = { ...state, values };
      actions.setValues(values);
    },
    plan: (values) => actions.plan(values),
    selectStop(id) {
      // The workspace toggles a stop that is selected again; the tour always means "this one".
      if (state.selectedStopId === id) return;
      state = { ...state, selectedStopId: id };
      actions.selectStop(id);
    },
    showTab(tab) {
      state = { ...state, tab };
      actions.showTab(tab);
    },
    showDay(day) {
      state = { ...state, logDay: day };
      actions.showDay(day);
    },
    playReplay: () => actions.playReplay(),
    pauseReplay: () => actions.pauseReplay(),
    resetReplay: () => actions.resetReplay(),
    setReplaySpeed: (speed) => actions.setReplaySpeed(speed),
  };

  return {
    controller,
    sync(nextState: TourAppState, nextActions: TourActions) {
      state = nextState;
      actions = nextActions;
      version++;
      [...checks].forEach((check) => check());
    },
  };
}

/** A stable controller over the workspace's latest state and actions (synced after every render). */
export function useTourController(state: TourAppState, actions: TourActions): TourController {
  const [store] = useState(() => createStore(state, actions));
  useLayoutEffect(() => {
    store.sync(state, actions);
  });
  return store.controller;
}

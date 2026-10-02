import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_FORM } from "@/features/trip-form/model";
import { sampleTrip } from "@/lib/api/__fixtures__";
import { type TourActions, type TourAppState, createTourStore } from "./controller";
import { AFTER_CLIP, type Scheduler, type TourVoice, createTourRunner } from "./runner";
import { PLANNING_CAPTION, RETRY_CAPTION, TIMING, TOUR_STEPS, TOUR_TRIP } from "./steps";
import { PLANNING_VOICE } from "./voice";

const scheduler: Scheduler = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  requestFrame: (callback) => setTimeout(callback, 16),
  cancelFrame: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const API_MS = 3000;

const EMPTY: TourAppState = {
  values: EMPTY_FORM,
  trip: null,
  results: false,
  pending: false,
  notice: null,
  invalid: false,
  selectedStopId: null,
  tab: "itinerary",
  logDay: 0,
  replay: { active: false, playing: false, ended: false },
};

/** A workspace that renders straight away; each plan answers after API_MS with the next outcome. */
function workspace(outcomes: ("ok" | "down")[] = ["ok"], initial: Partial<TourAppState> = {}) {
  let state: TourAppState = { ...EMPTY, ...initial };
  const plans: unknown[] = [];
  const render = (patch: Partial<TourAppState>) => {
    state = { ...state, ...patch };
    store.sync(state, actions);
  };
  const actions: TourActions = {
    reset: () => render({ ...EMPTY }),
    setValues: (values) => render({ values }),
    plan: (values) => {
      plans.push(values);
      render({ pending: true, notice: null });
      setTimeout(() => {
        if (outcomes.shift() === "ok") render({ pending: false, results: true, trip: sampleTrip });
        else render({ pending: false, notice: { message: "The routing service is unavailable.", retry: true } });
      }, API_MS);
    },
    selectStop: (selectedStopId) => render({ selectedStopId }),
    showTab: (tab) => render({ tab }),
    showDay: (logDay) => render({ logDay }),
    playReplay: vi.fn(),
    pauseReplay: vi.fn(),
    resetReplay: vi.fn(),
    setReplaySpeed: vi.fn(),
  };
  const store = createTourStore(state, actions);
  store.sync(state, actions);
  return { app: store.controller, plans, state: () => state };
}

function run(ids: string[], app: ReturnType<typeof workspace>["app"], narrator?: TourVoice) {
  const onEnd = vi.fn();
  const steps = TOUR_STEPS.filter((step) => ids.includes(step.id));
  const runner = createTourRunner({ steps, app, scheduler, narrator, onEnd });
  runner.start();
  return { runner, onEnd };
}

/** A voice whose clips last what the test says, in fake-timer time. */
function fakeVoice(clips: Record<string, number>) {
  const played: string[] = [];
  let cut = () => undefined as void;
  const voice: TourVoice = {
    play: (id) =>
      new Promise((resolve) => {
        played.push(id);
        const timer = setTimeout(() => resolve(true), clips[id]);
        cut = () => {
          clearTimeout(timer);
          resolve(false);
        };
      }),
    pause: () => undefined,
    resume: () => undefined,
    stop: () => cut(),
    preload: () => undefined,
  };
  return { voice, played };
}

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const PRESS = TIMING.beforePress + TIMING.press;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the guided tour's steps", () => {
  it("has the sixteen steps of the brief, in order", () => {
    expect(TOUR_STEPS.map((step) => step.id)).toEqual([
      "intro",
      "current",
      "stops",
      "cycle",
      "plan",
      "results",
      "itinerary",
      "linked",
      "directions",
      "rules",
      "assumptions",
      "logs",
      "next-day",
      "print",
      "replay",
      "share",
    ]);
  });

  it("types the four inputs, then sets the example's exact places, coordinates included", async () => {
    const { app } = workspace();
    const { onEnd } = run(["current", "stops", "cycle"], app);
    await advance(1500);
    expect(app.state.values.current.label).toMatch(/^Chic/);
    expect(app.state.values.current.lat).toBeUndefined();
    await advance(30_000);
    expect(onEnd).toHaveBeenCalledWith("finished");
    expect(app.state.values).toEqual(TOUR_TRIP);
  });

  it("puts a half-typed field back when the tour is left mid-word, so the form is never left invalid", async () => {
    const { app } = workspace();
    const { runner } = run(["current"], app);
    await advance(1000);
    expect(app.state.values.current.label).toMatch(/^Ch/);
    runner.exit();
    await advance(0);
    expect(app.state.values.current).toEqual({ label: "" });
  });

  it("lets the next step set the form when Next is pressed mid-word", async () => {
    const { app } = workspace();
    const { runner } = run(["current", "stops"], app);
    await advance(1000);
    runner.next();
    await advance(TIMING.beforeTyping + 200);
    expect(app.state.values.current).toEqual(TOUR_TRIP.current);
    expect(app.state.values.pickup.label).toMatch(/^St/);
  });

  it("plans the trip and says what it is doing until the results are in", async () => {
    const { app, plans } = workspace(["ok"], { values: TOUR_TRIP });
    const { runner } = run(["plan", "results"], app);
    expect(runner.caption()).toBe("Plan the trip.");
    await advance(PRESS);
    expect(plans).toEqual([TOUR_TRIP]);
    expect(runner.caption()).toBe(PLANNING_CAPTION);
    await advance(API_MS);
    expect(runner.caption()).toBe("972 miles and 2 log days, on a real heavy-truck route.");
  });

  it("speaks the planning line when the plan is still on its way after \"Plan the trip.\", and waits for it", async () => {
    const { app } = workspace(["ok"], { values: TOUR_TRIP });
    const { voice, played } = fakeVoice({ plan: 1000, [PLANNING_VOICE]: 6000, results: 1000 });
    const { runner } = run(["plan", "results"], app, voice);
    expect(TOUR_STEPS.find((step) => step.id === "plan")?.clips).toEqual([PLANNING_VOICE]);
    await advance(PRESS - 1);
    expect(played).toEqual(["plan"]);
    await advance(1);
    expect(played).toEqual(["plan", PLANNING_VOICE]);
    // The plan is in, but the line is still being spoken.
    await advance(API_MS);
    expect(app.state.results).toBe(true);
    expect(runner.getSnapshot().index).toBe(0);
    await advance(6000 - API_MS + AFTER_CLIP);
    expect(runner.getSnapshot().index).toBe(1);
    expect(played).toEqual(["plan", PLANNING_VOICE, "results"]);
  });

  it("skips the planning line when the plan is in before \"Plan the trip.\" has been said", async () => {
    const { app } = workspace(["ok"], { values: TOUR_TRIP });
    const { voice, played } = fakeVoice({ plan: PRESS + API_MS + 500, results: 1000 });
    const { runner } = run(["plan", "results"], app, voice);
    await advance(PRESS + API_MS + 500 + AFTER_CLIP - 1);
    expect(runner.getSnapshot().index).toBe(0);
    await advance(1);
    expect(runner.getSnapshot().index).toBe(1);
    expect(played).toEqual(["plan", "results"]);
  });

  it("speaks the planning line once, not again for the retry", async () => {
    const { app } = workspace(["down", "ok"], { values: TOUR_TRIP });
    const { voice, played } = fakeVoice({ plan: 1000, [PLANNING_VOICE]: 2000, results: 1000 });
    run(["plan", "results"], app, voice);
    await advance(PRESS + API_MS + TIMING.retryAfter + API_MS + AFTER_CLIP);
    expect(played).toEqual(["plan", PLANNING_VOICE, "results"]);
  });

  it("says the API is waking up and retries once after an error", async () => {
    const { app, plans } = workspace(["down", "ok"], { values: TOUR_TRIP });
    const { runner } = run(["plan", "results"], app);
    await advance(PRESS + API_MS);
    expect(runner.caption()).toBe(RETRY_CAPTION);
    expect(runner.getSnapshot().target).toBe('[data-tour="notice"]');
    await advance(TIMING.retryAfter);
    expect(plans).toHaveLength(2);
    expect(runner.caption()).toBe(PLANNING_CAPTION);
    await advance(API_MS);
    expect(runner.getSnapshot().index).toBe(1);
  });

  it("ends the tour, leaving the error toast up, when the retry fails too", async () => {
    const { app, plans, state } = workspace(["down", "down"], { values: TOUR_TRIP });
    const { runner, onEnd } = run(["plan", "results"], app);
    await advance(PRESS + API_MS + TIMING.retryAfter + API_MS);
    expect(plans).toHaveLength(2);
    expect(onEnd).toHaveBeenCalledWith("exited");
    expect(runner.getSnapshot().status).toBe("ended");
    expect(state().notice).not.toBeNull();
  });

  it("plans the trip itself when a results step is reached early (Next)", async () => {
    const { app, plans } = workspace(["ok"]);
    const { runner } = run(["results"], app);
    await advance(0);
    expect(plans).toEqual([TOUR_TRIP]);
    expect(runner.caption()).toBe(PLANNING_CAPTION);
    await advance(API_MS);
    expect(runner.caption()).toMatch(/^972 miles/);
  });

  it("keeps the planning line to the plan step: a results step that plans for itself speaks only its own", async () => {
    const { app } = workspace(["ok"]);
    const { voice, played } = fakeVoice({ results: 1000, [PLANNING_VOICE]: 1000 });
    run(["results"], app, voice);
    await advance(API_MS + TIMING.results);
    expect(played).toEqual(["results"]);
  });

  it("ends on the trip's shareable link", async () => {
    const { app } = workspace(["ok"], { results: true, trip: sampleTrip });
    const { runner } = run(["share"], app);
    await advance(0);
    expect(runner.caption()).toBe("Every trip gets a shareable link. Thanks for watching!");
    expect(runner.detail()).toBe(`${window.location.host}/trips/${sampleTrip.id}`);
  });
});

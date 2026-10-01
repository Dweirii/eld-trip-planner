/** The guided tour, step by step: its captions (binding copy), what each step shows, and its pace. */
import { EXAMPLE_TRIPS } from "@/features/trip-form/examples";
import { EMPTY_FORM, type LocationValue, type TripFormValues } from "@/features/trip-form/model";
import type { ResultsTab } from "@/features/workspace/ResultsPanel";
import { miles } from "@/lib/format";
import type { TourAppState, TourController } from "./controller";
import {
  easeOut,
  pageTopOf,
  plannerPanel,
  press,
  revealInPanel,
  scrollTo,
  tourTarget,
  visibleElement,
} from "./dom";
import type { StepContext, TourStep } from "./runner";
import { typeText } from "./typing";

export type TourContext = StepContext<TourController>;

/** Every pause and pace in the tour, in ms at 1× (steps hold for these once they are set up). */
export const TIMING = {
  intro: 5000,
  /** The spotlight lands on a field before the first keystroke. */
  beforeTyping: 700,
  /** A typed field stays in the spotlight before the next one. */
  afterField: 900,
  cycleSweep: 1200,
  cycle: 2000,
  /** "Plan the trip." is read before the button is pressed. */
  beforePress: 1100,
  /** The press dips and comes back before the plan is sent. */
  press: 380,
  /** The API's error toast stays this long before the tour retries. */
  retryAfter: 2500,
  results: 5000,
  itinerary: 7000,
  linkedPin: 3500,
  linkedRow: 3500,
  directionsRead: 1300,
  directionsScroll: 4200,
  directionsAfter: 1500,
  rules: 7000,
  assumptions: 4000,
  logSheet: 1600,
  logGrid: 2400,
  logTotals: 1800,
  logRemarks: 1600,
  logRecap: 2000,
  dayTabs: 1000,
  nextDay: 6000,
  print: 4000,
  beforePlay: 1300,
  afterReplay: 1000,
  outro: 6000,
  pageScroll: 1100,
  panelScroll: 600,
  /** Lets React show a new tab before its content is measured. */
  settle: 80,
} as const;

export const PLANNING_CAPTION = "Routing a heavy truck, then simulating every hour under 49 CFR Part 395…";
export const RETRY_CAPTION = "The API is waking up. Retrying…";

function exampleTrip(): TripFormValues {
  const example = EXAMPLE_TRIPS.find((trip) => trip.id === "multi-day");
  if (!example) throw new Error("The tour plans the Multi-day example.");
  return example.values;
}

/** The Multi-day example: Chicago, IL → St. Louis, MO → Dallas, TX, 12.5 h of the cycle used. */
export const TOUR_TRIP = exampleTrip();

const RESULTS_TABS = `${tourTarget("results")} [role="tablist"]`;
const LOG_DAY_TABS = `${tourTarget("daily-logs")} [role="tab"]`;
const FIELD_MARKERS = { current: "start", pickup: "pickup", dropoff: "dropoff" } as const;
type LocationKey = keyof typeof FIELD_MARKERS;

const isPlanned = (state: TourAppState) => state.results && state.trip !== null;

function setValues(ctx: TourContext, patch: Partial<TripFormValues>) {
  ctx.app.setValues({ ...ctx.app.state.values, ...patch });
}

/** The form on screen, with no results and nothing being planned. */
async function atForm(ctx: TourContext) {
  const { app } = ctx;
  if (!app.state.results && !app.state.pending) return;
  const since = app.version;
  app.reset();
  await app.waitFor((state) => !state.results && !state.pending, ctx.signal, since);
}

/** Type a place into its field, then set the example's exact place (coordinates too), so planning never waits on autocomplete. */
async function typeInto(ctx: TourContext, key: LocationKey, place: LocationValue) {
  const field = tourTarget(`location-${FIELD_MARKERS[key]}`);
  ctx.spotlight(field);
  await revealInPanel(ctx, document.querySelector(field), TIMING.panelScroll);
  await ctx.wait(TIMING.beforeTyping);
  await typeText({
    text: place.label,
    onType: (label) => setValues(ctx, { [key]: { label } }),
    wait: ctx.wait,
    reducedMotion: ctx.reducedMotion,
  });
  setValues(ctx, { [key]: { ...place } });
  await ctx.wait(TIMING.afterField);
}

/** Plan what the form holds, as its Plan trip button does; on an API error, say so and retry once, then end the tour. */
async function planTrip(ctx: TourContext) {
  const { app } = ctx;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const since = app.version;
    app.plan(app.state.values);
    ctx.say(PLANNING_CAPTION);
    ctx.spotlight(null);
    const state = await app.waitFor(
      (current) => !current.pending && (isPlanned(current) || current.notice !== null || current.invalid),
      ctx.signal,
      since,
    );
    await ctx.gate();
    if (isPlanned(state)) {
      ctx.say(null);
      return;
    }
    if (attempt === 2 || !state.notice?.retry) break;
    ctx.say(RETRY_CAPTION);
    ctx.spotlight(tourTarget("notice"));
    await ctx.wait(TIMING.retryAfter);
  }
  // The toast stays up, with its own Retry button.
  ctx.exit();
}

/** The tour's trip on screen: planned already, still planning (wait for it), or planned now. */
async function ensurePlanned(ctx: TourContext) {
  const { app } = ctx;
  if (isPlanned(app.state)) return;
  if (app.state.pending) {
    ctx.say(PLANNING_CAPTION);
    ctx.spotlight(null);
    const state = await app.waitFor((current) => !current.pending, ctx.signal);
    await ctx.gate();
    ctx.say(null);
    if (isPlanned(state)) return;
  }
  app.setValues({ ...TOUR_TRIP });
  await planTrip(ctx);
}

/** The results as a step starts them: this tab, nothing selected, no replay, the map at the top. */
async function atResults(ctx: TourContext, tab: ResultsTab) {
  await ensurePlanned(ctx);
  const { app } = ctx;
  if (app.state.replay.active) app.resetReplay();
  app.selectStop(null);
  app.showTab(tab);
  await scrollTo(ctx, 0, TIMING.pageScroll);
  await ctx.wait(TIMING.settle);
}

/** Show one tab of the results panel from its top, the tab bar and its panel in the spotlight. */
async function showTab(ctx: TourContext, tab: ResultsTab) {
  await atResults(ctx, tab);
  ctx.spotlight([RESULTS_TABS, tourTarget(tab)]);
  await scrollTo(ctx, 0, TIMING.panelScroll, plannerPanel());
}

/** The daily logs at the top of the page, nothing selected, no replay. */
async function atLogs(ctx: TourContext) {
  await ensurePlanned(ctx);
  const { app } = ctx;
  if (app.state.replay.active) app.resetReplay();
  app.selectStop(null);
  await ctx.wait(TIMING.settle);
  const heading = document.querySelector(`${tourTarget("daily-logs")} h2`);
  if (heading) await scrollTo(ctx, pageTopOf(heading, 16), TIMING.pageScroll);
}

/** Spotlight `target`, then wait `ms`. */
async function linger(ctx: TourContext, target: string, ms: number) {
  ctx.spotlight(target);
  await ctx.wait(ms);
}

export const TOUR_STEPS: readonly TourStep<TourController>[] = [
  {
    id: "intro",
    caption: () =>
      "Milepost plans a truck trip under FMCSA Hours-of-Service rules, and fills in the driver's daily logs.",
    target: tourTarget("trip-form"),
    hold: TIMING.intro,
    back: "tour",
    enter: async (ctx) => {
      const { app } = ctx;
      const since = app.version;
      app.reset();
      const page = document.scrollingElement ?? document.documentElement;
      page.scrollTop = 0;
      const panel = plannerPanel();
      if (panel) panel.scrollTop = 0;
      await app.waitFor((state) => !state.results && !state.pending, ctx.signal, since);
    },
  },
  {
    id: "current",
    caption: () => "The brief's four inputs. First, where the truck is now…",
    target: tourTarget("location-start"),
    back: "tour",
    enter: async (ctx) => {
      await atForm(ctx);
      ctx.app.setValues({ ...EMPTY_FORM });
      await typeInto(ctx, "current", TOUR_TRIP.current);
    },
  },
  {
    id: "stops",
    caption: () => "…then the pickup and the dropoff.",
    target: tourTarget("location-pickup"),
    back: "tour",
    enter: async (ctx) => {
      await atForm(ctx);
      ctx.app.setValues({ ...EMPTY_FORM, current: { ...TOUR_TRIP.current } });
      await typeInto(ctx, "pickup", TOUR_TRIP.pickup);
      await typeInto(ctx, "dropoff", TOUR_TRIP.dropoff);
    },
  },
  {
    id: "cycle",
    caption: () => "Hours already used in the 70-hour / 8-day cycle.",
    target: tourTarget("cycle"),
    hold: TIMING.cycle,
    back: "tour",
    enter: async (ctx) => {
      await atForm(ctx);
      ctx.app.setValues({ ...TOUR_TRIP, cycleUsed: 0 });
      await revealInPanel(ctx, document.querySelector(tourTarget("cycle")), TIMING.panelScroll);
      await ctx.wait(TIMING.beforeTyping);
      // The slider and the number box move together, in the form's quarter hours.
      await ctx.animate(TIMING.cycleSweep, (progress) =>
        setValues(ctx, { cycleUsed: Math.round(TOUR_TRIP.cycleUsed * easeOut(progress) * 4) / 4 }),
      );
      setValues(ctx, { cycleUsed: TOUR_TRIP.cycleUsed });
    },
  },
  {
    id: "plan",
    caption: () => "Plan the trip.",
    target: tourTarget("plan"),
    hold: "until-done",
    back: "tour",
    enter: async (ctx) => {
      await atForm(ctx);
      ctx.app.setValues({ ...TOUR_TRIP });
      const button = document.querySelector(tourTarget("plan"));
      await revealInPanel(ctx, button, TIMING.panelScroll);
      await ctx.wait(TIMING.beforePress);
      press(button, ctx.reducedMotion);
      await ctx.wait(TIMING.press);
      await planTrip(ctx);
    },
  },
  {
    id: "results",
    caption: ({ app }) => {
      const { trip } = app.state;
      if (!trip) return PLANNING_CAPTION;
      const days = trip.summary.days;
      return `${miles(trip.summary.total_miles)} miles and ${days} log ${days === 1 ? "day" : "days"}, on a real heavy-truck route.`;
    },
    target: tourTarget("stats"),
    hold: TIMING.results,
    back: "restart",
    enter: async (ctx) => {
      await atResults(ctx, "itinerary");
      ctx.spotlight(tourTarget("stats"));
      await scrollTo(ctx, 0, TIMING.panelScroll, plannerPanel());
    },
  },
  {
    id: "itinerary",
    caption: () =>
      "Every stop the rules require: 30-minute breaks, 10-hour rests, fuel at least every 1,000 miles, and 1 hour at pickup and dropoff.",
    target: tourTarget("itinerary"),
    hold: TIMING.itinerary,
    enter: async (ctx) => {
      await atResults(ctx, "itinerary");
      ctx.spotlight(tourTarget("itinerary"));
      // Gently, and only if the list runs below the panel.
      await revealInPanel(ctx, document.querySelector(tourTarget("itinerary")), TIMING.pageScroll);
    },
  },
  {
    id: "linked",
    caption: () => "Select a stop and it's linked everywhere: the map, the itinerary, and its bracket on the daily log.",
    hold: TIMING.linkedRow,
    enter: async (ctx) => {
      await atResults(ctx, "itinerary");
      const { app } = ctx;
      const stops = app.state.trip?.stops ?? [];
      const stop = stops.find((candidate) => candidate.kind === "rest") ?? stops.find((s) => s.kind !== "start");
      if (!stop) return;
      const row = `${tourTarget("itinerary")} [data-stop-id="${stop.id}"]`;
      await revealInPanel(ctx, document.querySelector(row), TIMING.panelScroll);
      app.selectStop(stop.id);
      // The pin and its popup, then the row: one stop, linked.
      await linger(ctx, `${tourTarget("map")} [data-stop-id="${stop.id}"]`, TIMING.linkedPin);
      ctx.spotlight(row);
    },
  },
  {
    id: "directions",
    caption: () => "Turn-by-turn route instructions for every leg.",
    target: [RESULTS_TABS, tourTarget("directions")],
    hold: TIMING.directionsAfter,
    enter: async (ctx) => {
      await showTab(ctx, "directions");
      await ctx.wait(TIMING.directionsRead);
      // Slowly down the step list, about a panel's height.
      const panel = plannerPanel();
      if (panel) await scrollTo(ctx, panel.scrollTop + panel.clientHeight * 0.75, TIMING.directionsScroll, panel);
    },
  },
  {
    id: "rules",
    caption: () => "An independent checker re-verifies every rule, each with its CFR citation.",
    target: [RESULTS_TABS, tourTarget("rules")],
    hold: TIMING.rules,
    enter: (ctx) => showTab(ctx, "rules"),
  },
  {
    id: "assumptions",
    caption: () => "The assumptions the plan was built on.",
    target: [RESULTS_TABS, tourTarget("assumptions")],
    hold: TIMING.assumptions,
    enter: (ctx) => showTab(ctx, "assumptions"),
  },
  {
    id: "logs",
    caption: () =>
      "One daily log per day, drawn like the FMCSA paper form: the duty line, totals that add up to 24, remarks, and the 70-hour recap.",
    target: tourTarget("log-sheet"),
    hold: TIMING.logRecap,
    enter: async (ctx) => {
      ctx.app.showDay(0);
      ctx.spotlight(tourTarget("log-sheet"));
      await atLogs(ctx);
      await ctx.wait(TIMING.logSheet);
      await linger(ctx, tourTarget("log-grid"), TIMING.logGrid);
      await linger(ctx, tourTarget("log-totals"), TIMING.logTotals);
      await linger(ctx, tourTarget("log-remarks"), TIMING.logRemarks);
      ctx.spotlight(tourTarget("log-recap"));
    },
  },
  {
    id: "next-day",
    caption: () => "Day 2 picks up where Day 1 left off.",
    target: tourTarget("log-sheet"),
    hold: TIMING.nextDay,
    enter: async (ctx) => {
      await atLogs(ctx);
      const tabs = document.querySelectorAll(LOG_DAY_TABS);
      if (tabs.length < 2) return;
      await linger(ctx, `${tourTarget("daily-logs")} [role="tablist"]`, TIMING.dayTabs);
      press(tabs[1], ctx.reducedMotion);
      await ctx.wait(TIMING.press);
      ctx.app.showDay(1);
      ctx.spotlight(tourTarget("log-sheet"));
    },
  },
  {
    id: "print",
    caption: () => "Ready to print or save as PDF, one landscape page per day.",
    target: tourTarget("print"),
    hold: TIMING.print,
    enter: async (ctx) => {
      await atLogs(ctx);
      ctx.spotlight(tourTarget("print"));
    },
  },
  {
    id: "replay",
    caption: () => "Press Play: the truck, the itinerary and the log line move together.",
    target: tourTarget("play"),
    hold: "until-done",
    enter: async (ctx) => {
      await atResults(ctx, "itinerary");
      const { app } = ctx;
      await scrollTo(ctx, 0, TIMING.panelScroll, plannerPanel());
      app.setReplaySpeed(1);
      ctx.spotlight(tourTarget("play"));
      await ctx.wait(TIMING.beforePlay);
      press(visibleElement(tourTarget("play")), ctx.reducedMotion);
      await ctx.wait(TIMING.press);

      // Pausing the tour pauses the truck; resuming carries on from there.
      ctx.onPause(() => app.pauseReplay());
      ctx.onResume(() => {
        if (!app.state.replay.playing && !app.state.replay.ended) app.playReplay();
      });
      const since = app.version;
      app.playReplay();
      ctx.spotlight(null);
      await app.waitFor((state) => state.replay.playing, ctx.signal, since);
      await app.waitFor((state) => state.replay.ended, ctx.signal);
      await ctx.gate();
      await ctx.wait(TIMING.afterReplay);
    },
  },
  {
    id: "share",
    caption: () => "Every trip gets a shareable link. Thanks for watching!",
    detail: ({ app }) => (app.state.trip ? `${window.location.host}/trips/${app.state.trip.id}` : null),
    hold: TIMING.outro,
    enter: async (ctx) => {
      await ensurePlanned(ctx);
      ctx.spotlight(null);
    },
  },
];

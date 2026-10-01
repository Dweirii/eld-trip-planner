/**
 * The guided tour's step runner: no React and no DOM, driven by an injectable scheduler.
 *
 * Steps run one after another. Every wait a step makes is pausable (a pause freezes the clock where it
 * is) and abortable (Next, Previous and Exit abort the step in flight, its timers with it). A step stays
 * on screen until its `enter()` has finished and, for a numeric hold, at least that long from its start.
 */

export interface Scheduler {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  /** One animation frame (requestAnimationFrame in the browser). */
  requestFrame(callback: () => void): unknown;
  cancelFrame(handle: unknown): void;
}

export const browserScheduler: Scheduler = {
  now: () => performance.now(),
  setTimeout: (callback, ms) => window.setTimeout(callback, ms),
  clearTimeout: (handle) => window.clearTimeout(handle as number),
  requestFrame: (callback) => window.requestAnimationFrame(() => callback()),
  cancelFrame: (handle) => window.cancelAnimationFrame(handle as number),
};

/** A frame later than this (a background tab) counts as this long, so an animation never leaps. */
const MAX_FRAME_MS = 100;

/** Time that stands still while paused: sleeps freeze, the gate shuts, animation frames wait. */
export interface PausableClock {
  readonly paused: boolean;
  pause(): void;
  resume(): void;
  /** Resolves after `ms` of unpaused time; rejects with the signal's reason when aborted. */
  sleep(ms: number, signal: AbortSignal): Promise<void>;
  /** Resolves at once, or when the clock is next resumed. */
  gate(signal: AbortSignal): Promise<void>;
  /** The next animation frame, with the time it ran at. */
  frame(signal: AbortSignal): Promise<number>;
}

interface Sleeper {
  freeze(): void;
  thaw(): void;
}

/** Settle `promise`-style work once, and reject with the signal's reason if it is aborted first. */
function abortable<T>(
  signal: AbortSignal,
  start: (resolve: (value: T) => void, onAbort: (cleanup: () => void) => void) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    let cleanup = () => undefined as void;
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
    start(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (onAbort) => {
        cleanup = onAbort;
      },
    );
  });
}

export function createPausableClock(scheduler: Scheduler): PausableClock {
  let paused = false;
  const sleepers = new Set<Sleeper>();
  const gated = new Set<() => void>();

  return {
    get paused() {
      return paused;
    },
    pause() {
      if (paused) return;
      paused = true;
      sleepers.forEach((sleeper) => sleeper.freeze());
    },
    resume() {
      if (!paused) return;
      paused = false;
      sleepers.forEach((sleeper) => sleeper.thaw());
      const open = [...gated];
      gated.clear();
      open.forEach((release) => release());
    },
    sleep(ms, signal) {
      return abortable<void>(signal, (resolve, onAbort) => {
        let remaining = Math.max(0, ms);
        let startedAt = 0;
        let handle: unknown = null;
        const sleeper: Sleeper = {
          freeze() {
            if (handle === null) return;
            scheduler.clearTimeout(handle);
            handle = null;
            remaining = Math.max(0, remaining - (scheduler.now() - startedAt));
          },
          thaw() {
            if (handle !== null) return;
            startedAt = scheduler.now();
            handle = scheduler.setTimeout(() => {
              sleepers.delete(sleeper);
              resolve();
            }, remaining);
          },
        };
        sleepers.add(sleeper);
        onAbort(() => {
          sleeper.freeze();
          sleepers.delete(sleeper);
        });
        if (!paused) sleeper.thaw();
      });
    },
    gate(signal) {
      if (!paused) return signal.aborted ? Promise.reject(signal.reason) : Promise.resolve();
      return abortable<void>(signal, (resolve, onAbort) => {
        const release = () => resolve();
        gated.add(release);
        onAbort(() => gated.delete(release));
      });
    },
    frame(signal) {
      return abortable<number>(signal, (resolve, onAbort) => {
        const handle = scheduler.requestFrame(() => resolve(scheduler.now()));
        onAbort(() => scheduler.cancelFrame(handle));
      });
    },
  };
}

/** What a step spotlights: one `data-tour` selector, or several shown as one. */
export type TourTarget = string | readonly string[];

/** How long a step stays at least (ms, from its start), or "until-done": exactly as long as its enter(). */
export type Hold = number | "until-done";

/** What a running step gets: the app it drives, and waits that pause and abort with the tour. */
export interface StepContext<App> {
  readonly app: App;
  /** Aborted when the step is left (Next, Previous, Exit). */
  readonly signal: AbortSignal;
  /** The tour's speed-up (1 in real use). */
  readonly speed: number;
  /** Read live: the user prefers reduced motion. */
  readonly reducedMotion: boolean;
  /** Pausable, abortable wait, scaled by the speed. */
  wait(ms: number): Promise<void>;
  /** Call `frame` with an eased-free progress from 0 to 1 over `ms`; under reduced motion, jump to 1 and still take `ms`. */
  animate(ms: number, frame: (progress: number) => void): Promise<void>;
  /** Resolves at once, or when the tour is resumed. Use it after waiting on anything that isn't a timer. */
  gate(): Promise<void>;
  /** Replace this step's caption (null: back to its own). */
  say(caption: string | null): void;
  /** Move the spotlight (null: none). */
  spotlight(target: TourTarget | null): void;
  /** Called when the tour pauses or resumes during this step. */
  onPause(handler: () => void): void;
  onResume(handler: () => void): void;
  /** End the tour (e.g. the API is down). */
  exit(): void;
}

export interface TourStep<App> {
  id: string;
  caption: (ctx: StepContext<App>) => string;
  /** An extra line under the caption (the trip's link, at the end). */
  detail?: (ctx: StepContext<App>) => string | null;
  target?: TourTarget;
  /** Puts the app in the state this step shows. Idempotent, so Next and Previous can land on it from anywhere. */
  enter: (ctx: StepContext<App>, signal: AbortSignal) => Promise<void>;
  hold?: Hold;
  /** What Previous does here: go back a step (default), restart this step, or restart the tour. */
  back?: "previous" | "restart" | "tour";
}

export type TourStatus = "idle" | "running" | "paused" | "ended";
export type EndReason = "finished" | "exited" | "failed";

export interface TourSnapshot {
  status: TourStatus;
  /** The current step (-1 before the tour starts). */
  index: number;
  /** A caption the step set over its own (null: its own). */
  say: string | null;
  target: TourTarget | null;
  /** Counts step entries, so a caption is announced once each time a step is (re)entered. */
  entry: number;
}

export interface TourRunner {
  getSnapshot(): TourSnapshot;
  subscribe(listener: () => void): () => void;
  /** The current step's caption (or what the step said over it); "" when no step runs. */
  caption(): string;
  detail(): string | null;
  start(index?: number): void;
  pause(): void;
  resume(): void;
  toggle(): void;
  next(): void;
  previous(): void;
  exit(): void;
}

export interface RunnerOptions<App> {
  steps: readonly TourStep<App>[];
  app: App;
  scheduler?: Scheduler;
  /** Divides every wait (a test-only speed-up). */
  speed?: number;
  reducedMotion?: () => boolean;
  onEnd?: (reason: EndReason) => void;
}

const IDLE: TourSnapshot = { status: "idle", index: -1, say: null, target: null, entry: 0 };

export function createTourRunner<App>({
  steps,
  app,
  scheduler = browserScheduler,
  speed = 1,
  reducedMotion = () => false,
  onEnd,
}: RunnerOptions<App>): TourRunner {
  const clock = createPausableClock(scheduler);
  const listeners = new Set<() => void>();
  let snapshot = IDLE;
  let current: { controller: AbortController; ctx: StepContext<App> } | null = null;
  let pauseHandlers: (() => void)[] = [];
  let resumeHandlers: (() => void)[] = [];

  function update(patch: Partial<TourSnapshot>) {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  }

  function leaveStep() {
    current?.controller.abort();
    current = null;
    pauseHandlers = [];
    resumeHandlers = [];
  }

  function context(controller: AbortController): StepContext<App> {
    const { signal } = controller;
    const live = () => current?.controller === controller;
    const wait = (ms: number) => clock.sleep(ms / speed, signal);
    return {
      app,
      signal,
      speed,
      get reducedMotion() {
        return reducedMotion();
      },
      wait,
      async animate(ms, frame) {
        const duration = ms / speed;
        if (reducedMotion() || duration <= 0) {
          frame(1);
          await clock.sleep(duration, signal);
          return;
        }
        let elapsed = 0;
        let last: number | null = null;
        while (elapsed < duration) {
          const now = await clock.frame(signal);
          if (clock.paused) {
            await clock.gate(signal);
            last = null;
            continue;
          }
          if (last !== null) elapsed += Math.min(now - last, MAX_FRAME_MS);
          last = now;
          frame(Math.min(elapsed / duration, 1));
        }
      },
      gate: () => clock.gate(signal),
      say(caption) {
        if (live() && snapshot.say !== caption) update({ say: caption });
      },
      spotlight(target) {
        if (live()) update({ target });
      },
      onPause(handler) {
        if (live()) pauseHandlers.push(handler);
      },
      onResume(handler) {
        if (live()) resumeHandlers.push(handler);
      },
      exit() {
        if (live()) finish("exited");
      },
    };
  }

  function enter(index: number) {
    leaveStep();
    clock.resume();
    const step = steps[index];
    const controller = new AbortController();
    const ctx = context(controller);
    current = { controller, ctx };
    update({ status: "running", index, say: null, target: step.target ?? null, entry: snapshot.entry + 1 });

    const hold = step.hold ?? 0;
    Promise.all([
      Promise.resolve().then(() => step.enter(ctx, controller.signal)),
      typeof hold === "number" ? ctx.wait(hold) : undefined,
    ])
      .then(() => ctx.gate())
      .then(
        () => {
          if (current?.controller === controller) advance(index + 1);
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          console.error("The guided tour stopped:", error);
          finish("failed");
        },
      );
  }

  function advance(index: number) {
    if (index < steps.length) enter(index);
    else finish("finished");
  }

  function finish(reason: EndReason) {
    leaveStep();
    clock.resume();
    update({ status: "ended", say: null, target: null });
    onEnd?.(reason);
  }

  const active = () => snapshot.status === "running" || snapshot.status === "paused";

  function pause() {
    if (snapshot.status !== "running") return;
    clock.pause();
    update({ status: "paused" });
    pauseHandlers.forEach((handler) => handler());
  }

  function resume() {
    if (snapshot.status !== "paused") return;
    clock.resume();
    update({ status: "running" });
    resumeHandlers.forEach((handler) => handler());
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    caption() {
      if (!current || !active()) return "";
      return snapshot.say ?? steps[snapshot.index].caption(current.ctx);
    },
    detail() {
      if (!current || !active()) return null;
      return steps[snapshot.index].detail?.(current.ctx) ?? null;
    },
    start(index = 0) {
      enter(Math.min(Math.max(index, 0), steps.length - 1));
    },
    pause,
    resume,
    toggle() {
      if (snapshot.status === "running") pause();
      else resume();
    },
    next() {
      if (active()) advance(snapshot.index + 1);
    },
    previous() {
      if (!active()) return;
      const { index } = snapshot;
      const back = steps[index].back ?? "previous";
      enter(back === "tour" ? 0 : back === "restart" ? index : Math.max(0, index - 1));
    },
    exit() {
      if (active()) finish("exited");
    },
  };
}

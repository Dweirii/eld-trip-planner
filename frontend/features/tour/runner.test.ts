import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AFTER_CLIP,
  type Scheduler,
  type StepContext,
  type TourStep,
  type TourVoice,
  createPausableClock,
  createTourRunner,
} from "./runner";

/** Fake-timer time: frames are 16 ms timeouts. */
const scheduler: Scheduler = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  requestFrame: (callback) => setTimeout(callback, 16),
  cancelFrame: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

type App = { log: string[] };
type Ctx = StepContext<App>;

function step(id: string, options: Partial<TourStep<App>> = {}): TourStep<App> {
  return {
    id,
    caption: () => `Caption ${id}`,
    enter: async (ctx) => {
      ctx.app.log.push(id);
    },
    ...options,
  };
}

function setup(
  steps: TourStep<App>[],
  options: { speed?: number; reducedMotion?: boolean; narrator?: TourVoice } = {},
) {
  const app: App = { log: [] };
  const onEnd = vi.fn();
  const runner = createTourRunner({
    steps,
    app,
    scheduler,
    speed: options.speed,
    reducedMotion: () => options.reducedMotion ?? false,
    narrator: options.narrator,
    onEnd,
  });
  const index = () => runner.getSnapshot().index;
  const status = () => runner.getSnapshot().status;
  return { app, runner, onEnd, index, status };
}

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createTourRunner", () => {
  it("starts idle, and runs the steps in order, each for its hold", async () => {
    const { app, runner, onEnd, index, status } = setup([
      step("a", { hold: 1000 }),
      step("b", { hold: 2000 }),
      step("c", { hold: 500 }),
    ]);
    expect(runner.getSnapshot()).toMatchObject({ status: "idle", index: -1 });

    runner.start();
    await advance(0);
    expect(status()).toBe("running");
    expect(index()).toBe(0);
    expect(runner.caption()).toBe("Caption a");

    await advance(999);
    expect(index()).toBe(0);
    await advance(1);
    expect(index()).toBe(1);
    expect(runner.caption()).toBe("Caption b");
    await advance(1999);
    expect(index()).toBe(1);
    await advance(1);
    expect(index()).toBe(2);
    await advance(500);
    expect(status()).toBe("ended");
    expect(onEnd).toHaveBeenCalledWith("finished");
    expect(app.log).toEqual(["a", "b", "c"]);
  });

  it("holds a step once its enter() has set it up", async () => {
    const { runner, index } = setup([
      step("a", { hold: 1000, enter: (ctx) => ctx.wait(3000) }),
      step("b", { hold: 1000 }),
    ]);
    runner.start();
    await advance(3999);
    expect(index()).toBe(0);
    await advance(1);
    expect(index()).toBe(1);
  });

  it("waits for an until-done step's promise, however long it takes", async () => {
    let finish = () => undefined as void;
    const { runner, index } = setup([
      step("plan", {
        hold: "until-done",
        enter: () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      }),
      step("results", { hold: 1000 }),
    ]);
    runner.start();
    await advance(60_000);
    expect(index()).toBe(0);
    finish();
    await advance(0);
    expect(index()).toBe(1);
  });

  it("pauses where it is and resumes from exactly that point", async () => {
    const { runner, index, status } = setup([step("a", { hold: 1000 }), step("b", { hold: 1000 })]);
    runner.start();
    await advance(400);
    runner.pause();
    expect(status()).toBe("paused");
    await advance(10_000);
    expect(index()).toBe(0);

    runner.resume();
    expect(status()).toBe("running");
    await advance(599);
    expect(index()).toBe(0);
    await advance(1);
    expect(index()).toBe(1);
  });

  it("pauses without telling the step when the user takes over (their click decides)", async () => {
    const events: string[] = [];
    const { runner, status } = setup([
      step("a", {
        hold: 1000,
        enter: async (ctx) => {
          ctx.onPause(() => events.push("paused"));
          ctx.onResume(() => events.push("resumed"));
        },
      }),
    ]);
    runner.start();
    await advance(0);
    runner.takeOver();
    expect(status()).toBe("paused");
    await advance(5000);
    expect(status()).toBe("paused");
    runner.resume();
    expect(events).toEqual(["resumed"]);
  });

  it("freezes waits inside a step and tells the step when it pauses and resumes", async () => {
    const events: string[] = [];
    const { runner } = setup([
      step("a", {
        hold: "until-done",
        enter: async (ctx) => {
          ctx.onPause(() => events.push("paused"));
          ctx.onResume(() => events.push("resumed"));
          await ctx.wait(500);
          events.push("waited");
        },
      }),
    ]);
    runner.start();
    await advance(300);
    runner.pause();
    await advance(1000);
    expect(events).toEqual(["paused"]);
    runner.toggle();
    await advance(199);
    expect(events).toEqual(["paused", "resumed"]);
    await advance(1);
    expect(events).toEqual(["paused", "resumed", "waited"]);
  });

  it("does not move on while paused, even when a step's work finishes", async () => {
    let finish = () => undefined as void;
    const { runner, index } = setup([
      step("a", { hold: "until-done", enter: () => new Promise<void>((resolve) => (finish = resolve)) }),
      step("b", { hold: 1000 }),
    ]);
    runner.start();
    await advance(0);
    runner.pause();
    finish();
    await advance(5000);
    expect(index()).toBe(0);
    runner.resume();
    await advance(0);
    expect(index()).toBe(1);
  });

  it("goes to the next step, aborting the one in flight and its timers", async () => {
    const signals: AbortSignal[] = [];
    const { app, runner, index } = setup([
      step("a", {
        hold: 5000,
        enter: async (ctx, signal) => {
          signals.push(signal);
          await ctx.wait(1000);
          ctx.app.log.push("late");
        },
      }),
      step("b", { hold: 3000 }),
      step("c", { hold: 1000 }),
    ]);
    runner.start();
    await advance(100);
    runner.next();
    await advance(0);
    expect(signals[0].aborted).toBe(true);
    expect(index()).toBe(1);
    await advance(2999);
    expect(index()).toBe(1);
    expect(app.log).toEqual(["b"]);
    await advance(1);
    expect(index()).toBe(2);
  });

  it("finishes when Next is pressed on the last step", async () => {
    const { runner, onEnd, status } = setup([step("a", { hold: 1000 })]);
    runner.start();
    runner.next();
    expect(status()).toBe("ended");
    expect(onEnd).toHaveBeenCalledWith("finished");
  });

  it("goes back a step, restarts a step, or restarts the tour, as each step says", async () => {
    const { app, runner, index } = setup([
      step("a", { hold: 1000, back: "tour" }),
      step("b", { hold: 1000, back: "tour" }),
      step("c", { hold: 1000, back: "restart" }),
      step("d", { hold: 1000 }),
    ]);
    runner.start(3);
    await advance(0);
    runner.previous();
    await advance(0);
    expect(index()).toBe(2);

    runner.previous();
    await advance(0);
    expect(index()).toBe(2);
    expect(app.log).toEqual(["d", "c", "c"]);

    runner.start(1);
    await advance(0);
    runner.previous();
    await advance(0);
    expect(index()).toBe(0);
    expect(app.log.at(-1)).toBe("a");
  });

  it("stays on the first step when going back from it", async () => {
    const { runner, index } = setup([step("a", { hold: 1000 }), step("b")]);
    runner.start();
    runner.previous();
    await advance(0);
    expect(index()).toBe(0);
  });

  it("carries on when Next or Previous is pressed while paused", async () => {
    const { runner, status, index } = setup([step("a", { hold: 1000 }), step("b", { hold: 1000 })]);
    runner.start();
    runner.pause();
    runner.next();
    expect(status()).toBe("running");
    expect(index()).toBe(1);
    await advance(1000);
    expect(status()).toBe("ended");
  });

  it("exits, aborting the step in flight and every timer it started", async () => {
    let signal: AbortSignal | undefined;
    const { app, runner, onEnd, status } = setup([
      step("a", {
        hold: 1000,
        enter: async (ctx, stepSignal) => {
          signal = stepSignal;
          await ctx.wait(500);
          ctx.app.log.push("after wait");
        },
      }),
      step("b"),
    ]);
    runner.start();
    await advance(100);
    runner.exit();
    expect(status()).toBe("ended");
    expect(onEnd).toHaveBeenCalledWith("exited");
    expect(signal?.aborted).toBe(true);
    await advance(10_000);
    expect(app.log).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ends the tour when a step fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { runner, onEnd, status } = setup([
      step("a", {
        enter: async () => {
          throw new Error("boom");
        },
      }),
      step("b"),
    ]);
    runner.start();
    await advance(0);
    expect(status()).toBe("ended");
    expect(onEnd).toHaveBeenCalledWith("failed");
    error.mockRestore();
  });

  it("lets a step end the tour itself", async () => {
    const { runner, onEnd } = setup([step("a", { hold: "until-done", enter: async (ctx) => ctx.exit() }), step("b")]);
    runner.start();
    await advance(0);
    expect(onEnd).toHaveBeenCalledWith("exited");
  });

  it("shows a step's target and caption, and lets the step change them while it runs", async () => {
    const { runner } = setup([
      step("a", {
        target: '[data-tour="form"]',
        hold: "until-done",
        enter: async (ctx) => {
          await ctx.wait(100);
          ctx.say("Routing a heavy truck…");
          ctx.spotlight(['[data-tour="pin"]', '[data-tour="row"]']);
          await ctx.wait(100);
          ctx.say(null);
          await ctx.wait(100);
        },
      }),
      step("b", { hold: 1000 }),
    ]);
    const entries: number[] = [];
    runner.subscribe(() => entries.push(runner.getSnapshot().entry));
    runner.start();
    expect(runner.getSnapshot()).toMatchObject({ target: '[data-tour="form"]', say: null });
    await advance(100);
    expect(runner.caption()).toBe("Routing a heavy truck…");
    expect(runner.getSnapshot().target).toEqual(['[data-tour="pin"]', '[data-tour="row"]']);
    await advance(100);
    expect(runner.caption()).toBe("Caption a");
    await advance(100);
    expect(runner.caption()).toBe("Caption b");
    expect(new Set(entries)).toEqual(new Set([1, 2]));
  });

  it("ignores an aborted step that tries to change the caption or the target", async () => {
    let late: Ctx | undefined;
    const { runner } = setup([
      step("a", {
        hold: 1000,
        enter: async (ctx) => {
          late = ctx;
        },
      }),
      step("b", { hold: 1000, target: "b" }),
    ]);
    runner.start();
    await advance(0);
    runner.next();
    late?.say("stale");
    late?.spotlight("stale");
    expect(runner.caption()).toBe("Caption b");
    expect(runner.getSnapshot().target).toBe("b");
  });

  it("scales every wait by the speed", async () => {
    const { runner, index } = setup([step("a", { hold: 1000 }), step("b", { hold: 1000 })], { speed: 4 });
    runner.start();
    await advance(249);
    expect(index()).toBe(0);
    await advance(1);
    expect(index()).toBe(1);
  });

  it("animates over frames, freezing while paused", async () => {
    const progress: number[] = [];
    const { runner } = setup([
      step("a", { hold: "until-done", enter: (ctx) => ctx.animate(160, (p) => progress.push(p)) }),
      step("b", { hold: 1000 }),
    ]);
    runner.start();
    await advance(80);
    const before = progress.at(-1) ?? 0;
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(1);
    runner.pause();
    await advance(1000);
    expect(progress.at(-1)).toBe(before);
    runner.resume();
    await advance(200);
    expect(progress.at(-1)).toBe(1);
    expect(progress).toEqual([...progress].sort((x, y) => x - y));
  });

  it("jumps straight to the end of an animation under reduced motion, keeping its timing", async () => {
    const progress: number[] = [];
    const { runner, index } = setup(
      [
        step("a", { hold: "until-done", enter: (ctx) => ctx.animate(1000, (p) => progress.push(p)) }),
        step("b", { hold: 1000 }),
      ],
      { reducedMotion: true },
    );
    runner.start();
    await advance(0);
    expect(progress).toEqual([1]);
    await advance(999);
    expect(index()).toBe(0);
    await advance(1);
    expect(index()).toBe(1);
  });
});

/** A voice whose clips last what the test says, in fake-timer time (no entry: no clip to hear). */
function fakeVoice(clips: Record<string, number>) {
  const clock = createPausableClock(scheduler);
  const log: string[] = [];
  let playing: AbortController | null = null;
  const voice: TourVoice = {
    play(id) {
      voice.stop();
      if (!(id in clips)) return Promise.resolve(false);
      log.push(`play ${id}`);
      const clip = new AbortController();
      playing = clip;
      return clock.sleep(clips[id], clip.signal).then(
        () => {
          playing = null;
          log.push(`end ${id}`);
          return true;
        },
        () => false,
      );
    },
    pause() {
      if (playing) log.push("pause");
      clock.pause();
    },
    resume() {
      if (playing) log.push("resume");
      clock.resume();
    },
    stop() {
      if (playing) log.push("stop");
      playing?.abort();
      playing = null;
    },
    preload: (ids) => void log.push(`preload ${ids.join(" ")}`),
  };
  const heard = () => log.filter((entry) => !entry.startsWith("preload"));
  return { voice, log, heard };
}

describe("createTourRunner with a voice", () => {
  it("starts a step's clip with the step, and waits for it and a breath after when it outlasts the hold", async () => {
    expect(AFTER_CLIP).toBe(400);
    const { voice, heard } = fakeVoice({ a: 3000, b: 500 });
    const { runner, index } = setup([step("a", { hold: 1000 }), step("b", { hold: 1000 })], { narrator: voice });
    runner.start();
    expect(heard()).toEqual(["play a"]);
    await advance(3000 + AFTER_CLIP - 1);
    expect(index()).toBe(0);
    await advance(1);
    expect(index()).toBe(1);
    expect(heard()).toEqual(["play a", "end a", "play b"]);
  });

  it("keeps a step's own hold when its clip is shorter", async () => {
    const { voice } = fakeVoice({ a: 300 });
    const { runner, index } = setup(
      [step("a", { hold: 1000, enter: (ctx) => ctx.wait(500) }), step("b", { hold: 1000 })],
      { narrator: voice },
    );
    runner.start();
    await advance(1499);
    expect(index()).toBe(0);
    await advance(1);
    expect(index()).toBe(1);
  });

  it("keeps today's timing exactly when nothing is heard (voice off, a missing clip)", async () => {
    for (const narrator of [undefined, fakeVoice({}).voice]) {
      const { runner, index, status } = setup(
        [step("a", { hold: 100 }), step("b", { hold: 50 }), step("c", { hold: 20 })],
        { narrator },
      );
      runner.start();
      await advance(99);
      expect(index()).toBe(0);
      await advance(1);
      expect(index()).toBe(1);
      await advance(49);
      expect(index()).toBe(1);
      await advance(1);
      expect(index()).toBe(2);
      await advance(19);
      expect(status()).toBe("running");
      await advance(1);
      expect(status()).toBe("ended");
    }
  });

  it("waits for both the work and the clip of a step that runs until it is done", async () => {
    let finish = () => undefined as void;
    const { voice } = fakeVoice({ plan: 2000 });
    const { runner, index } = setup(
      [
        step("plan", { hold: "until-done", enter: () => new Promise<void>((resolve) => (finish = resolve)) }),
        step("results", { hold: 1000 }),
      ],
      { narrator: voice },
    );
    runner.start();
    await advance(500);
    finish();
    await advance(1500 + AFTER_CLIP - 1);
    expect(index()).toBe(0);
    await advance(1);
    expect(index()).toBe(1);

    runner.previous();
    await advance(60_000);
    expect(index()).toBe(0);
    finish();
    await advance(0);
    expect(index()).toBe(1);
  });

  it("pauses the clip with the tour, and resumes it", async () => {
    const { voice, heard } = fakeVoice({ a: 2000 });
    const { runner, index } = setup([step("a", { hold: 500 }), step("b", { hold: 1000 })], { narrator: voice });
    runner.start();
    await advance(1000);
    runner.pause();
    expect(heard()).toEqual(["play a", "pause"]);
    await advance(10_000);
    expect(index()).toBe(0);
    runner.resume();
    expect(heard()).toEqual(["play a", "pause", "resume"]);
    await advance(1000 + AFTER_CLIP - 1);
    expect(index()).toBe(0);
    await advance(1);
    expect(index()).toBe(1);
  });

  it("pauses the clip when the user takes over, and the breath after a clip too", async () => {
    const { voice, heard } = fakeVoice({ a: 1000 });
    const { runner, index } = setup([step("a", { hold: 500 }), step("b", { hold: 1000 })], { narrator: voice });
    runner.start();
    await advance(400);
    runner.takeOver();
    expect(heard()).toEqual(["play a", "pause"]);
    runner.resume();
    await advance(600 + 100);
    runner.pause();
    await advance(10_000);
    expect(index()).toBe(0);
    runner.resume();
    await advance(AFTER_CLIP - 100);
    expect(index()).toBe(1);
  });

  it("stops the clip at once on Next, Previous and Exit", async () => {
    const { voice, heard } = fakeVoice({ a: 5000, b: 5000 });
    const { runner, index, status } = setup([step("a", { hold: 1000 }), step("b", { hold: 1000 })], {
      narrator: voice,
    });
    runner.start();
    await advance(100);
    runner.next();
    expect(heard()).toEqual(["play a", "stop", "play b"]);
    expect(index()).toBe(1);
    await advance(100);
    runner.previous();
    expect(heard().slice(3)).toEqual(["stop", "play a"]);
    await advance(100);
    runner.exit();
    expect(heard().slice(5)).toEqual(["stop"]);
    expect(status()).toBe("ended");
    await advance(60_000);
    expect(heard()).toHaveLength(6);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts the next step's clip unpaused when Next is pressed while paused", async () => {
    const { voice, heard } = fakeVoice({ a: 5000, b: 1000 });
    const { runner, status } = setup([step("a", { hold: 1000 }), step("b", { hold: 500 })], { narrator: voice });
    runner.start();
    await advance(100);
    runner.pause();
    runner.next();
    expect(heard()).toEqual(["play a", "pause", "stop", "play b"]);
    await advance(1000 + AFTER_CLIP);
    expect(status()).toBe("ended");
  });

  it("lets a step speak a second clip after its own, if it still applies by then, and waits for that too", async () => {
    let pending = true;
    const { voice, heard } = fakeVoice({ plan: 1000, planning: 3000, quick: 1000 });
    const second = (ctx: Ctx) => ctx.narrate("planning", () => pending);
    const { runner, index } = setup(
      [
        step("plan", { hold: "until-done", enter: async (ctx) => second(ctx) }),
        step("quick", { hold: "until-done", enter: async (ctx) => second(ctx) }),
        step("after", { hold: 1000 }),
      ],
      { narrator: voice },
    );
    runner.start();
    await advance(1000 + AFTER_CLIP - 1);
    expect(heard()).toEqual(["play plan", "end plan"]);
    await advance(1);
    expect(heard()).toEqual(["play plan", "end plan", "play planning"]);
    await advance(3000 + AFTER_CLIP - 1);
    expect(index()).toBe(0);
    await advance(1);
    expect(index()).toBe(1);

    // The answer comes while the step's own clip is still playing: the second clip is skipped.
    pending = false;
    await advance(1000 + AFTER_CLIP);
    expect(index()).toBe(2);
    expect(heard().slice(4)).toEqual(["play quick", "end quick"]);
  });

  it("does not speak a second clip for a step that has been left", async () => {
    let late: Ctx | undefined;
    const { voice, heard } = fakeVoice({ a: 1000, b: 1000, late: 1000 });
    const { runner } = setup(
      [step("a", { hold: 1000, enter: async (ctx) => void (late = ctx) }), step("b", { hold: 5000 })],
      { narrator: voice },
    );
    runner.start();
    await advance(0);
    runner.next();
    late?.narrate("late");
    await advance(5000);
    expect(heard()).toEqual(["play a", "stop", "play b", "end b"]);
  });

  it("fetches the clips of the next two steps ahead, with any second clips they speak", async () => {
    const { voice, log } = fakeVoice({});
    const { runner } = setup(
      [step("a", { hold: 100 }), step("b", { hold: 100, clips: ["b-more"] }), step("c", { hold: 100 }), step("d")],
      { narrator: voice },
    );
    runner.start();
    await advance(250);
    expect(log.filter((entry) => entry.startsWith("preload"))).toEqual([
      "preload b b-more c",
      "preload c d",
      "preload d",
    ]);
  });
});

describe("createPausableClock", () => {
  it("sleeps, freezes the remaining time while paused, and rejects when aborted", async () => {
    const clock = createPausableClock(scheduler);
    const controller = new AbortController();
    const done = vi.fn();
    void clock.sleep(1000, controller.signal).then(done);
    await advance(600);
    clock.pause();
    await advance(5000);
    expect(done).not.toHaveBeenCalled();
    clock.resume();
    await advance(400);
    expect(done).toHaveBeenCalled();

    const aborted = clock.sleep(1000, controller.signal);
    controller.abort();
    await expect(aborted).rejects.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("holds the gate shut while paused", async () => {
    const clock = createPausableClock(scheduler);
    const through = vi.fn();
    await clock.gate(new AbortController().signal);
    clock.pause();
    void clock.gate(new AbortController().signal).then(through);
    await advance(1000);
    expect(through).not.toHaveBeenCalled();
    clock.resume();
    await advance(0);
    expect(through).toHaveBeenCalled();
  });
});

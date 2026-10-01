import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Scheduler, createPausableClock } from "./runner";
import { TYPE_DELAY, typeText, typingTime } from "./typing";

const scheduler: Scheduler = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  requestFrame: (callback) => setTimeout(callback, 16),
  cancelFrame: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function setup() {
  const clock = createPausableClock(scheduler);
  const controller = new AbortController();
  const typed: string[] = [];
  const wait = (ms: number) => clock.sleep(ms, controller.signal);
  return { clock, controller, typed, wait, onType: (text: string) => typed.push(text) };
}

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("typeText", () => {
  it("types one character at a time, about 80 ms apart", async () => {
    expect(TYPE_DELAY).toBe(80);
    const { typed, wait, onType } = setup();
    const done = vi.fn();
    void typeText({ text: "Dallas", onType, wait }).then(done);
    await advance(TYPE_DELAY - 1);
    expect(typed).toEqual([]);
    await advance(1);
    expect(typed).toEqual(["D"]);
    await advance(TYPE_DELAY * 5);
    expect(typed).toEqual(["D", "Da", "Dal", "Dall", "Dalla", "Dallas"]);
    expect(done).toHaveBeenCalled();
  });

  it("hesitates a little after a comma, like a person typing", async () => {
    const { typed, wait, onType } = setup();
    void typeText({ text: "TX, A", onType, wait });
    await advance(TYPE_DELAY * 3);
    expect(typed.at(-1)).toBe("TX,");
    await advance(TYPE_DELAY);
    expect(typed.at(-1)).toBe("TX,");
    expect(typingTime("TX, A")).toBeGreaterThan(TYPE_DELAY * 5);
    await advance(typingTime("TX, A"));
    expect(typed.at(-1)).toBe("TX, A");
  });

  it("stops typing while paused and carries on when resumed", async () => {
    const { clock, typed, wait, onType } = setup();
    void typeText({ text: "Chicago", onType, wait });
    await advance(TYPE_DELAY * 2 + 30);
    clock.pause();
    await advance(5000);
    expect(typed).toEqual(["C", "Ch"]);
    clock.resume();
    await advance(TYPE_DELAY - 30);
    expect(typed.at(-1)).toBe("Chi");
  });

  it("stops cleanly when aborted", async () => {
    const { controller, typed, wait, onType } = setup();
    const typing = typeText({ text: "Chicago", onType, wait });
    await advance(TYPE_DELAY * 3);
    controller.abort();
    await expect(typing).rejects.toThrow();
    await advance(5000);
    expect(typed).toEqual(["C", "Ch", "Chi"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows the whole text at once under reduced motion, taking the same time", async () => {
    const { typed, wait, onType } = setup();
    const done = vi.fn();
    void typeText({ text: "Dallas", onType, wait, reducedMotion: true }).then(done);
    await advance(0);
    expect(typed).toEqual(["Dallas"]);
    await advance(typingTime("Dallas") - 1);
    expect(done).not.toHaveBeenCalled();
    await advance(1);
    expect(done).toHaveBeenCalled();
  });
});

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SPEEDS, TRIP_PLAY_MS, usePlayback } from "./usePlayback";

const TOTAL = 1440; // a 24-hour trip: 1× plays 60 trip-minutes per real second
const STEPS = [300, 900, 1440];

/** A hand-cranked requestAnimationFrame: frames run only when a test calls frame(ms). */
const raf = {
  callbacks: new Map<number, FrameRequestCallback>(),
  nextId: 1,
  now: 0,
};

function frame(ms = 16) {
  raf.now += ms;
  const pending = [...raf.callbacks.values()];
  raf.callbacks.clear();
  act(() => pending.forEach((callback) => callback(raf.now)));
}

/** Real time passing in 20 ms frames (frames longer than 100 ms are capped, like a background tab). */
function run(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 20) frame(20);
}

/** A prefers-reduced-motion media query the test can flip, telling its listeners like a browser would. */
function reducedMotion(reduce: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: reduce,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media: string) => (media.includes("prefers-reduced-motion") ? query : { matches: false })),
  );
  return {
    set(next: boolean) {
      query.matches = next;
      act(() => listeners.forEach((listener) => listener()));
    },
  };
}

function setup(total = TOTAL, resetKey: unknown = "trip-1") {
  return renderHook((props: { total: number; resetKey: unknown }) => usePlayback({ ...props, steps: STEPS }), {
    initialProps: { total, resetKey },
  });
}

beforeEach(() => {
  raf.callbacks.clear();
  raf.now = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = raf.nextId++;
    raf.callbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => raf.callbacks.delete(id));
  reducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("usePlayback", () => {
  it("starts paused, at the start, not yet in use", () => {
    const { result } = setup();
    expect(result.current).toMatchObject({ playing: false, t: 0, active: false, ended: false, speed: 1 });
  });

  it("plays the whole trip in about 24 seconds, whatever its length", () => {
    expect(TRIP_PLAY_MS).toBe(24_000);
    const { result } = setup();
    act(() => result.current.play());
    expect(result.current).toMatchObject({ playing: true, active: true });
    frame(0); // the first frame only sets the clock
    run(1000);
    expect(result.current.t).toBeCloseTo(TOTAL / 24, 6);
    run(500);
    expect(result.current.t).toBeCloseTo(TOTAL / 16, 6);
  });

  it("does not leap ahead after a long gap between frames (a background tab)", () => {
    const { result } = setup();
    act(() => result.current.play());
    frame(0);
    frame(60_000);
    expect(result.current.t).toBeLessThan(TOTAL / 4);
    expect(result.current.playing).toBe(true);
  });

  it("pauses, and cancels the pending frame", () => {
    const { result } = setup();
    act(() => result.current.play());
    frame(0);
    run(1000);
    act(() => result.current.pause());
    const at = result.current.t;
    expect(raf.callbacks.size).toBe(0);
    run(1000);
    expect(result.current).toMatchObject({ playing: false, t: at, active: true });
  });

  it("seeks within the trip only", () => {
    const { result } = setup();
    act(() => result.current.seek(600));
    expect(result.current.t).toBe(600);
    act(() => result.current.seek(-15));
    expect(result.current.t).toBe(0);
    act(() => result.current.seek(99_999));
    expect(result.current.t).toBe(TOTAL);
  });

  it("keeps playing from where the user seeks", () => {
    const { result } = setup();
    act(() => result.current.play());
    frame(0);
    act(() => result.current.seek(900));
    run(1000);
    expect(result.current.t).toBeCloseTo(960, 6);
  });

  it("stops at the end, and plays again from the start", () => {
    const { result } = setup();
    act(() => result.current.play());
    frame(0);
    run(30_000);
    expect(result.current).toMatchObject({ playing: false, t: TOTAL });
    expect(raf.callbacks.size).toBe(0);

    act(() => result.current.play());
    expect(result.current).toMatchObject({ playing: true, t: 0 });
  });

  it("cycles ½×, 1× and 2×, and plays at that speed", () => {
    expect(SPEEDS).toEqual([0.5, 1, 2]);
    const { result } = setup();
    act(() => result.current.cycleSpeed());
    expect(result.current.speed).toBe(2);
    act(() => result.current.play());
    frame(0);
    run(1000);
    expect(result.current.t).toBeCloseTo(TOTAL / 12, 6);
    act(() => result.current.cycleSpeed());
    expect(result.current.speed).toBe(0.5);
    act(() => result.current.cycleSpeed());
    expect(result.current.speed).toBe(1);
  });

  it("sets a speed directly", () => {
    const { result } = setup();
    act(() => result.current.setSpeed(2));
    expect(result.current.speed).toBe(2);
    act(() => result.current.setSpeed(1));
    expect(result.current.speed).toBe(1);
  });

  it("steps from stop to stop about once a second when the user prefers reduced motion", () => {
    reducedMotion(true);
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { result } = setup();
    act(() => result.current.play());
    expect(raf.callbacks.size).toBe(0); // no continuous animation

    act(() => vi.advanceTimersByTime(999));
    expect(result.current.t).toBe(0);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.t).toBe(300);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.t).toBe(900);
    act(() => result.current.seek(1000));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toMatchObject({ t: TOTAL, playing: false });
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.t).toBe(TOTAL);
  });

  it("steps faster or slower with the speed under reduced motion", () => {
    reducedMotion(true);
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { result } = setup();
    act(() => result.current.cycleSpeed()); // 2×
    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.t).toBe(300);
    act(() => result.current.cycleSpeed()); // ½×
    act(() => vi.advanceTimersByTime(1999));
    expect(result.current.t).toBe(300);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.t).toBe(900);
  });

  it("follows a change to the reduced-motion setting while playing", () => {
    const media = reducedMotion(false);
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { result } = setup();
    act(() => result.current.play());
    frame(0);
    run(1000);
    expect(raf.callbacks.size).toBe(1);

    media.set(true);
    expect(raf.callbacks.size).toBe(0);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.t).toBe(300);

    media.set(false);
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.t).toBe(300);
    frame(0);
    run(1000);
    expect(result.current.t).toBeCloseTo(360, 6);
  });

  it("flags an ending reached by playing, until the replay moves again", () => {
    const { result } = setup();
    act(() => result.current.seek(TOTAL));
    expect(result.current.ended).toBe(false); // scrubbed there, not played there
    act(() => result.current.play());
    frame(0);
    run(30_000);
    expect(result.current).toMatchObject({ playing: false, ended: true });
    act(() => result.current.seek(600));
    expect(result.current.ended).toBe(false);
    act(() => result.current.seek(TOTAL - 15));
    act(() => result.current.play());
    frame(0);
    run(2_000);
    expect(result.current.ended).toBe(true);
    act(() => result.current.play());
    expect(result.current).toMatchObject({ ended: false, t: 0 });
    act(() => result.current.reset());
    expect(result.current.ended).toBe(false);
  });

  it("resets when the trip changes", () => {
    const { result, rerender } = setup();
    act(() => result.current.play());
    frame(0);
    run(1000);
    rerender({ total: 2000, resetKey: "trip-2" });
    expect(result.current).toMatchObject({ playing: false, t: 0, active: false });
    expect(raf.callbacks.size).toBe(0);

    act(() => result.current.play());
    frame(0);
    run(1000);
    expect(result.current.t).toBeCloseTo(2000 / 24, 6);
  });

  it("resets on demand", () => {
    const { result } = setup();
    act(() => result.current.play());
    frame(0);
    run(1000);
    act(() => result.current.reset());
    expect(result.current).toMatchObject({ playing: false, t: 0, active: false });
    expect(raf.callbacks.size).toBe(0);
  });

  it("cancels the animation frame on unmount", () => {
    const { result, unmount } = setup();
    act(() => result.current.play());
    frame(0);
    expect(raf.callbacks.size).toBe(1);
    unmount();
    expect(raf.callbacks.size).toBe(0);
  });
});

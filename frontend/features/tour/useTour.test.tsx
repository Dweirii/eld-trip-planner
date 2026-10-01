import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TourController } from "./controller";
import type { Scheduler, TourStep } from "./runner";
import { tourSpeed, useTour } from "./useTour";

const navigation = vi.hoisted(() => {
  const replace = vi.fn();
  return { pathname: "/", search: "", replace, router: { replace } };
});

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => navigation.router,
}));

const scheduler: Scheduler = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  requestFrame: (callback) => setTimeout(callback, 16),
  cancelFrame: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const steps: TourStep<TourController>[] = ["One", "Two", "Three"].map((caption) => ({
  id: caption.toLowerCase(),
  caption: () => caption,
  hold: 5000,
  enter: async () => undefined,
}));

const controller = {} as TourController;

function open(url: string) {
  const [pathname, search = ""] = url.split("?");
  navigation.pathname = pathname;
  navigation.search = search;
  window.history.replaceState(null, "", url);
}

function setup(url = "/?tour=1") {
  open(url);
  return renderHook(() => useTour(controller, { steps, scheduler }));
}

const key = (target: Element, name: string) => act(() => void fireEvent.keyDown(target, { key: name }));

beforeEach(() => {
  vi.useFakeTimers();
  navigation.replace.mockReset();
  window.localStorage.clear();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("useTour", () => {
  it("starts on ?tour=1 and strips the param, so a reload doesn't restart it", () => {
    const { result } = setup("/?tour=1");
    expect(result.current).toMatchObject({ active: true, index: 0, total: 3, caption: "One", paused: false });
    expect(window.location.pathname + window.location.search).toBe("/");
  });

  it("stays out of the way without the param", () => {
    const { result } = setup("/");
    expect(result.current.active).toBe(false);
  });

  it("starts a saved trip's tour from a fresh planner at /", () => {
    const { result } = setup("/trips/abc123?tour=1");
    expect(navigation.replace).toHaveBeenCalledWith("/?tour=1");
    expect(result.current.active).toBe(false);
  });

  it("moves on by itself, step by step", async () => {
    const { result } = setup();
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(result.current.caption).toBe("Two");
  });

  it("pauses and resumes with Space, steps with the arrows, and exits with Escape", async () => {
    const { result } = setup();
    key(document.body, " ");
    expect(result.current.paused).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(result.current.caption).toBe("One");
    key(document.body, " ");
    expect(result.current.paused).toBe(false);

    key(document.body, "ArrowRight");
    expect(result.current.caption).toBe("Two");
    key(document.body, "ArrowRight");
    expect(result.current.caption).toBe("Three");
    key(document.body, "ArrowLeft");
    expect(result.current.caption).toBe("Two");

    key(document.body, "Escape");
    expect(result.current.active).toBe(false);
  });

  it("toggles the captions with C and remembers the choice", () => {
    const { result, unmount } = setup();
    expect(result.current.captions).toBe(true);
    key(document.body, "c");
    expect(result.current.captions).toBe(false);
    unmount();

    const again = setup();
    expect(again.result.current.captions).toBe(false);
    key(document.body, "C");
    expect(again.result.current.captions).toBe(true);
  });

  it("leaves the keys alone while the user types in a field", () => {
    const { result } = setup();
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    for (const name of [" ", "ArrowRight", "c", "Escape"]) key(input, name);
    expect(result.current).toMatchObject({ active: true, paused: false, caption: "One", captions: true });
  });

  it("leaves arrow keys to tabs and sliders, and ignores shortcuts with a modifier", () => {
    const { result } = setup();
    const tab = document.createElement("button");
    tab.setAttribute("role", "tab");
    document.body.append(tab);
    key(tab, "ArrowRight");
    act(() => void fireEvent.keyDown(document.body, { key: "c", metaKey: true }));
    expect(result.current).toMatchObject({ caption: "One", captions: true });
  });

  it("pauses when the user clicks in the app, but not on the tour's own controls", () => {
    const { result } = setup();
    const controls = document.createElement("div");
    controls.dataset.tourUi = "";
    const button = document.createElement("button");
    controls.append(button);
    document.body.append(controls);
    act(() => void fireEvent.pointerDown(button));
    expect(result.current.paused).toBe(false);

    act(() => void fireEvent.pointerDown(document.body));
    expect(result.current.paused).toBe(true);
  });

  it("ends the tour when the page goes away", () => {
    const { result, unmount } = setup();
    const exit = result.current.exit;
    unmount();
    expect(() => exit()).not.toThrow();
  });
});

describe("tourSpeed", () => {
  it("reads the test-only speed-up, clamped to 1–20", () => {
    expect(tourSpeed(null)).toBe(1);
    expect(tourSpeed("4")).toBe(4);
    expect(tourSpeed("0")).toBe(1);
    expect(tourSpeed("100")).toBe(20);
    expect(tourSpeed("fast")).toBe(1);
  });
});

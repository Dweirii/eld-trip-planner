import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TourController } from "./controller";
import type { Scheduler, TourStep } from "./runner";
import { TOUR_UI_ATTRIBUTE, tourSpeed, useTour } from "./useTour";

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

  it("treats typing in a field as the user taking over: it pauses, and leaves the keys to the field", () => {
    const { result } = setup();
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    for (const name of [" ", "ArrowRight", "c", "Escape"]) key(input, name);
    expect(result.current).toMatchObject({ active: true, paused: true, caption: "One", captions: true });
  });

  it("leaves arrow keys to tabs and sliders, pausing for the user instead of changing step", () => {
    const { result } = setup();
    for (const role of ["tab", "slider"]) {
      const control = document.createElement("div");
      control.setAttribute("role", role);
      control.tabIndex = 0;
      document.body.append(control);
      key(control, "ArrowRight");
    }
    expect(result.current).toMatchObject({ caption: "One", paused: true });
  });

  it("leaves Space to a focused button, link or tab: no toggle, the user takes over", () => {
    const { result } = setup();
    const controls = ["button", "a", "summary"].map((tag) => {
      const element = document.createElement(tag);
      if (element instanceof HTMLAnchorElement) element.href = "#stop";
      document.body.append(element);
      return element;
    });
    const tab = document.createElement("div");
    tab.setAttribute("role", "tab");
    document.body.append(tab);

    key(document.body, " ");
    expect(result.current.paused).toBe(true);
    for (const control of [...controls, tab]) {
      const notCancelled = fireEvent.keyDown(control, { key: " " });
      expect(notCancelled).toBe(true);
      expect(result.current.paused).toBe(true);
    }
  });

  it("leaves Space and Enter on its own controls to them, and does not count them as taking over", () => {
    const { result } = setup();
    const tourUi = document.createElement("div");
    tourUi.setAttribute(TOUR_UI_ATTRIBUTE, "");
    const pause = document.createElement("button");
    tourUi.append(pause);
    document.body.append(tourUi);
    expect(fireEvent.keyDown(pause, { key: " " })).toBe(true);
    expect(fireEvent.keyDown(pause, { key: "Enter" })).toBe(true);
    expect(result.current.paused).toBe(false);
    key(pause, "ArrowRight");
    expect(result.current.caption).toBe("Two");
  });

  it("pauses when the user works the app from the keyboard", () => {
    for (const [tag, name] of [
      ["button", "Enter"],
      ["button", " "],
      ["input", "x"],
      ["body", "Tab"],
    ] as const) {
      const { result, unmount } = setup();
      const target = tag === "body" ? document.body : document.body.appendChild(document.createElement(tag));
      key(target, name);
      expect(result.current.paused, `${name} on ${tag}`).toBe(true);
      unmount();
    }
  });

  it("ignores a lone modifier and browser shortcuts with one", () => {
    const { result } = setup();
    for (const name of ["Shift", "Control", "Alt", "Meta"]) key(document.body, name);
    act(() => void fireEvent.keyDown(document.body, { key: "c", metaKey: true }));
    act(() => void fireEvent.keyDown(document.body, { key: "Tab", ctrlKey: true }));
    expect(result.current).toMatchObject({ paused: false, caption: "One", captions: true });
  });

  it("leaves every key to an open dialog", () => {
    const { result } = setup();
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    const button = document.createElement("button");
    dialog.append(button);
    document.body.append(dialog);
    for (const name of [" ", "ArrowRight", "c", "Escape", "Enter"]) key(document.body, name);
    key(button, "Enter");
    expect(result.current).toMatchObject({ active: true, paused: false, caption: "One", captions: true });
  });

  it("carries on when Next or Previous is pressed while paused", () => {
    const { result } = setup();
    key(document.body, " ");
    expect(result.current.paused).toBe(true);
    key(document.body, "ArrowRight");
    expect(result.current).toMatchObject({ paused: false, caption: "Two" });
    key(document.body, " ");
    key(document.body, "ArrowLeft");
    expect(result.current).toMatchObject({ paused: false, caption: "One" });
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

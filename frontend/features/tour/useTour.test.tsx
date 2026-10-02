import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TourController } from "./controller";
import { SEEN_KEY, createInviteStore, invitation } from "./invite";
import type { Narrator } from "./narrator";
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

/** A narrator with no sound: it notes the clips that would be heard, and each step keeps its own hold. */
function fakeNarrator() {
  const listeners = new Set<() => void>();
  const tell = () => listeners.forEach((listener) => listener());
  const narrator = {
    enabled: true,
    blocked: false,
    heard: [] as string[],
    async play(id: string) {
      if (narrator.enabled && !narrator.blocked) narrator.heard.push(id);
      return false;
    },
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    preload: vi.fn(),
    setEnabled(enabled: boolean) {
      narrator.enabled = enabled;
    },
    /** The browser's autoplay policy refuses to play. */
    block() {
      narrator.blocked = true;
      tell();
    },
    unblock: vi.fn(() => {
      narrator.blocked = false;
      tell();
    }),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  return narrator satisfies Narrator;
}

let narrator = fakeNarrator();
let invite = createInviteStore();

function setup(url = "/?tour=1") {
  open(url);
  narrator = fakeNarrator();
  invite = createInviteStore();
  const voice = narrator;
  const store = invite;
  return renderHook(() => useTour(controller, { steps, scheduler, narrator: voice, invite: store }));
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

  it("tells the invitation when a tour starts, so it stops inviting, now and on later visits", () => {
    const idle = setup("/");
    expect(invitation(invite.getSnapshot(), "/")).toEqual({ live: true, bubble: true });
    expect(window.localStorage.getItem(SEEN_KEY)).toBeNull();
    idle.unmount();

    setup("/?tour=1");
    expect(invitation(invite.getSnapshot(), "/").live).toBe(false);
    expect(window.localStorage.getItem(SEEN_KEY)).not.toBeNull();
    key(document.body, "Escape");
    expect(invitation(invite.getSnapshot(), "/").live).toBe(false);
    expect(invitation(createInviteStore().getSnapshot(), "/").live).toBe(false);
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

  it("speaks each step, with the voice on unless it was turned off", () => {
    const { result } = setup();
    expect(result.current).toMatchObject({ voice: true, voiceBlocked: false });
    expect(narrator.heard).toEqual(["one"]);
    key(document.body, "ArrowRight");
    expect(narrator.heard).toEqual(["one", "two"]);
  });

  it("toggles the voice with V and remembers the choice", () => {
    const { result, unmount } = setup();
    key(document.body, "v");
    expect(result.current.voice).toBe(false);
    expect(narrator.enabled).toBe(false);
    key(document.body, "ArrowRight");
    expect(narrator.heard).toEqual(["one"]);
    unmount();

    // Off from the first step of the next tour.
    const again = setup();
    expect(again.result.current.voice).toBe(false);
    expect(narrator.heard).toEqual([]);
    key(document.body, "V");
    expect(again.result.current.voice).toBe(true);
    key(document.body, "ArrowRight");
    expect(narrator.heard).toEqual(["two"]);
  });

  it("forces the voice off under the test-only speed-up, for the whole run, and leaves the choice alone", () => {
    const { result, rerender } = setup("/?tour=1&tourSpeed=4");
    expect(result.current.voice).toBe(false);
    // The workspace strips the params once the tour has started.
    navigation.search = "";
    rerender();
    key(document.body, "v");
    key(document.body, "ArrowRight");
    expect(result.current).toMatchObject({ caption: "Two", voice: false });
    expect(narrator.heard).toEqual([]);
    expect(window.localStorage.getItem("milepost:tour-voice")).toBeNull();
  });

  it("carries on in silence when the browser blocks autoplay, until the voice button is clicked", () => {
    const { result } = setup();
    act(() => narrator.block());
    expect(result.current).toMatchObject({ voice: true, voiceBlocked: true, caption: "One", paused: false });
    key(document.body, "ArrowRight");
    expect(narrator.heard).toEqual(["one"]);

    // The first click unblocks it and leaves the voice on: audio from the next step.
    act(() => result.current.toggleVoice());
    expect(narrator.unblock).toHaveBeenCalledOnce();
    expect(result.current).toMatchObject({ voice: true, voiceBlocked: false });
    key(document.body, "ArrowRight");
    expect(narrator.heard).toEqual(["one", "three"]);

    act(() => result.current.toggleVoice());
    expect(result.current.voice).toBe(false);
  });

  it("stops the voice when the tour ends or the page goes away", () => {
    setup();
    narrator.stop.mockClear();
    key(document.body, "Escape");
    expect(narrator.stop).toHaveBeenCalled();

    const { unmount } = setup();
    narrator.stop.mockClear();
    unmount();
    expect(narrator.stop).toHaveBeenCalled();
  });

  it("treats typing in a field as the user taking over: it pauses, and leaves the keys to the field", () => {
    const { result } = setup();
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    for (const name of [" ", "ArrowRight", "c", "v", "Escape"]) key(input, name);
    expect(result.current).toMatchObject({ active: true, paused: true, caption: "One", captions: true, voice: true });
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
    act(() => void fireEvent.keyDown(document.body, { key: "v", ctrlKey: true }));
    act(() => void fireEvent.keyDown(document.body, { key: "Tab", ctrlKey: true }));
    expect(result.current).toMatchObject({ paused: false, caption: "One", captions: true, voice: true });
  });

  it("leaves every key to an open dialog", () => {
    const { result } = setup();
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    const button = document.createElement("button");
    dialog.append(button);
    document.body.append(dialog);
    for (const name of [" ", "ArrowRight", "c", "v", "Escape", "Enter"]) key(document.body, name);
    key(button, "Enter");
    expect(result.current).toMatchObject({ active: true, paused: false, caption: "One", captions: true, voice: true });
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

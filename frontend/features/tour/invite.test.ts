import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DISMISSED_KEY, SEEN_KEY, createInviteStore, invitation } from "./invite";

function open(url: string) {
  window.history.replaceState(null, "", url);
}

/** What a page at `pathname` shows. */
function shown(store: ReturnType<typeof createInviteStore>, pathname = "/") {
  return invitation(store.getSnapshot(), pathname);
}

beforeEach(() => {
  window.localStorage.clear();
  open("/");
});

afterEach(() => vi.restoreAllMocks());

describe("the tour invitation", () => {
  it("is live on a first visit to the planner: the pulse and the bubble", () => {
    expect(shown(createInviteStore())).toEqual({ live: true, bubble: true });
  });

  it("only pulses on a saved trip's page, and is not live anywhere else", () => {
    const store = createInviteStore();
    expect(shown(store, "/trips/abc123")).toEqual({ live: true, bubble: false });
    expect(shown(store, "/trips")).toEqual({ live: false, bubble: false });
    expect(shown(store, "/somewhere")).toEqual({ live: false, bubble: false });
  });

  it("is not live on the server, or before the page knows what the browser remembers", () => {
    const store = createInviteStore();
    expect(invitation(store.getServerSnapshot(), "/")).toEqual({ live: false, bubble: false });
  });

  it("is not live once the tour has been seen", () => {
    window.localStorage.setItem(SEEN_KEY, "1");
    expect(shown(createInviteStore())).toEqual({ live: false, bubble: false });
  });

  it("stops being live when a tour starts, remembers that, and tells its listeners", () => {
    const store = createInviteStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.tourStarted();
    expect(listener).toHaveBeenCalledOnce();
    expect(shown(store)).toEqual({ live: false, bubble: false });
    expect(window.localStorage.getItem(SEEN_KEY)).not.toBeNull();

    store.tourEnded();
    expect(shown(store)).toEqual({ live: false, bubble: false });
    expect(shown(createInviteStore())).toEqual({ live: false, bubble: false });

    unsubscribe();
    store.dismiss();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("is not live while the URL asks for the tour", () => {
    open("/?tour=1");
    expect(shown(createInviteStore())).toEqual({ live: false, bubble: false });
    open("/?tourSpeed=4&tour=1");
    expect(shown(createInviteStore())).toEqual({ live: false, bubble: false });
    open("/?detour=1");
    expect(shown(createInviteStore())).toEqual({ live: true, bubble: true });
  });

  it("hides the bubble once it is dismissed, and remembers that, but keeps the pulse", () => {
    const store = createInviteStore();
    store.dismiss();
    expect(shown(store)).toEqual({ live: true, bubble: false });
    expect(window.localStorage.getItem(DISMISSED_KEY)).not.toBeNull();
    expect(shown(createInviteStore())).toEqual({ live: true, bubble: false });
  });

  it("keeps working when storage is blocked: live, and what happens is remembered until the page closes", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const store = createInviteStore();
    expect(shown(store)).toEqual({ live: true, bubble: true });
    store.dismiss();
    expect(shown(store)).toEqual({ live: true, bubble: false });
    store.tourStarted();
    store.tourEnded();
    expect(shown(store)).toEqual({ live: false, bubble: false });
  });
});

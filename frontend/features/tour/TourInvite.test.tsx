import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DISMISSED_KEY, SEEN_KEY, createInviteStore } from "./invite";
import { APPEAR_AFTER, COLLAPSE_AFTER, FADE, TourInvite } from "./TourInvite";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

function setup(pathname = "/") {
  navigation.pathname = pathname;
  const store = createInviteStore();
  const view = render(<TourInvite store={store} />);
  return { store, ...view };
}

const pill = () => screen.getByRole("link", { name: "Take the tour" });
const bubble = () => screen.queryByRole("region", { name: "Guided tour invitation" });
const isLive = () => pill().closest(".tour-invite")?.classList.contains("is-live");
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

/** The bubble, once it has dropped in. */
function opened(pathname = "/") {
  const view = setup(pathname);
  advance(APPEAR_AFTER);
  const region = bubble();
  if (!region) throw new Error("The invitation did not appear.");
  return { ...view, region };
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TourInvite", () => {
  it("is the top bar's tour link, pulsing on a first visit", () => {
    setup();
    expect(pill()).toHaveAttribute("href", "/?tour=1");
    expect(isLive()).toBe(true);
  });

  it("drops the bubble in a moment after the page loads", () => {
    setup();
    expect(APPEAR_AFTER).toBe(1200);
    expect(bubble()).not.toBeInTheDocument();
    advance(APPEAR_AFTER - 1);
    expect(bubble()).not.toBeInTheDocument();
    advance(1);
    expect(bubble()).toBeVisible();
  });

  it("says what the tour is, and starts it from a link to /?tour=1", () => {
    const { region } = opened();
    expect(within(region).getByRole("heading", { name: "New here? Take the 2-minute tour" })).toBeVisible();
    expect(within(region).getByText("Watch Milepost plan a real trip, hands-free.")).toBeVisible();
    expect(within(region).getByRole("link", { name: "Start the tour" })).toHaveAttribute("href", "/?tour=1");
    expect(within(region).getByRole("button", { name: "Dismiss" })).toBeVisible();
  });

  it("does not take the focus when it appears", () => {
    setup();
    pill().focus();
    advance(APPEAR_AFTER);
    expect(bubble()).toBeVisible();
    expect(pill()).toHaveFocus();
  });

  it("goes when it is dismissed, stays away on later visits, and leaves the pill pulsing", () => {
    const { region, unmount } = opened();
    fireEvent.click(within(region).getByRole("button", { name: "Dismiss" }));
    expect(bubble()).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DISMISSED_KEY)).not.toBeNull();
    expect(isLive()).toBe(true);
    unmount();

    setup();
    advance(APPEAR_AFTER + COLLAPSE_AFTER);
    expect(bubble()).not.toBeInTheDocument();
    expect(isLive()).toBe(true);
  });

  it("closes on Escape when the focus is inside it, handing the focus back to the tour link", () => {
    const { region } = opened();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(bubble()).toBeVisible();

    const start = within(region).getByRole("link", { name: "Start the tour" });
    start.focus();
    fireEvent.keyDown(start, { key: "Escape" });
    expect(bubble()).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DISMISSED_KEY)).not.toBeNull();
    expect(pill()).toHaveFocus();
  });

  it("fades out by itself after 12 s, without being dismissed, and the pill keeps pulsing", () => {
    expect(COLLAPSE_AFTER).toBe(12_000);
    const { region } = opened();
    advance(COLLAPSE_AFTER - 1);
    expect(region).not.toHaveAttribute("data-closing");
    advance(1);
    expect(region).toHaveAttribute("data-closing");
    advance(FADE);
    expect(bubble()).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DISMISSED_KEY)).toBeNull();
    expect(isLive()).toBe(true);
  });

  it("stops that clock while the pointer is over the bubble, or the focus is inside it", () => {
    const { region } = opened();
    advance(8000);
    fireEvent.mouseEnter(region);
    advance(60_000);
    expect(region).not.toHaveAttribute("data-closing");
    fireEvent.mouseLeave(region);
    advance(3999);
    expect(region).not.toHaveAttribute("data-closing");

    const start = within(region).getByRole("link", { name: "Start the tour" });
    act(() => start.focus());
    advance(60_000);
    expect(region).not.toHaveAttribute("data-closing");
    // To the Dismiss button: still inside.
    act(() => within(region).getByRole("button", { name: "Dismiss" }).focus());
    advance(60_000);
    expect(region).not.toHaveAttribute("data-closing");
    act(() => pill().focus());
    advance(1);
    expect(region).toHaveAttribute("data-closing");
  });

  it("is gone, pulse and bubble, once a tour starts, and stays gone afterwards", () => {
    const { store, unmount } = opened();
    act(() => store.tourStarted());
    expect(bubble()).not.toBeInTheDocument();
    expect(isLive()).toBe(false);
    expect(window.localStorage.getItem(SEEN_KEY)).not.toBeNull();
    act(() => store.tourEnded());
    expect(isLive()).toBe(false);
    unmount();

    setup();
    advance(APPEAR_AFTER);
    expect(bubble()).not.toBeInTheDocument();
    expect(isLive()).toBe(false);
    expect(pill()).toHaveAttribute("href", "/?tour=1");
  });

  it("only pulses on a saved trip's page: no bubble there", () => {
    setup("/trips/abc123");
    advance(APPEAR_AFTER + 1000);
    expect(bubble()).not.toBeInTheDocument();
    expect(isLive()).toBe(true);
  });

  it("is a plain, static link anywhere else", () => {
    setup("/nowhere");
    advance(APPEAR_AFTER);
    expect(bubble()).not.toBeInTheDocument();
    expect(isLive()).toBe(false);
  });
});

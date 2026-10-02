import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNarrator } from "./narrator";
import { TourOverlay, type TourOverlayProps } from "./TourOverlay";
import { useTourCaptions, useTourVoice } from "./useTour";

function props(overrides: Partial<TourOverlayProps> = {}): TourOverlayProps {
  return {
    index: 2,
    total: 16,
    entry: 3,
    caption: "…then the pickup and the dropoff.",
    paused: false,
    captions: true,
    voice: true,
    target: null,
    onPrevious: vi.fn(),
    onToggle: vi.fn(),
    onNext: vi.fn(),
    onToggleCaptions: vi.fn(),
    onToggleVoice: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  };
}

/** The overlay with the real, remembered captions preference. */
function WithCaptions(overrides: Partial<TourOverlayProps>) {
  const { captions, toggleCaptions } = useTourCaptions();
  return <TourOverlay {...props(overrides)} captions={captions} onToggleCaptions={toggleCaptions} />;
}

/** No sound in tests: a narrator in a browser with no audio. */
const silentNarrator = createNarrator({ audio: () => null });

/** The overlay with the real, remembered voice preference. */
function WithVoice(overrides: Partial<TourOverlayProps>) {
  const { voice, voiceBlocked, toggleVoice } = useTourVoice(silentNarrator);
  return <TourOverlay {...props(overrides)} voice={voice} voiceBlocked={voiceBlocked} onToggleVoice={toggleVoice} />;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => vi.unstubAllGlobals());

describe("TourOverlay", () => {
  it("shows the caption and the step counter in a labelled region", () => {
    render(<TourOverlay {...props()} />);
    const card = screen.getByRole("region", { name: "Guided tour" });
    expect(within(card).getByText("…then the pickup and the dropoff.")).toBeVisible();
    expect(within(card).getByText("3 / 16")).toBeVisible();
    expect(within(card).getByText("Step 3 of 16")).toHaveClass("sr-only");
  });

  it("announces the caption politely", () => {
    render(<TourOverlay {...props()} />);
    const caption = screen.getByText("…then the pickup and the dropoff.");
    expect(caption.closest("[aria-live]")).toHaveAttribute("aria-live", "polite");
  });

  it("shows an extra line, such as the trip's link", () => {
    render(<TourOverlay {...props({ detail: "milepost-eld.vercel.app/trips/abc123" })} />);
    expect(screen.getByText("milepost-eld.vercel.app/trips/abc123")).toBeVisible();
  });

  it("names every control and calls it", async () => {
    const all = props();
    render(<TourOverlay {...all} />);
    await userEvent.click(screen.getByRole("button", { name: "Previous step" }));
    await userEvent.click(screen.getByRole("button", { name: "Pause tour" }));
    await userEvent.click(screen.getByRole("button", { name: "Next step" }));
    await userEvent.click(screen.getByRole("button", { name: "Turn voice off" }));
    await userEvent.click(screen.getByRole("button", { name: "Captions" }));
    await userEvent.click(screen.getByRole("button", { name: "Exit tour" }));
    expect(all.onToggleVoice).toHaveBeenCalledOnce();
    expect(all.onPrevious).toHaveBeenCalledOnce();
    expect(all.onToggle).toHaveBeenCalledOnce();
    expect(all.onNext).toHaveBeenCalledOnce();
    expect(all.onToggleCaptions).toHaveBeenCalledOnce();
    expect(all.onExit).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Captions" })).toHaveAttribute("aria-pressed", "true");
  });

  it("says when it is paused, and offers to resume", () => {
    render(<TourOverlay {...props({ paused: true })} />);
    expect(screen.getByText("Paused (press Space to continue)")).toBeVisible();
    expect(screen.getByRole("button", { name: "Resume tour" })).toBeInTheDocument();
  });

  it("shrinks to a control pill with the captions off, and remembers that", async () => {
    const { unmount } = render(<WithCaptions />);
    await userEvent.click(screen.getByRole("button", { name: "Captions" }));
    expect(screen.getByRole("button", { name: "Captions" })).toHaveAttribute("aria-pressed", "false");
    // Gone from the screen, still announced.
    expect(screen.getByText("…then the pickup and the dropoff.")).toHaveClass("sr-only");
    expect(screen.getByText("3 / 16")).toBeVisible();
    expect(screen.getByRole("button", { name: "Pause tour" })).toBeVisible();
    unmount();

    render(<WithCaptions />);
    expect(screen.getByRole("button", { name: "Captions" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: "Captions" }));
    expect(screen.getByText("…then the pickup and the dropoff.")).not.toHaveClass("sr-only");
  });

  it("offers to turn the voice off or on, in the caption card and in the control pill", () => {
    const { rerender } = render(<TourOverlay {...props()} />);
    expect(screen.getByRole("button", { name: "Turn voice off" })).toHaveAttribute("title", "Turn voice off (V)");
    expect(screen.queryByRole("button", { name: "Turn voice on" })).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    rerender(<TourOverlay {...props({ voice: false })} />);
    expect(screen.getByRole("button", { name: "Turn voice on" })).toHaveAttribute("title", "Turn voice on (V)");

    rerender(<TourOverlay {...props({ captions: false })} />);
    expect(screen.getByRole("button", { name: "Turn voice off" })).toBeVisible();
    rerender(<TourOverlay {...props({ captions: false, voice: false })} />);
    expect(screen.getByRole("button", { name: "Turn voice on" })).toBeVisible();
  });

  it("turns the voice off and on, and remembers that", async () => {
    const { unmount } = render(<WithVoice />);
    await userEvent.click(screen.getByRole("button", { name: "Turn voice off" }));
    expect(screen.getByRole("button", { name: "Turn voice on" })).toBeVisible();
    expect(window.localStorage.getItem("milepost:tour-voice")).toBe("off");
    unmount();

    render(<WithVoice />);
    await userEvent.click(screen.getByRole("button", { name: "Turn voice on" }));
    expect(screen.getByRole("button", { name: "Turn voice off" })).toBeVisible();
    expect(window.localStorage.getItem("milepost:tour-voice")).toBe("on");
  });

  it("says to click the voice button when the browser has blocked autoplay", () => {
    for (const captions of [true, false]) {
      const { unmount } = render(<TourOverlay {...props({ captions, voiceBlocked: true })} />);
      const hint = screen.getByRole("status");
      expect(hint).toHaveTextContent("Click 🔊 to hear the tour");
      expect(hint).toBeVisible();
      // The voice is on but can't be heard yet: a click on its button is what turns it on.
      expect(screen.getByRole("button", { name: "Turn voice on" })).toHaveAccessibleDescription(
        "Click 🔊 to hear the tour",
      );
      unmount();
    }
  });

  it("keeps working when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { unmount } = render(<WithCaptions />);
    await userEvent.click(screen.getByRole("button", { name: "Captions" }));
    expect(screen.getByRole("button", { name: "Captions" })).toHaveAttribute("aria-pressed", "false");
    unmount();

    render(<WithVoice />);
    await userEvent.click(screen.getByRole("button", { name: "Turn voice off" }));
    expect(screen.getByRole("button", { name: "Turn voice on" })).toBeVisible();
    vi.restoreAllMocks();
  });
});

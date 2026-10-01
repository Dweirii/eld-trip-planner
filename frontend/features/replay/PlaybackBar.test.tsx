import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleTrip } from "@/lib/api/__fixtures__";
import { PlaybackBar } from "./PlaybackBar";
import { useTripReplay } from "./useTripReplay";

function Harness() {
  return <PlaybackBar replay={useTripReplay(sampleTrip)} />;
}

const frames: FrameRequestCallback[] = [];

beforeEach(() => {
  frames.length = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
});

afterEach(() => vi.unstubAllGlobals());

const slider = () => screen.getByRole("slider", { name: "Trip time" });

describe("PlaybackBar", () => {
  it("starts as a compact Play trip button", () => {
    render(<Harness />);
    expect(screen.getByRole("group", { name: "Trip replay" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play trip" })).toHaveTextContent("Play trip");
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("expands when played, and toggles between play and pause", async () => {
    render(<Harness />);
    const button = screen.getByRole("button", { name: "Play trip" });
    await userEvent.click(button);
    expect(button).toHaveAccessibleName("Pause trip");
    expect(button).toHaveFocus(); // the same button, so focus stays put
    expect(slider()).toBeInTheDocument();
    await userEvent.click(button);
    expect(button).toHaveAccessibleName("Play trip");
  });

  it("shows the home-terminal clock and the duty status", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Play trip" }));
    expect(screen.getByText("Thu, Oct 1 · 06:00 CDT")).toBeInTheDocument();
    expect(screen.getByText("Driving · mile 0")).toBeInTheDocument();

    fireEvent.change(slider(), { target: { value: "1000" } });
    expect(screen.getByText("Thu, Oct 1 · 22:40 CDT")).toBeInTheDocument();
    expect(screen.getByText("Sleeper berth · 10-h rest at Jasper, AR")).toBeInTheDocument();
  });

  it("scrubs in 15-minute steps and reads the position out", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Play trip" }));
    expect(slider()).toHaveAttribute("min", "0");
    expect(slider()).toHaveAttribute("max", "1785");
    expect(slider()).toHaveAttribute("step", "15");
    expect(slider()).toHaveAttribute("aria-valuetext", "Thu, Oct 1, 06:00 CDT: Driving, mile 0");

    fireEvent.change(slider(), { target: { value: "1530" } });
    expect(slider()).toHaveAttribute("aria-valuetext", "Fri, Oct 2, 07:30 CDT: Driving, mile 795");
    fireEvent.change(slider(), { target: { value: "360" } });
    expect(slider()).toHaveAttribute(
      "aria-valuetext",
      "Thu, Oct 1, 12:00 CDT: On duty (not driving), Pickup at St. Louis, MO",
    );
  });

  it("marks the days and the stops under the track", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Play trip" }));
    expect(screen.getByText("Day 1")).toBeInTheDocument();
    expect(screen.getByText("Day 2")).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Trip replay" });
    expect(group.querySelectorAll("svg[data-shape]")).toHaveLength(sampleTrip.stops.length);
  });

  it("cycles the speed", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Play trip" }));
    const speed = screen.getByRole("button", { name: "Playback speed 1×" });
    await userEvent.click(speed);
    expect(speed).toHaveAccessibleName("Playback speed 2×");
    await userEvent.click(speed);
    expect(speed).toHaveAccessibleName("Playback speed ½×");
    expect(speed).toHaveTextContent("½×");
    await userEvent.click(speed);
    expect(speed).toHaveAccessibleName("Playback speed 1×");
  });

  it("closes back to the compact button, stopped, with focus on it", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Play trip" }));
    fireEvent.change(slider(), { target: { value: "900" } });
    await userEvent.click(screen.getByRole("button", { name: "Close trip replay" }));
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    const play = screen.getByRole("button", { name: "Play trip" });
    expect(play).toHaveFocus();

    await userEvent.click(play);
    expect(slider()).toHaveAttribute("aria-valuetext", "Thu, Oct 1, 06:00 CDT: Driving, mile 0");
  });

  it("announces each new stretch of the trip while playing", async () => {
    const { container } = render(<Harness />);
    const live = container.querySelector("[aria-live=polite]");
    await userEvent.click(screen.getByRole("button", { name: "Play trip" }));
    expect(live).toHaveTextContent("Driving to St. Louis, MO");
    act(() => frames.splice(0).forEach((callback) => callback(0)));
    fireEvent.change(slider(), { target: { value: "720" } });
    expect(live).toHaveTextContent("Sleeper berth: 10-h rest at Jasper, AR");
    await userEvent.click(screen.getByRole("button", { name: "Pause trip" }));
    expect(live).toBeEmptyDOMElement();
  });
});

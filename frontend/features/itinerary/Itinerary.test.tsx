import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { sampleTrip } from "@/lib/api/__fixtures__";
import { Itinerary, groupByDate } from "./Itinerary";

describe("Itinerary", () => {
  it("groups stops by the day they start", () => {
    expect(groupByDate(sampleTrip.stops).map(([date, stops]) => [date, stops.map((s) => s.id)])).toEqual([
      ["2026-10-01", ["s0", "s3", "s5"]],
      ["2026-10-02", ["s7"]],
    ]);
  });

  it("lists each stop with its time, kind, place and details", () => {
    render(<Itinerary stops={sampleTrip.stops} selectedStopId={null} onSelectStop={vi.fn()} />);
    const rest = screen.getByRole("button", { name: /10-h rest · Jasper, AR/ });
    expect(within(rest).getByText("18:00")).toBeInTheDocument();
    expect(rest).toHaveTextContent("Sleeper berth · 10h · mile 604");
    expect(screen.getByRole("heading", { level: 3, name: "Thu, Oct 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Fri, Oct 2" })).toBeInTheDocument();
  });

  it("marks each stop with its kind's shape, the start as a deep-teal ring", () => {
    render(<Itinerary stops={sampleTrip.stops} selectedStopId={null} onSelectStop={vi.fn()} />);
    const shapeOf = (name: RegExp) =>
      screen.getByRole("button", { name }).querySelector("svg[data-shape]")?.getAttribute("data-shape");
    expect(shapeOf(/Depart · Chicago/)).toBe("ring");
    expect(shapeOf(/Pickup · St. Louis/)).toBe("circle");
    expect(shapeOf(/10-h rest/)).toBe("pill");
    expect(shapeOf(/Dropoff · Dallas/)).toBe("square");
    const ring = screen.getByRole("button", { name: /Depart · Chicago/ }).querySelectorAll("svg path")[1];
    expect(ring).toHaveAttribute("stroke", "#043b4b");
    expect(ring).toHaveAttribute("fill", "#fff");
  });

  it("selects a stop", async () => {
    const onSelectStop = vi.fn();
    render(<Itinerary stops={sampleTrip.stops} selectedStopId="s5" onSelectStop={onSelectStop} />);
    expect(screen.getByRole("button", { name: /10-h rest/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: /Pickup · St. Louis, MO/ }));
    expect(onSelectStop).toHaveBeenCalledWith("s3");
  });
});

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleTrip } from "@/lib/api/__fixtures__";
import { Itinerary, groupByDate } from "./Itinerary";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A scrollable panel 200px tall whose content is 600px, with the row of interest at `rowTop`. */
function inScrollingPanel(ui: React.ReactElement, rowTop: number) {
  const view = render(<div style={{ overflowY: "auto" }}>{ui}</div>);
  const panel = view.container.firstElementChild as HTMLDivElement;
  Object.defineProperty(panel, "scrollHeight", { value: 600, configurable: true });
  Object.defineProperty(panel, "clientHeight", { value: 200, configurable: true });
  panel.getBoundingClientRect = () => ({ top: 0, bottom: 200 }) as DOMRect;
  panel.scrollBy = vi.fn();
  const rowRect = () => ({ top: rowTop, bottom: rowTop + 40 }) as DOMRect;
  return { ...view, panel, rowRect };
}

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

  describe("during a trip replay", () => {
    it("badges the stop the driver is at as Now, apart from the selection", () => {
      render(<Itinerary stops={sampleTrip.stops} selectedStopId="s3" onSelectStop={vi.fn()} currentStopId="s5" />);
      const rest = screen.getByRole("button", { name: /10-h rest · Jasper, AR/ });
      expect(within(rest).getByText("Now")).toBeInTheDocument();
      expect(rest).toHaveAttribute("aria-pressed", "false");
      expect(rest).toHaveAttribute("data-now");
      const pickup = screen.getByRole("button", { name: /Pickup · St. Louis, MO/ });
      expect(pickup).toHaveAttribute("aria-pressed", "true");
      expect(within(pickup).queryByText("Now")).not.toBeInTheDocument();
      expect(screen.getAllByText("Now")).toHaveLength(1);
    });

    it("says where the truck is driving to, just before that stop", () => {
      render(<Itinerary stops={sampleTrip.stops} selectedStopId={null} onSelectStop={vi.fn()} drivingToStopId="s7" />);
      const driving = screen.getByText("Driving to Dallas, TX…");
      const dropoff = screen.getByRole("button", { name: /Dropoff · Dallas, TX/ });
      expect(driving.compareDocumentPosition(dropoff) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(within(driving.parentElement!).getByText("Now")).toBeInTheDocument();
      expect(screen.getAllByText("Now")).toHaveLength(1);
      expect(within(dropoff).queryByText("Now")).not.toBeInTheDocument();
    });

    it("shows nothing extra outside a replay", () => {
      render(<Itinerary stops={sampleTrip.stops} selectedStopId={null} onSelectStop={vi.fn()} />);
      expect(screen.queryByText("Now")).not.toBeInTheDocument();
      expect(screen.queryByText(/Driving to/)).not.toBeInTheDocument();
    });

    it("keeps the current row in view inside its scrolling panel while playing", () => {
      vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
      const props = { stops: sampleTrip.stops, selectedStopId: null, onSelectStop: vi.fn() };
      const { panel, rowRect, rerender } = inScrollingPanel(<Itinerary {...props} currentStopId="s3" />, 500);
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(rowRect);
      expect(panel.scrollBy).not.toHaveBeenCalled();

      rerender(
        <div style={{ overflowY: "auto" }}>
          <Itinerary {...props} currentStopId="s5" followCurrent />
        </div>,
      );
      expect(panel.scrollBy).toHaveBeenCalledWith({ top: 348, behavior: "smooth" });
    });

    it("jumps instead of gliding under reduced motion", () => {
      vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: query.includes("reduce") })));
      const props = { stops: sampleTrip.stops, selectedStopId: null, onSelectStop: vi.fn(), followCurrent: true };
      const { panel, rowRect, rerender } = inScrollingPanel(<Itinerary {...props} />, -100);
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(rowRect);
      rerender(
        <div style={{ overflowY: "auto" }}>
          <Itinerary {...props} drivingToStopId="s7" />
        </div>,
      );
      expect(panel.scrollBy).toHaveBeenCalledWith({ top: -108, behavior: "auto" });
    });
  });
});

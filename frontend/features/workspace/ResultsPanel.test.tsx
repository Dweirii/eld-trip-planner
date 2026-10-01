import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { sampleTrip } from "@/lib/api/__fixtures__";
import { ResultsPanel } from "./ResultsPanel";

function setup() {
  const props = { onSelectStop: vi.fn(), onEdit: vi.fn(), onNewTrip: vi.fn() };
  render(<ResultsPanel trip={sampleTrip} selectedStopId={null} {...props} />);
  return props;
}

describe("ResultsPanel", () => {
  it("summarises the trip", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Chicago → St. Louis → Dallas" })).toBeInTheDocument();
    expect(screen.getByText("Cycle used 12.5 h · starts Thu, Oct 1, 06:00 CDT")).toBeInTheDocument();
    expect(screen.getByText("972")).toBeInTheDocument();
    expect(screen.getByText("29h45")).toBeInTheDocument();
  });

  it("switches between itinerary, rules and assumptions", async () => {
    setup();
    expect(screen.getByRole("tabpanel", { name: "Itinerary" })).toContainElement(
      screen.getByRole("list", { name: "Itinerary" }),
    );
    await userEvent.click(screen.getByRole("tab", { name: "Rules 7/7" }));
    expect(screen.getByRole("tabpanel", { name: "Rules 7/7" })).toBeVisible();
    expect(screen.getByText("14-hour driving window")).toBeVisible();
    expect(screen.queryByRole("list", { name: "Itinerary" })).not.toBeInTheDocument();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Assumptions" })).toHaveFocus();
    expect(screen.getByText(/Only driving is barred/)).toBeVisible();
  });

  it("offers itinerary, directions, rules and assumptions, in that order", () => {
    setup();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Itinerary",
      "Directions",
      "Rules 7/7 ✓",
      "Assumptions",
    ]);
  });

  it("shows turn-by-turn directions per leg", async () => {
    setup();
    expect(screen.queryByRole("heading", { name: /Leg 1/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Directions" }));
    const panel = screen.getByRole("tabpanel", { name: "Directions" });
    expect(panel).toBeVisible();
    expect(within(panel).getByRole("heading", { level: 3, name: "Leg 1 · Chicago, IL → St. Louis, MO" })).toBeVisible();
    expect(within(panel).getByText("Continue onto I-30 W")).toBeVisible();
    expect(screen.queryByRole("list", { name: "Itinerary" })).not.toBeInTheDocument();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Itinerary" })).toHaveAttribute("aria-selected", "true");
  });

  it("can be controlled: shows the tab it is given and reports the one picked", async () => {
    const onTabChange = vi.fn();
    const props = { onSelectStop: vi.fn(), onEdit: vi.fn(), onNewTrip: vi.fn(), onTabChange };
    const { rerender } = render(<ResultsPanel trip={sampleTrip} selectedStopId={null} tab="rules" {...props} />);
    expect(screen.getByRole("tab", { name: "Rules 7/7" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("14-hour driving window")).toBeVisible();

    await userEvent.click(screen.getByRole("tab", { name: "Directions" }));
    expect(onTabChange).toHaveBeenCalledWith("directions");
    expect(screen.getByRole("tab", { name: "Rules 7/7" })).toHaveAttribute("aria-selected", "true");

    rerender(<ResultsPanel trip={sampleTrip} selectedStopId={null} tab="directions" {...props} />);
    expect(screen.getByRole("tabpanel", { name: "Directions" })).toBeVisible();
  });

  it("reports tab changes when it keeps its own tab", async () => {
    const onTabChange = vi.fn();
    render(
      <ResultsPanel
        trip={sampleTrip}
        selectedStopId={null}
        onSelectStop={vi.fn()}
        onEdit={vi.fn()}
        onNewTrip={vi.fn()}
        onTabChange={onTabChange}
      />,
    );
    await userEvent.click(screen.getByRole("tab", { name: "Assumptions" }));
    expect(onTabChange).toHaveBeenCalledWith("assumptions");
    expect(screen.getByText(/Only driving is barred/)).toBeVisible();
  });

  it("edits or starts over", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: "Edit trip" }));
    await userEvent.click(screen.getByRole("button", { name: /New trip/ }));
    expect(props.onEdit).toHaveBeenCalledOnce();
    expect(props.onNewTrip).toHaveBeenCalledOnce();
  });
});

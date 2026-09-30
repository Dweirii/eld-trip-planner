import { render, screen } from "@testing-library/react";
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

  it("edits or starts over", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: "Edit trip" }));
    await userEvent.click(screen.getByRole("button", { name: /New trip/ }));
    expect(props.onEdit).toHaveBeenCalledOnce();
    expect(props.onNewTrip).toHaveBeenCalledOnce();
  });
});

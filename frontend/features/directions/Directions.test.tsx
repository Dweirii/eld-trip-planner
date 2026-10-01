import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { sampleTrip } from "@/lib/api/__fixtures__";
import type { RouteLeg, RouteStep } from "@/lib/api/types";
import { Directions } from "./Directions";

const [firstLeg] = sampleTrip.route.legs;

function longLeg(count: number): RouteLeg {
  const steps: RouteStep[] = Array.from({ length: count }, (_, i) => ({
    instruction: `Turn right onto Road ${i + 1}`,
    road: `Road ${i + 1}`,
    miles: 2,
    minutes: 3,
  }));
  return { ...firstLeg, steps };
}

/** Each leg's step list is named by the leg's heading. */
function stepsOf(leg: string | RegExp): string[] {
  return within(screen.getByRole("list", { name: leg }))
    .getAllByRole("listitem")
    .map((item) => item.textContent ?? "");
}

describe("Directions", () => {
  it("lists every leg's turn-by-turn steps from the trip", () => {
    render(<Directions legs={sampleTrip.route.legs} />);

    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Leg 1 · Chicago, IL → St. Louis, MO",
      "Leg 2 · St. Louis, MO → Dallas, TX",
    ]);
    expect(screen.getByText("315 mi · 5h43")).toBeInTheDocument();
    expect(stepsOf("Leg 1 · Chicago, IL → St. Louis, MO")).toEqual([
      "Head toward St. Louis, MOon I-55 S32 mi",
      "Continue onto I-44 W283 mi",
      "Arrive at your destination",
    ]);
    expect(stepsOf(/Leg 2/)[0]).toBe("Head toward Dallas, TXon I-40 W66 mi");
    // Legs are headings, not landmarks: one region per leg would clutter landmark navigation.
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.getByText(/Directions: openrouteservice.org \(heavy-goods vehicle profile\)/)).toHaveTextContent(
      "Directions: openrouteservice.org (heavy-goods vehicle profile). Rest, break and fuel stops are in the Itinerary.",
    );
  });

  it("keeps a decimal on short steps", () => {
    const leg = {
      ...firstLeg,
      steps: [{ instruction: "Turn left onto Main Street", road: "Main Street", miles: 0.4, minutes: 1 }],
    };
    render(<Directions legs={[leg]} />);
    expect(stepsOf(/Leg 1/)).toEqual(["Turn left onto Main Street0.4 mi"]);
  });

  it("notes the road unless the instruction names that exact road", () => {
    const steps = [
      { instruction: "Keep left onto I 55", road: "I 5", miles: 12, minutes: 11 },
      {
        instruction: "Keep right onto Dan Ryan Expressway (Local), I 94",
        road: "Dan Ryan Expressway (Local)",
        miles: 4.1,
        minutes: 6,
      },
      { instruction: "Turn left onto main street", road: "Main Street", miles: 0.4, minutes: 1 },
    ];
    render(<Directions legs={[{ ...firstLeg, steps }]} />);
    expect(stepsOf(/Leg 1/)).toEqual([
      "Keep left onto I 55on I 512 mi",
      "Keep right onto Dan Ryan Expressway (Local), I 944.1 mi",
      "Turn left onto main street0.4 mi",
    ]);
  });

  it("shows the first 8 steps of a long leg and expands to all of them", async () => {
    render(<Directions legs={[longLeg(12)]} />);
    expect(stepsOf(/Leg 1/)).toHaveLength(8);

    const toggle = screen.getByRole("button", { name: "Show all 12 steps to St. Louis" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", screen.getByRole("list", { name: /Leg 1/ }).id);

    await userEvent.click(toggle);
    expect(stepsOf(/Leg 1/)).toHaveLength(12);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAccessibleName("Show fewer steps to St. Louis");

    await userEvent.click(toggle);
    expect(stepsOf(/Leg 1/)).toHaveLength(8);
  });

  it("needs no toggle when a leg fits", () => {
    render(<Directions legs={[longLeg(8)]} />);
    expect(stepsOf(/Leg 1/)).toHaveLength(8);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("explains that a trip saved before directions existed has none", () => {
    const withoutSteps: Partial<RouteLeg> = { ...sampleTrip.route.legs[1] };
    delete withoutSteps.steps; // as an API older than directions serves it
    render(<Directions legs={[{ ...firstLeg, steps: [] }, withoutSteps as RouteLeg]} />);

    const message = "Turn-by-turn directions aren't available for this saved trip. Plan it again to get them.";
    expect(screen.getAllByText(message)).toHaveLength(2);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("says there is nothing to drive when the trip starts at the pickup", () => {
    render(<Directions legs={[{ ...firstLeg, to: firstLeg.from, miles: 0, hours: 0, steps: [] }]} />);
    expect(screen.getByText("Already at the pickup, so there's nothing to drive.")).toBeInTheDocument();
    expect(screen.queryByText(/aren't available/)).not.toBeInTheDocument();
  });
});

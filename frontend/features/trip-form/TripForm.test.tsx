import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EXAMPLE_TRIPS } from "./examples";
import { EMPTY_FORM } from "./model";
import { TripForm } from "./TripForm";

function setup(overrides: Partial<Parameters<typeof TripForm>[0]> = {}) {
  const props = {
    values: EMPTY_FORM,
    errors: {},
    pending: false,
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    onExample: vi.fn(),
    ...overrides,
  };
  render(<TripForm {...props} />);
  return props;
}

describe("TripForm", () => {
  it("asks for the three stops and the cycle hours", () => {
    setup({ values: { ...EMPTY_FORM, cycleUsed: 12.5 } });
    expect(screen.getByRole("combobox", { name: "Current location" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Pickup location" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Dropoff location" })).toBeInTheDocument();
    expect(screen.getByText("57.5 h")).toBeInTheDocument(); // left of 70
  });

  it("marks the three places with the same shapes as their map markers", () => {
    setup();
    const shapeOf = (name: string) =>
      screen
        .getByRole("combobox", { name })
        .parentElement?.querySelector("svg[data-shape]")
        ?.getAttribute("data-shape");
    expect(shapeOf("Current location")).toBe("ring");
    expect(shapeOf("Pickup location")).toBe("circle");
    expect(shapeOf("Dropoff location")).toBe("square");
  });

  it("reports cycle hours as numbers", () => {
    const props = setup();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Hours used" }), { target: { value: "31.25" } });
    expect(props.onChange).toHaveBeenCalledWith({ ...EMPTY_FORM, cycleUsed: 31.25 });
  });

  it("submits, and disables the button while planning", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: "Plan trip" }));
    expect(props.onSubmit).toHaveBeenCalledOnce();
  });

  it("shows a planning state", () => {
    setup({ pending: true });
    expect(screen.getByRole("button", { name: /planning/i })).toBeDisabled();
  });

  it("shows field errors", () => {
    setup({ errors: { pickup: "We couldn't find that place.", cycleUsed: "The cycle limit is 70 hours." } });
    expect(screen.getByText("We couldn't find that place.")).toBeInTheDocument();
    expect(screen.getByText("The cycle limit is 70 hours.")).toBeInTheDocument();
  });

  it("plans an example trip in one click", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: /Multi-day/ }));
    expect(props.onExample).toHaveBeenCalledWith(EXAMPLE_TRIPS[1].values);
  });

  it("opens the details section when the start time has an error", () => {
    setup({ errors: { startTime: "Pick a date and time." } });
    expect(screen.getByText("Pick a date and time.").closest("details")).toHaveAttribute("open");
  });
});

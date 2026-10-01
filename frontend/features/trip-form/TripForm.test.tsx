import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EXAMPLE_TRIPS } from "./examples";
import { EMPTY_FORM, type TripFormValues, validate } from "./model";
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

  it("shows an over-long truck number's error under that field, in an open details section", () => {
    const values: TripFormValues = {
      ...EXAMPLE_TRIPS[0].values,
      details: { truck_number: "TRK-".repeat(11) },
    };
    setup({ values, errors: validate(values) });
    const truck = screen.getByRole("textbox", { name: "Truck" });
    expect(truck).toHaveAttribute("aria-invalid", "true");
    expect(truck).toHaveAccessibleDescription("Use at most 40 characters.");
    expect(truck.closest("details")).toHaveAttribute("open");
  });

  it("shows API errors for the log-sheet details", () => {
    setup({
      errors: {
        "details.carrier_name": "Ensure this field has no more than 120 characters.",
        details: "Log details are invalid.",
      },
    });
    const details = screen.getByText("Log details are invalid.").closest("details")!;
    expect(details).toHaveAttribute("open");
    expect(within(details).getByRole("textbox", { name: "Carrier" })).toHaveAccessibleDescription(
      "Ensure this field has no more than 120 characters.",
    );
  });

  it("keeps the details section open once its error is fixed", () => {
    const props = { values: EMPTY_FORM, pending: false, onChange: vi.fn(), onSubmit: vi.fn(), onExample: vi.fn() };
    const { rerender } = render(<TripForm {...props} errors={{ startTime: "Pick a date and time." }} />);
    const details = screen.getByText("Pick a date and time.").closest("details")!;
    expect(details).toHaveAttribute("open");
    rerender(<TripForm {...props} errors={{}} />);
    expect(details).toHaveAttribute("open");
  });
});

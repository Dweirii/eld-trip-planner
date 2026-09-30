import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Place } from "@/lib/api/types";
import { LocationInput, type LocationInputProps } from "./LocationInput";
import type { LocationValue } from "./model";

const CHICAGO: Place = { label: "Chicago, IL", lat: 41.8781, lng: -87.6298 };
const HEIGHTS: Place = { label: "Chicago Heights, IL", lat: 41.506, lng: -87.6356 };

function Harness({
  initial = { label: "" },
  onValue,
  ...props
}: Partial<LocationInputProps> & { initial?: LocationValue; onValue?: (value: LocationValue) => void }) {
  const [value, setValue] = useState<LocationValue>(initial);
  return (
    <LocationInput
      label="Pickup location"
      marker="pickup"
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
      {...props}
    />
  );
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
const settle = () => act(() => vi.advanceTimersByTimeAsync(300));

describe("LocationInput", () => {
  it("searches after three characters and picks a suggestion", async () => {
    const search = vi.fn().mockResolvedValue([CHICAGO]);
    const onValue = vi.fn();
    render(<Harness search={search} onValue={onValue} />);
    const input = screen.getByRole("combobox", { name: "Pickup location" });

    await user().type(input, "ch");
    await settle();
    expect(search).not.toHaveBeenCalled();

    await user().type(input, "i");
    await settle();
    expect(search).toHaveBeenCalledWith("chi", expect.any(AbortSignal));

    await user().click(await screen.findByRole("option", { name: "Chicago, IL" }));
    expect(onValue).toHaveBeenLastCalledWith({ label: "Chicago, IL", lat: 41.8781, lng: -87.6298 });
    expect(input).toHaveValue("Chicago, IL");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("picks with the keyboard", async () => {
    const onValue = vi.fn();
    render(<Harness search={vi.fn().mockResolvedValue([CHICAGO, HEIGHTS])} onValue={onValue} />);
    const input = screen.getByRole("combobox");
    await user().type(input, "chic");
    await settle();
    await screen.findByRole("listbox");
    await user().keyboard("{ArrowDown}{Enter}");
    expect(onValue).toHaveBeenLastCalledWith({ label: "Chicago Heights, IL", lat: 41.506, lng: -87.6356 });
  });

  it("drops stale coordinates as soon as the user edits a picked place", async () => {
    const onValue = vi.fn();
    render(<Harness initial={{ ...CHICAGO }} search={vi.fn().mockResolvedValue([])} onValue={onValue} />);
    await user().type(screen.getByRole("combobox"), "x");
    expect(onValue).toHaveBeenLastCalledWith({ label: "Chicago, ILx" });
  });

  it("never lets an older, slower response overwrite a newer one", async () => {
    const pending: Record<string, { resolve: (places: Place[]) => void; signal: AbortSignal }> = {};
    const search = vi.fn(
      (query: string, signal: AbortSignal) =>
        new Promise<Place[]>((resolve, reject) => {
          pending[query] = { resolve, signal };
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    render(<Harness search={search} />);
    const input = screen.getByRole("combobox");

    await user().type(input, "chi");
    await settle();
    await user().type(input, "c");
    await settle();

    expect(pending.chi.signal.aborted).toBe(true);
    await act(async () => pending.chic.resolve([CHICAGO]));
    await act(async () => pending.chi.resolve([{ label: "Chimayo, NM", lat: 36, lng: -106 }]));
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Chicago, IL"]);
  });

  it("uses the browser's coordinates with the nearest town's name", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: { latitude: 41.88, longitude: -87.63 } } as GeolocationPosition),
      },
    });
    const onValue = vi.fn();
    render(<Harness allowMyLocation reverse={vi.fn().mockResolvedValue({ label: "Chicago, IL", lat: 41.9, lng: -87.6 })} onValue={onValue} />);
    await user().click(screen.getByRole("button", { name: "Use my location" }));
    await act(async () => {});
    expect(onValue).toHaveBeenLastCalledWith({ label: "Chicago, IL", lat: 41.88, lng: -87.63 });
  });

  it("shows the field's error", () => {
    render(<Harness error="We couldn't find that place." />);
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't find that place.");
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-invalid", "true");
  });
});

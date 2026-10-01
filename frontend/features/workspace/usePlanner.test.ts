import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXAMPLE_TRIPS } from "@/features/trip-form/examples";
import { EMPTY_FORM } from "@/features/trip-form/model";
import { sampleTrip } from "@/lib/api/__fixtures__";
import { ApiError, api } from "@/lib/api/client";
import { usePlanner } from "./usePlanner";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...original, api: { ...original.api, planTrip: vi.fn() } };
});

const planTrip = vi.mocked(api.planTrip);
const valid = EXAMPLE_TRIPS[1].values;

beforeEach(() => {
  planTrip.mockReset();
  window.history.replaceState(null, "", "/");
});

describe("usePlanner", () => {
  it("plans a trip, shows the results and gives it a shareable URL", async () => {
    planTrip.mockResolvedValue(sampleTrip);
    const { result } = renderHook(() => usePlanner(null));
    await act(() => result.current.plan(valid));
    expect(result.current.mode).toBe("results");
    expect(result.current.trip).toBe(sampleTrip);
    expect(window.location.pathname).toBe(`/trips/${sampleTrip.id}`);
  });

  it("stops at client-side validation", async () => {
    const { result } = renderHook(() => usePlanner(null));
    await act(() => result.current.plan(EMPTY_FORM));
    expect(planTrip).not.toHaveBeenCalled();
    expect(Object.keys(result.current.errors).sort()).toEqual(["current", "dropoff", "pickup"]);
  });

  it("puts API field errors on the matching field", async () => {
    planTrip.mockRejectedValue(
      new ApiError(422, "location_not_found", "We couldn't find that place.", "pickup_location"),
    );
    const { result } = renderHook(() => usePlanner(null));
    await act(() => result.current.plan(valid));
    expect(result.current.errors).toEqual({ pickup: "We couldn't find that place." });
    expect(result.current.notice).toBeNull();
    expect(result.current.mode).toBe("form");
  });

  it("puts API log-detail errors on the detail field and clears them when it changes", async () => {
    planTrip.mockRejectedValue(
      new ApiError(400, "validation_error", "Some fields are invalid.", undefined, {
        log_details: { truck_number: ["Ensure this field has no more than 40 characters."] },
      }),
    );
    const { result } = renderHook(() => usePlanner(null));
    await act(() => result.current.plan(valid));
    expect(result.current.errors).toEqual({
      "details.truck_number": "Ensure this field has no more than 40 characters.",
    });
    expect(result.current.notice).toBeNull();

    act(() => result.current.setValues({ ...result.current.values, details: { truck_number: "TRK 1" } }));
    expect(result.current.errors).toEqual({});
  });

  it("offers a retry when the routing service is down", async () => {
    planTrip.mockRejectedValue(new ApiError(503, "upstream_unavailable", "Try again."));
    const { result } = renderHook(() => usePlanner(null));
    await act(() => result.current.plan(valid));
    expect(result.current.notice).toEqual({ message: "Try again.", retry: true });

    planTrip.mockResolvedValue(sampleTrip);
    await act(() => result.current.retry());
    expect(result.current.mode).toBe("results");
    expect(result.current.notice).toBeNull();
  });

  it("opens a saved trip, toggles stop selection and starts over", () => {
    const { result } = renderHook(() => usePlanner(sampleTrip));
    expect(result.current.mode).toBe("results");
    expect(result.current.values.pickup.label).toBe("St. Louis, MO");

    act(() => result.current.selectStop("s5"));
    expect(result.current.selectedStopId).toBe("s5");
    act(() => result.current.selectStop("s5"));
    expect(result.current.selectedStopId).toBeNull();

    act(() => result.current.reset());
    expect(result.current.mode).toBe("form");
    expect(result.current.trip).toBeNull();
    expect(window.location.pathname).toBe("/");
  });

  it("clears a field's error when that field changes", async () => {
    const { result } = renderHook(() => usePlanner(null));
    await act(() => result.current.plan(EMPTY_FORM));
    act(() => result.current.setValues({ ...result.current.values, pickup: { label: "Dallas, TX" } }));
    expect(result.current.errors.pickup).toBeUndefined();
    expect(result.current.errors.current).toBe("Enter a location.");
  });

  it("discards a plan result that arrives after the form was reset", async () => {
    let resolve: (trip: typeof sampleTrip) => void = () => undefined;
    planTrip.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => usePlanner(null));
    let planning: Promise<void> = Promise.resolve();
    act(() => { planning = result.current.plan(valid); });
    act(() => result.current.reset());
    await act(async () => {
      resolve(sampleTrip);
      await planning;
    });
    expect(result.current.mode).toBe("form");
    expect(result.current.trip).toBeNull();
    expect(window.location.pathname).toBe("/");
    expect(result.current.pending).toBe(false);
  });

  it("cancels a plan still in flight when the edit is abandoned", async () => {
    let resolve: (trip: typeof sampleTrip) => void = () => undefined;
    planTrip.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => usePlanner(sampleTrip));
    act(() => result.current.edit());
    let planning: Promise<void> = Promise.resolve();
    act(() => { planning = result.current.plan(valid); });
    expect(result.current.pending).toBe(true);

    act(() => result.current.cancelEdit());
    expect(result.current.pending).toBe(false);
    await act(async () => {
      resolve({ ...sampleTrip, id: "newer" });
      await planning;
    });
    expect(result.current.mode).toBe("results");
    expect(result.current.trip).toBe(sampleTrip);
    expect(window.location.pathname).toBe("/");
  });

  it("goes back to the results and restores the trip's values after an abandoned edit", () => {
    const { result } = renderHook(() => usePlanner(sampleTrip));
    act(() => result.current.edit());
    act(() => result.current.setValues({ ...result.current.values, pickup: { label: "Dallas, TX" } }));
    act(() => result.current.cancelEdit());
    expect(result.current.mode).toBe("results");
    expect(result.current.trip).toBe(sampleTrip);
    expect(result.current.values.pickup.label).toBe("St. Louis, MO");
  });
});

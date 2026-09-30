import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./client";

function respond(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("POSTs the plan request as JSON to the slash-terminated endpoint", async () => {
    const fetchMock = respond(201, { id: "abc" });
    vi.stubGlobal("fetch", fetchMock);

    const trip = await api.planTrip({
      current_location: { label: "Chicago, IL" },
      pickup_location: { label: "St. Louis, MO" },
      dropoff_location: { label: "Dallas, TX" },
      current_cycle_used_hours: 12.5,
    });

    expect(trip).toEqual({ id: "abc" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/trips/");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toMatchObject({ current_cycle_used_hours: 12.5 });
  });

  it("turns the error envelope into an ApiError with field messages", async () => {
    vi.stubGlobal(
      "fetch",
      respond(422, {
        error: { code: "location_not_found", message: "We couldn't find it.", field: "pickup_location" },
      }),
    );
    const error = await api.planTrip({} as never).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, code: "location_not_found", field: "pickup_location" });
    expect((error as ApiError).fieldErrors()).toEqual({ pickup_location: "We couldn't find it." });
  });

  it("flattens DRF validation details into one message per field", async () => {
    vi.stubGlobal(
      "fetch",
      respond(400, {
        error: {
          code: "validation_error",
          message: "Some fields are invalid.",
          details: {
            current_cycle_used_hours: ["Ensure this value is less than or equal to 70."],
            current_location: { non_field_errors: ["Locations must be in the contiguous United States."] },
          },
        },
      }),
    );
    const error = (await api.planTrip({} as never).catch((e: unknown) => e)) as ApiError;
    expect(error.fieldErrors()).toEqual({
      current_cycle_used_hours: "Ensure this value is less than or equal to 70.",
      current_location: "Locations must be in the contiguous United States.",
    });
  });

  it("keeps nested serializer errors on their own field", async () => {
    vi.stubGlobal(
      "fetch",
      respond(400, {
        error: {
          code: "validation_error",
          message: "Some fields are invalid.",
          details: { log_details: { truck_number: ["Ensure this field has no more than 40 characters."] } },
        },
      }),
    );
    const error = (await api.planTrip({} as never).catch((e: unknown) => e)) as ApiError;
    expect(error.fieldErrors()).toEqual({
      "log_details.truck_number": "Ensure this field has no more than 40 characters.",
    });
  });

  it("reports network failures as a retryable error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const error = await api.health().catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "network_error", status: 0 });
  });

  it("lets aborted searches reject with the AbortError itself", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")));
    await expect(api.searchPlaces("chi")).rejects.toMatchObject({ name: "AbortError" });
  });

  it("encodes search queries", async () => {
    const fetchMock = respond(200, []);
    vi.stubGlobal("fetch", fetchMock);
    await api.searchPlaces("St. Louis, MO");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/geocode/?q=St.%20Louis%2C%20MO");
  });
});

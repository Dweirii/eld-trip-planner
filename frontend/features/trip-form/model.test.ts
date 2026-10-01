import { describe, expect, it } from "vitest";
import { sampleTrip } from "@/lib/api/__fixtures__";
import { EXAMPLE_TRIPS } from "./examples";
import { EMPTY_FORM, type TripFormValues, fromTrip, mapApiErrors, previewPoints, toRequest, validate } from "./model";

const filled: TripFormValues = {
  ...EMPTY_FORM,
  current: { label: "Chicago, IL", lat: 41.8781, lng: -87.6298 },
  pickup: { label: "St. Louis, MO" },
  dropoff: { label: "Dallas, TX", lat: 32.7767, lng: -96.797 },
  cycleUsed: 12.5,
};

describe("trip form model", () => {
  it("requires all three locations", () => {
    expect(validate(EMPTY_FORM)).toEqual({
      current: "Enter a location.",
      pickup: "Enter a location.",
      dropoff: "Enter a location.",
    });
    expect(validate(filled)).toEqual({});
  });

  it("checks the cycle hours and the start time", () => {
    expect(validate({ ...filled, cycleUsed: 70.25 }).cycleUsed).toBe("The cycle limit is 70 hours.");
    expect(validate({ ...filled, cycleUsed: Number.NaN }).cycleUsed).toBe("Enter the hours already used.");
    expect(validate({ ...filled, startTime: "tomorrow" }).startTime).toBe("Pick a date and time.");
    expect(validate({ ...filled, startTime: "2026-10-01T06:00" })).toEqual({});
  });

  it("mirrors the API's per-field limits for the log-sheet details", () => {
    const withDetails = (details: TripFormValues["details"]) => validate({ ...filled, details });
    expect(withDetails({ truck_number: "T".repeat(40), carrier_name: "C".repeat(120), driver_name: "D".repeat(80) })).toEqual(
      {},
    );
    expect(withDetails({ truck_number: "T".repeat(41) })).toEqual({ "details.truck_number": "Use at most 40 characters." });
    expect(withDetails({ carrier_name: "C".repeat(121) })).toEqual({ "details.carrier_name": "Use at most 120 characters." });
    expect(withDetails({ driver_name: "D".repeat(81) })).toEqual({ "details.driver_name": "Use at most 80 characters." });
    expect(withDetails({ shipping_document: "S".repeat(81) })).toEqual({
      "details.shipping_document": "Use at most 80 characters.",
    });
    expect(withDetails({ shipper_commodity: "S".repeat(160), trailer_number: ` ${"T".repeat(40)} ` })).toEqual({});
    expect(withDetails({ main_office_address: "A".repeat(161) })).toEqual({
      "details.main_office_address": "Use at most 160 characters.",
    });
  });

  it("builds the API request, sending coordinates only when both are known", () => {
    expect(
      toRequest({ ...filled, startTime: "2026-10-01T06:00", details: { driver_name: " Sam ", truck_number: " " } }),
    ).toEqual({
      current_location: { label: "Chicago, IL", lat: 41.8781, lng: -87.6298 },
      pickup_location: { label: "St. Louis, MO" },
      dropoff_location: { label: "Dallas, TX", lat: 32.7767, lng: -96.797 },
      current_cycle_used_hours: 12.5,
      start_time: "2026-10-01T06:00",
      log_details: { driver_name: "Sam" },
    });
    expect(toRequest(filled)).not.toHaveProperty("start_time");
    expect(toRequest(filled)).not.toHaveProperty("log_details");
  });

  it("maps API field errors onto form fields", () => {
    expect(
      mapApiErrors({ pickup_location: "Not found.", current_cycle_used_hours: "Too high.", other: "x" }),
    ).toEqual({ pickup: "Not found.", cycleUsed: "Too high." });
  });

  it("maps nested API errors onto the log-detail field they belong to", () => {
    expect(
      mapApiErrors({
        "log_details.truck_number": "Ensure this field has no more than 40 characters.",
        "log_details.unknown": "Odd.",
        "current_location.lat": "A valid number is required.",
      }),
    ).toEqual({
      "details.truck_number": "Ensure this field has no more than 40 characters.",
      details: "Odd.",
      current: "A valid number is required.",
    });
  });

  it("restores a planned trip into the form for editing", () => {
    const values = fromTrip(sampleTrip);
    expect(values.current).toEqual({ label: "Chicago, IL", lat: 41.8781, lng: -87.6298 });
    expect(values.cycleUsed).toBe(12.5);
    expect(values.startTime).toBe("2026-10-01T06:00");
    expect(toRequest(values).current_location).toEqual(sampleTrip.inputs.current_location);
  });

  it("previews only the places that have coordinates", () => {
    expect(previewPoints(filled.current, filled.pickup, filled.dropoff)).toEqual([
      { key: "current", kind: "start", label: "Chicago, IL", lat: 41.8781, lng: -87.6298 },
      { key: "dropoff", kind: "dropoff", label: "Dallas, TX", lat: 32.7767, lng: -96.797 },
    ]);
  });

  it("ships example trips that are valid and fully located", () => {
    expect(EXAMPLE_TRIPS.map((example) => example.id)).toEqual(["short-haul", "multi-day", "cross-country", "restart"]);
    for (const example of EXAMPLE_TRIPS) {
      expect(validate(example.values)).toEqual({});
      expect(previewPoints(example.values.current, example.values.pickup, example.values.dropoff)).toHaveLength(3);
    }
  });
});

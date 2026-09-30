/** Trip form state: validation that mirrors the API, conversion to and from API payloads. */
import { z } from "zod";
import type { Place, PlanTripRequest, StopKind, Trip } from "@/lib/api/types";

export interface LocationValue {
  label: string;
  lat?: number;
  lng?: number;
}

export const LOG_DETAIL_FIELDS = [
  { key: "driver_name", label: "Driver", placeholder: "Alex Driver" },
  { key: "co_driver_name", label: "Co-driver", placeholder: "—" },
  { key: "carrier_name", label: "Carrier", placeholder: "Milepost Freight Co." },
  { key: "main_office_address", label: "Main office", placeholder: "Green Bay, WI" },
  { key: "home_terminal_address", label: "Home terminal", placeholder: "Green Bay, WI" },
  { key: "truck_number", label: "Truck", placeholder: "TRK 1042" },
  { key: "trailer_number", label: "Trailer", placeholder: "TRL 88317" },
  { key: "shipping_document", label: "Shipping document", placeholder: "BOL-000142" },
  { key: "shipper_commodity", label: "Shipper & commodity", placeholder: "General freight" },
] as const;

export type LogDetailKey = (typeof LOG_DETAIL_FIELDS)[number]["key"];

export interface TripFormValues {
  current: LocationValue;
  pickup: LocationValue;
  dropoff: LocationValue;
  cycleUsed: number;
  /** Local home-terminal time "YYYY-MM-DDTHH:MM", or "" for "now". */
  startTime: string;
  details: Partial<Record<LogDetailKey, string>>;
}

export type FormErrors = Partial<Record<keyof TripFormValues, string>>;

export const EMPTY_FORM: TripFormValues = {
  current: { label: "" },
  pickup: { label: "" },
  dropoff: { label: "" },
  cycleUsed: 0,
  startTime: "",
  details: {},
};

const location = z.object({
  label: z.string().trim().min(1, "Enter a location.").max(200, "Keep it under 200 characters."),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

const schema = z.object({
  current: location,
  pickup: location,
  dropoff: location,
  cycleUsed: z
    .number({ error: "Enter the hours already used." })
    .min(0, "Hours can't be negative.")
    .max(70, "The cycle limit is 70 hours."),
  startTime: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a date and time."),
  details: z.record(z.string(), z.string().max(160, "Keep it under 160 characters.").optional()),
});

/** Client-side checks (the API re-validates everything). */
export function validate(values: TripFormValues): FormErrors {
  const result = schema.safeParse(values);
  if (result.success) return {};
  const errors: FormErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof TripFormValues;
    errors[field] ??= issue.message;
  }
  return errors;
}

const API_FIELDS: Record<string, keyof TripFormValues> = {
  current_location: "current",
  pickup_location: "pickup",
  dropoff_location: "dropoff",
  current_cycle_used_hours: "cycleUsed",
  start_time: "startTime",
  log_details: "details",
};

/** API field errors ({pickup_location: "…"}) → form field errors ({pickup: "…"}). */
export function mapApiErrors(fieldErrors: Record<string, string>): FormErrors {
  const errors: FormErrors = {};
  for (const [apiField, message] of Object.entries(fieldErrors)) {
    const field = API_FIELDS[apiField];
    if (field) errors[field] = message;
  }
  return errors;
}

function toLocation(value: LocationValue): PlanTripRequest["current_location"] {
  const label = value.label.trim();
  return value.lat !== undefined && value.lng !== undefined ? { label, lat: value.lat, lng: value.lng } : { label };
}

export function toRequest(values: TripFormValues): PlanTripRequest {
  const details = Object.fromEntries(
    Object.entries(values.details)
      .map(([key, value]) => [key, value?.trim() ?? ""])
      .filter(([, value]) => value),
  );
  return {
    current_location: toLocation(values.current),
    pickup_location: toLocation(values.pickup),
    dropoff_location: toLocation(values.dropoff),
    current_cycle_used_hours: Math.round(values.cycleUsed * 100) / 100,
    ...(values.startTime ? { start_time: values.startTime } : {}),
    ...(Object.keys(details).length ? { log_details: details } : {}),
  };
}

function fromPlace(place: Place): LocationValue {
  return { label: place.label, lat: place.lat, lng: place.lng };
}

/** A planned trip's inputs, back in the form (for "Edit trip"). */
export function fromTrip(trip: Trip): TripFormValues {
  const inputs = trip.inputs;
  return {
    current: fromPlace(inputs.current_location),
    pickup: fromPlace(inputs.pickup_location),
    dropoff: fromPlace(inputs.dropoff_location),
    cycleUsed: inputs.current_cycle_used_hours,
    startTime: inputs.start_time,
    details: { ...inputs.log_details },
  };
}

export interface PreviewPoint {
  key: "current" | "pickup" | "dropoff";
  kind: Extract<StopKind, "start" | "pickup" | "dropoff">;
  label: string;
  lat: number;
  lng: number;
}

/** Places already picked on the form, for the map preview before planning. */
export function previewPoints(current: LocationValue, pickup: LocationValue, dropoff: LocationValue): PreviewPoint[] {
  const candidates: [PreviewPoint["key"], PreviewPoint["kind"], LocationValue][] = [
    ["current", "start", current],
    ["pickup", "pickup", pickup],
    ["dropoff", "dropoff", dropoff],
  ];
  return candidates.flatMap(([key, kind, value]) =>
    value.lat !== undefined && value.lng !== undefined
      ? [{ key, kind, label: value.label, lat: value.lat, lng: value.lng }]
      : [],
  );
}

/** Trip form state: validation that mirrors the API, conversion to and from API payloads. */
import { z } from "zod";
import type { Place, PlanTripRequest, StopKind, Trip } from "@/lib/api/types";

export interface LocationValue {
  label: string;
  lat?: number;
  lng?: number;
}

/** Log-sheet header details; `max` mirrors LogDetailsSerializer in backend/trips/serializers.py. */
export const LOG_DETAIL_FIELDS = [
  { key: "driver_name", label: "Driver", placeholder: "Alex Driver", max: 80 },
  { key: "co_driver_name", label: "Co-driver", placeholder: "—", max: 80 },
  { key: "carrier_name", label: "Carrier", placeholder: "Milepost Freight Co.", max: 120 },
  { key: "main_office_address", label: "Main office", placeholder: "Green Bay, WI", max: 160 },
  { key: "home_terminal_address", label: "Home terminal", placeholder: "Green Bay, WI", max: 160 },
  { key: "truck_number", label: "Truck", placeholder: "TRK 1042", max: 40 },
  { key: "trailer_number", label: "Trailer", placeholder: "TRL 88317", max: 40 },
  { key: "shipping_document", label: "Shipping document", placeholder: "BOL-000142", max: 80 },
  { key: "shipper_commodity", label: "Shipper & commodity", placeholder: "General freight", max: 160 },
] as const;

export type LogDetailKey = (typeof LOG_DETAIL_FIELDS)[number]["key"];

const DETAIL_KEYS: ReadonlySet<string> = new Set(LOG_DETAIL_FIELDS.map((field) => field.key));

function isDetailKey(key: string): key is LogDetailKey {
  return DETAIL_KEYS.has(key);
}

export interface TripFormValues {
  current: LocationValue;
  pickup: LocationValue;
  dropoff: LocationValue;
  cycleUsed: number;
  /** Local home-terminal time "YYYY-MM-DDTHH:MM", or "" for "now". */
  startTime: string;
  details: Partial<Record<LogDetailKey, string>>;
}

/** A form field, or one log-sheet detail ("details.truck_number"); "details" alone is for the section as a whole. */
export type FormErrorKey = keyof TripFormValues | `details.${LogDetailKey}`;

export type FormErrors = Partial<Record<FormErrorKey, string>>;

export function detailErrorKey(key: LogDetailKey): FormErrorKey {
  return `details.${key}`;
}

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
  details: z.object(
    Object.fromEntries(
      LOG_DETAIL_FIELDS.map(({ key, max }) => [
        key,
        // The API trims before it checks the length, and so does toRequest().
        z.string().trim().max(max, `Use at most ${max} characters.`).optional(),
      ]),
    ),
  ),
});

/** Client-side checks (the API re-validates everything). */
export function validate(values: TripFormValues): FormErrors {
  const result = schema.safeParse(values);
  if (result.success) return {};
  const errors: FormErrors = {};
  for (const issue of result.error.issues) {
    const [field, detail] = issue.path;
    const key: FormErrorKey =
      field === "details" && typeof detail === "string" && isDetailKey(detail)
        ? detailErrorKey(detail)
        : (field as keyof TripFormValues);
    errors[key] ??= issue.message;
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

/**
 * API field errors → form field errors: {pickup_location: "…"} → {pickup: "…"}, and nested ones
 * {"log_details.truck_number": "…"} → {"details.truck_number": "…"}.
 */
export function mapApiErrors(fieldErrors: Record<string, string>): FormErrors {
  const errors: FormErrors = {};
  for (const [apiField, message] of Object.entries(fieldErrors)) {
    const [top, sub] = apiField.split(".", 2);
    const field = API_FIELDS[top];
    if (!field) continue;
    const key = field === "details" && sub && isDetailKey(sub) ? detailErrorKey(sub) : field;
    errors[key] ??= message;
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

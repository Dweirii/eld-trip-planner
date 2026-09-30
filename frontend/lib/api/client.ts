/** Browser calls to the Milepost API, proxied at /api/ by next.config.ts. */
import type { ApiErrorBody, Place, PlanTripRequest, Trip } from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** One message per request field, from `field` and from DRF validation `details`. */
  fieldErrors(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (this.field) errors[this.field] = this.message;
    if (this.details && typeof this.details === "object") {
      for (const [key, value] of Object.entries(this.details as Record<string, unknown>)) {
        const message = firstMessage(value);
        if (message) errors[key] = message;
      }
    }
    return errors;
  }
}

function firstMessage(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return firstMessage(value[0]);
  if (value && typeof value === "object") return firstMessage(Object.values(value)[0]);
  return undefined;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "network_error", "Can't reach the server. Check your connection and try again.");
  }

  const body = (await response.json().catch(() => null)) as { error?: ApiErrorBody } | T | null;
  if (!response.ok) {
    const error = (body as { error?: ApiErrorBody } | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "server_error",
      error?.message ?? "Something went wrong on our side. Please try again.",
      error?.field ?? undefined,
      error?.details ?? undefined,
    );
  }
  return body as T;
}

export const api = {
  planTrip: (input: PlanTripRequest) =>
    request<Trip>("/api/trips/", { method: "POST", body: JSON.stringify(input) }),
  searchPlaces: (query: string, signal?: AbortSignal) =>
    request<Place[]>(`/api/geocode/?q=${encodeURIComponent(query)}`, { signal }),
  reversePlace: (lat: number, lng: number) =>
    request<Place>(`/api/geocode/reverse/?lat=${lat}&lng=${lng}`),
  health: () => request<{ status: string; engine_version: string }>("/api/health/"),
};

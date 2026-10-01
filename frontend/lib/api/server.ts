/** Server-side trip lookup for /trips/[id] (called from a Server Component). */
import type { Trip } from "./types";

/** Long enough for a cold serverless API to wake up; after that the error page offers a retry. */
const TIMEOUT_MS = 15_000;

export async function fetchTrip(id: string): Promise<Trip | null> {
  const base = (process.env.API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");
  const response = await fetch(`${base}/api/trips/${encodeURIComponent(id)}/`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Trip API responded with ${response.status}`);
  return (await response.json()) as Trip;
}

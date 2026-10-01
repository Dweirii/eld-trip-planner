import type { Trip } from "../types";
import raw from "./trip-multi-day.json";

/**
 * A real API payload (backend/scripts/export_sample_trip.py): Chicago → St. Louis → Dallas,
 * cycle 12.5 h, starting 2026-10-01 06:00 CDT; 972.1 mi over 2 log days, rest at Jasper, AR.
 */
export const sampleTrip = raw as unknown as Trip;

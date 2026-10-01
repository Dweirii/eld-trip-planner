/** One-click example trips that exercise every rule (coordinates included, so no geocoding). */
import { EMPTY_FORM, type TripFormValues } from "./model";

export interface ExampleTrip {
  id: string;
  label: string;
  hint: string;
  values: TripFormValues;
}

const place = (label: string, lat: number, lng: number) => ({ label, lat, lng });

export const EXAMPLE_TRIPS: ExampleTrip[] = [
  {
    id: "short-haul",
    label: "Short haul",
    hint: "Same-day Texas run",
    values: {
      ...EMPTY_FORM,
      current: place("Dallas, TX", 32.7767, -96.797),
      pickup: place("Fort Worth, TX", 32.7555, -97.3308),
      dropoff: place("Houston, TX", 29.7604, -95.3698),
      cycleUsed: 20,
    },
  },
  {
    id: "multi-day",
    label: "Multi-day",
    hint: "Chicago to Dallas with a 10-hour rest",
    values: {
      ...EMPTY_FORM,
      current: place("Chicago, IL", 41.8781, -87.6298),
      pickup: place("St. Louis, MO", 38.627, -90.1994),
      dropoff: place("Dallas, TX", 32.7767, -96.797),
      cycleUsed: 12.5,
    },
  },
  {
    id: "cross-country",
    label: "Cross-country",
    hint: "2,900 miles with fuel stops",
    values: {
      ...EMPTY_FORM,
      current: place("New York, NY", 40.7128, -74.006),
      pickup: place("Newark, NJ", 40.7357, -74.1724),
      dropoff: place("Los Angeles, CA", 34.0522, -118.2437),
      cycleUsed: 0,
    },
  },
  {
    id: "restart",
    label: "Restart needed",
    hint: "62 hours already used, so a 34-hour restart",
    values: {
      ...EMPTY_FORM,
      current: place("Atlanta, GA", 33.749, -84.388),
      pickup: place("Nashville, TN", 36.1627, -86.7816),
      dropoff: place("Denver, CO", 39.7392, -104.9903),
      cycleUsed: 62,
    },
  },
];

import { describe, expect, it } from "vitest";
import { sampleTrip } from "@/lib/api/__fixtures__";
import { dailyMiles } from "./miles";

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

describe("dailyMiles", () => {
  it("gives whole miles per day that add up to the rounded trip total", () => {
    // 603.5 + 368.6 = 972.1: rounding each day on its own gives 604 + 369 = 973.
    const perDay = sampleTrip.daily_logs.map((log) => log.miles_today);
    const whole = dailyMiles(perDay, sampleTrip.summary.total_miles);
    expect(whole).toEqual([603, 369]);
    expect(sum(whole)).toBe(Math.round(sampleTrip.summary.total_miles));
  });

  it("hands the leftover miles to the days with the largest fractions", () => {
    expect(dailyMiles([10.4, 10.4, 10.2], 31)).toEqual([11, 10, 10]);
    expect(dailyMiles([0.5, 0.5, 0.5, 0.5], 2)).toEqual([1, 1, 0, 0]);
    expect(dailyMiles([100.9, 0, 50.2], 151.1)).toEqual([101, 0, 50]);
  });

  it("takes miles back from the smallest fractions when the days add up to more than the total", () => {
    expect(dailyMiles([10.1, 10.3], 19)).toEqual([9, 10]);
    expect(dailyMiles([0.2, 3.1], 2)).toEqual([0, 2]);
  });

  it("leaves whole-mile days alone", () => {
    expect(dailyMiles([120, 80, 0], 200)).toEqual([120, 80, 0]);
    expect(dailyMiles([], 0)).toEqual([]);
  });
});

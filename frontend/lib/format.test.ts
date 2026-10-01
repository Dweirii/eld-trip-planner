import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addDays,
  cityOf,
  clockTime,
  duration,
  isoDate,
  logHours,
  miles,
  minuteLabel,
  minutesBetween,
  shortDate,
  stepMiles,
} from "./format";

afterEach(() => vi.unstubAllEnvs());

describe("format", () => {
  it("reads clock time and date straight from home-terminal ISO strings", () => {
    expect(clockTime("2026-10-01T06:00:00-05:00")).toBe("06:00");
    expect(isoDate("2026-10-02T11:45:00-05:00")).toBe("2026-10-02");
  });

  it("does not depend on the browser's time zone", () => {
    vi.stubEnv("TZ", "Asia/Karachi");
    expect(clockTime("2026-10-01T23:30:00-05:00")).toBe("23:30");
    expect(shortDate("2026-10-01")).toBe("Thu, Oct 1");
    vi.stubEnv("TZ", "Pacific/Auckland");
    expect(shortDate("2026-10-01")).toBe("Thu, Oct 1");
  });

  it("formats durations, log hours and miles", () => {
    expect(duration(45)).toBe("45 min");
    expect(duration(90)).toBe("1h30");
    expect(duration(600)).toBe("10h");
    expect(duration(1785)).toBe("29h45");
    expect(logHours(11)).toBe("11");
    expect(logHours(7.75)).toBe("7.75");
    expect(logHours(6.0)).toBe("6");
    expect(miles(2934.7)).toBe("2,935");
    expect(miles(972.1)).toBe("972");
  });

  it("keeps a decimal on step distances under 10 miles", () => {
    expect(stepMiles(0.1)).toBe("0.1");
    expect(stepMiles(0.42)).toBe("0.4");
    expect(stepMiles(9.94)).toBe("9.9");
    expect(stepMiles(9.96)).toBe("10");
    expect(stepMiles(31.5)).toBe("32");
    expect(stepMiles(1234.4)).toBe("1,234");
  });

  it("measures minutes between timestamps and labels minutes of the day", () => {
    expect(minutesBetween("2026-10-01T06:00:00-05:00", "2026-10-02T11:45:00-05:00")).toBe(1785);
    expect(minuteLabel(0)).toBe("00:00");
    expect(minuteLabel(645)).toBe("10:45");
    expect(minuteLabel(1440)).toBe("24:00");
  });

  it("adds calendar days to a date without the browser's time zone", () => {
    vi.stubEnv("TZ", "Pacific/Auckland");
    expect(addDays("2026-10-01", 0)).toBe("2026-10-01");
    expect(addDays("2026-10-01", 1)).toBe("2026-10-02");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 2)).toBe("2027-01-02");
    vi.stubEnv("TZ", "America/Los_Angeles");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02"); // a DST change in the browser's zone
  });

  it("extracts the city from a place label", () => {
    expect(cityOf("St. Louis, MO")).toBe("St. Louis");
    expect(cityOf("2100 Ross Ave Tower, Dallas, TX")).toBe("2100 Ross Ave Tower");
  });
});

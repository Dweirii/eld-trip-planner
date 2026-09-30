import { afterEach, describe, expect, it } from "vitest";
import {
  cityOf,
  clockTime,
  duration,
  isoDate,
  logHours,
  miles,
  minuteLabel,
  minutesBetween,
  shortDate,
} from "./format";

const originalTz = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTz;
});

describe("format", () => {
  it("reads clock time and date straight from home-terminal ISO strings", () => {
    expect(clockTime("2026-10-01T06:00:00-05:00")).toBe("06:00");
    expect(isoDate("2026-10-02T11:45:00-05:00")).toBe("2026-10-02");
  });

  it("does not depend on the browser's time zone", () => {
    process.env.TZ = "Asia/Karachi";
    expect(clockTime("2026-10-01T23:30:00-05:00")).toBe("23:30");
    expect(shortDate("2026-10-01")).toBe("Thu, Oct 1");
    process.env.TZ = "Pacific/Auckland";
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

  it("measures minutes between timestamps and labels minutes of the day", () => {
    expect(minutesBetween("2026-10-01T06:00:00-05:00", "2026-10-02T11:45:00-05:00")).toBe(1785);
    expect(minuteLabel(0)).toBe("00:00");
    expect(minuteLabel(645)).toBe("10:45");
    expect(minuteLabel(1440)).toBe("24:00");
  });

  it("extracts the city from a place label", () => {
    expect(cityOf("St. Louis, MO")).toBe("St. Louis");
    expect(cityOf("2100 Ross Ave Tower, Dallas, TX")).toBe("2100 Ross Ave Tower");
  });
});

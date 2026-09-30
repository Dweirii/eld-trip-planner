import { describe, expect, it } from "vitest";
import { sampleTrip } from "@/lib/api/__fixtures__";
import { dayIndexForStop, stopForBracket } from "./linking";

const { stops, daily_logs: logs } = sampleTrip;

describe("bracket ↔ stop linking", () => {
  it("finds the stop behind each bracket, including a rest carried past midnight", () => {
    const ids = logs.map((log) => log.brackets.map((b) => stopForBracket(stops, log.date, b)?.id));
    expect(ids).toEqual([
      ["s3", "s5"],
      ["s5", "s7"],
    ]);
  });

  it("finds the log day a stop starts on", () => {
    const byId = Object.fromEntries(stops.map((s) => [s.id, s]));
    expect(dayIndexForStop(logs, byId.s0)).toBe(0);
    expect(dayIndexForStop(logs, byId.s5)).toBe(0);
    expect(dayIndexForStop(logs, byId.s7)).toBe(1);
  });
});

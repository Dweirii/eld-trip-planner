import { describe, expect, it } from "vitest";
import { sampleTrip } from "@/lib/api/__fixtures__";
import {
  BRACKET_TOP,
  GRID,
  GRID_BOTTOM,
  HOUR_LABELS,
  bracketLabels,
  bracketPath,
  changePoints,
  dutyPath,
  hourLines,
  minuteToX,
  quarterTicks,
  rowCenterY,
  statusAt,
} from "./geometry";

const [day1, day2] = sampleTrip.daily_logs;

describe("log grid geometry", () => {
  it("maps minutes across a 624-unit, 24-hour grid", () => {
    expect(minuteToX(0)).toBe(GRID.left);
    expect(minuteToX(360)).toBe(252);
    expect(minuteToX(705)).toBe(401.5);
    expect(minuteToX(1440)).toBe(GRID.left + GRID.width);
  });

  it("puts the four duty lines in paper-log order", () => {
    expect(rowCenterY("off_duty")).toBe(35);
    expect(rowCenterY("sleeper_berth")).toBe(61);
    expect(rowCenterY("driving")).toBe(87);
    expect(rowCenterY("on_duty")).toBe(113);
    expect(GRID_BOTTOM).toBe(126);
  });

  it("draws the duty line as horizontal runs joined by vertical drops", () => {
    expect(dutyPath(day1.segments)).toBe("M96,35 H252 V87 H401.5 V113 H427.5 V87 H564 V61 H720");
    expect(dutyPath(day2.segments)).toBe("M96,61 H200 V87 H375.5 V113 H401.5 V35 H720");
  });

  it("marks each status change with a pair of points", () => {
    expect(changePoints(day1.segments)).toEqual([
      { x: 252, y: 35 }, { x: 252, y: 87 },
      { x: 401.5, y: 87 }, { x: 401.5, y: 113 },
      { x: 427.5, y: 113 }, { x: 427.5, y: 87 },
      { x: 564, y: 87 }, { x: 564, y: 61 },
    ]);
  });

  it("has an hour line every hour and quarter ticks in every row", () => {
    expect(hourLines()).toHaveLength(25);
    expect(quarterTicks()).toHaveLength(4 * 24 * 3);
    expect(HOUR_LABELS).toHaveLength(25);
    expect([HOUR_LABELS[0], HOUR_LABELS[12], HOUR_LABELS[24]]).toEqual(["Mid-night", "Noon", "Mid-night"]);
  });

  it("draws brackets under stationary periods and skips crowded labels", () => {
    expect(bracketPath(705, 765)).toBe(`M401.5,${BRACKET_TOP} v7 H427.5 v-7`);
    expect(bracketLabels(day1.brackets)).toEqual([
      { index: 0, x: 404.5, place: "St. Louis, MO" },
      { index: 1, x: 567, place: "Jasper, AR" },
    ]);
    const crowded = [
      { start_minute: 705, end_minute: 720, place: "A" },
      { start_minute: 720, end_minute: 765, place: "B" },
    ];
    expect(bracketLabels(crowded).map((label) => label.place)).toEqual(["A"]);
  });

  it("finds the duty status at a minute of the day (the last segment owns midnight)", () => {
    const segments = sampleTrip.daily_logs[0].segments;
    expect(statusAt(segments, 0)).toBe("off_duty");
    expect(statusAt(segments, 359.5)).toBe("off_duty");
    expect(statusAt(segments, 360)).toBe("driving");
    expect(statusAt(segments, 705)).toBe("on_duty");
    expect(statusAt(segments, 1440)).toBe("sleeper_berth");
    expect(statusAt([], 600)).toBeNull();
  });
});

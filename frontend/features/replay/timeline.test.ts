import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleTrip } from "@/lib/api/__fixtures__";
import type { Stop, Trip } from "@/lib/api/types";
import {
  type Interval,
  announcement,
  arrivalText,
  buildTimeline,
  clockAt,
  dayMarks,
  pointAlong,
  routeLocator,
  stateAt,
  stateDetail,
  stopMarks,
  stopSteps,
  stretchText,
  totalMinutes,
  valueText,
} from "./timeline";

afterEach(() => vi.unstubAllEnvs());

/** The sample trip (Chicago → St. Louis → Dallas, 06:00 CDT) with extra stops spliced in before the dropoff. */
function withStops(...extra: Partial<Stop>[]): Trip {
  const [start, pickup, rest, dropoff] = sampleTrip.stops;
  const added = extra.map(
    (stop, index) =>
      ({ ...rest, id: `x${index}`, duration_minutes: 30, lat: 34, lng: -95, ...stop }) as Stop,
  );
  return { ...sampleTrip, stops: [start, pickup, rest, ...added, dropoff] };
}

// Fri, Oct 2: 04:00 rest ends at mile 603.5; 08:00–08:30 a 30-min break at mile 800; 10:45 dropoff at 972.1.
const tripWithBreak = withStops({
  kind: "break",
  status: "off_duty",
  starts_at: "2026-10-02T08:00:00-05:00",
  ends_at: "2026-10-02T08:30:00-05:00",
  mile: 800,
  place: "Durant, OK",
});

describe("buildTimeline", () => {
  it("alternates driving and stops from the first stop's start to the last stop's end", () => {
    type Span = [startMin: number, endMin: number];
    const drive = ([startMin, endMin]: Span, fromStopId: string, toStopId: string, mileStart: number, mileEnd: number) =>
      ({ startMin, endMin, status: "driving", kind: "drive", fromStopId, toStopId, mileStart, mileEnd }) as const;
    const stop = ([startMin, endMin]: Span, stopId: string, what: Pick<Interval, "status" | "kind">, mile: number) =>
      ({ startMin, endMin, ...what, stopId, mileStart: mile, mileEnd: mile }) as const;
    expect(buildTimeline(sampleTrip)).toEqual<Interval[]>([
      drive([0, 345], "s0", "s3", 0, 314.8),
      stop([345, 405], "s3", { status: "on_duty", kind: "pickup" }, 314.8),
      drive([405, 720], "s3", "s5", 314.8, 603.5),
      stop([720, 1320], "s5", { status: "sleeper_berth", kind: "rest" }, 603.5),
      drive([1320, 1725], "s5", "s7", 603.5, 972.1),
      stop([1725, 1785], "s7", { status: "on_duty", kind: "dropoff" }, 972.1),
    ]);
  });

  it("is contiguous, with no empty intervals, and lasts door to door", () => {
    for (const trip of [sampleTrip, tripWithBreak]) {
      const timeline = buildTimeline(trip);
      expect(timeline[0].startMin).toBe(0);
      timeline.slice(1).forEach((interval, index) => expect(interval.startMin).toBe(timeline[index].endMin));
      timeline.forEach((interval) => expect(interval.endMin).toBeGreaterThan(interval.startMin));
      expect(totalMinutes(timeline)).toBe(1785); // Thu 06:00 → Fri 11:45
    }
  });

  it("skips the drive between back-to-back stops", () => {
    const fuel = { kind: "fuel", status: "on_duty", mile: 780 } as const;
    const brk = { kind: "break", status: "off_duty", mile: 780 } as const;
    const trip = withStops(
      { ...fuel, starts_at: "2026-10-02T07:30:00-05:00", ends_at: "2026-10-02T08:00:00-05:00" },
      { ...brk, starts_at: "2026-10-02T08:00:00-05:00", ends_at: "2026-10-02T08:30:00-05:00" },
    );
    const kinds = buildTimeline(trip).map((interval) => interval.kind);
    expect(kinds).toEqual(["drive", "pickup", "drive", "rest", "drive", "fuel", "break", "drive", "dropoff"]);
  });

  it("reads the minutes from the timestamps, whatever the browser's time zone", () => {
    vi.stubEnv("TZ", "Asia/Kolkata");
    expect(buildTimeline(sampleTrip).map((interval) => interval.startMin)).toEqual([0, 345, 405, 720, 1320, 1725]);
  });
});

describe("stateAt", () => {
  const timeline = buildTimeline(sampleTrip);

  it("starts out driving from mile 0 towards the pickup", () => {
    expect(stateAt(timeline, 0)).toEqual({ index: 0, status: "driving", kind: "drive", toStopId: "s3", mile: 0 });
  });

  it("interpolates the mile while driving", () => {
    expect(stateAt(timeline, 172.5).mile).toBeCloseTo(157.4, 6); // half of the first leg
    expect(stateAt(timeline, 1522.5).mile).toBeCloseTo((603.5 + 972.1) / 2, 6);
    expect(stateAt(timeline, 344.9).status).toBe("driving");
  });

  it("switches at the exact boundaries (an interval owns its start, not its end)", () => {
    expect(stateAt(timeline, 345)).toEqual({ index: 1, status: "on_duty", kind: "pickup", stopId: "s3", mile: 314.8 });
    expect(stateAt(timeline, 720)).toMatchObject({ status: "sleeper_berth", kind: "rest", stopId: "s5" });
    expect(stateAt(timeline, 1320)).toMatchObject({ index: 4, status: "driving", toStopId: "s7", mile: 603.5 });
  });

  it("stays put during a 10-h rest", () => {
    const rest = { index: 3, status: "sleeper_berth", kind: "rest", stopId: "s5", mile: 603.5 };
    expect(stateAt(timeline, 1000)).toEqual(rest);
  });

  it("is off duty inside a 30-min break", () => {
    const withBreak = buildTimeline(tripWithBreak);
    const at = 1560 + 15; // Fri 08:15
    expect(stateAt(withBreak, at)).toMatchObject({ status: "off_duty", kind: "break", stopId: "x0", mile: 800 });
    expect(stateAt(withBreak, 1559).status).toBe("driving");
    expect(stateAt(withBreak, 1590)).toMatchObject({ status: "driving", toStopId: "s7", mile: 800 });
  });

  it("ends at the dropoff, and clamps times outside the trip", () => {
    const end = { index: 5, status: "on_duty", kind: "dropoff", stopId: "s7", mile: 972.1 };
    expect(stateAt(timeline, 1785)).toEqual(end);
    expect(stateAt(timeline, 9999)).toEqual(end);
    expect(stateAt(timeline, -30)).toEqual(stateAt(timeline, 0));
  });
});

describe("pointAlong", () => {
  // 1° of longitude on the equator, then 3° north along a meridian: a quarter, then three quarters, of the length.
  const bent: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 3],
  ];

  it("returns the ends at 0 and 1", () => {
    expect(pointAlong(bent, 0)).toEqual([0, 0]);
    expect(pointAlong(bent, 1)).toEqual([1, 3]);
    expect(pointAlong(bent, -0.2)).toEqual([0, 0]);
    expect(pointAlong(bent, 1.5)).toEqual([1, 3]);
  });

  it("measures by great-circle length, not by vertex count", () => {
    const [lng, lat] = pointAlong(bent, 0.5)!;
    expect(lng).toBeCloseTo(1, 9);
    expect(lat).toBeCloseTo(1, 9);
    const [lng2, lat2] = pointAlong(bent, 0.125)!;
    expect(lng2).toBeCloseTo(0.5, 9);
    expect(lat2).toBeCloseTo(0, 9);
  });

  it("follows the fixture's route from Chicago to Dallas", () => {
    const coordinates = sampleTrip.route.geometry.coordinates as [number, number][];
    expect(pointAlong(coordinates, 0)).toEqual([-87.6298, 41.8781]);
    expect(pointAlong(coordinates, 1)).toEqual([-96.797, 32.7767]);
    const locate = routeLocator(coordinates);
    expect(locate(0.5)).toEqual(pointAlong(coordinates, 0.5));
  });

  it("copes with a degenerate line", () => {
    expect(pointAlong([[5, 5]], 0.5)).toEqual([5, 5]);
    expect(pointAlong([[5, 5], [5, 5]], 0.5)).toEqual([5, 5]);
    expect(pointAlong([], 0.5)).toBeNull();
  });
});

describe("clockAt", () => {
  it("reads home-terminal time from the start timestamp, across midnight", () => {
    for (const zone of ["Asia/Karachi", "Pacific/Auckland", "America/Los_Angeles"]) {
      vi.stubEnv("TZ", zone);
      expect(clockAt(sampleTrip, 0)).toEqual({
        dateLabel: "Thu, Oct 1",
        time: "06:00",
        isoDate: "2026-10-01",
        minuteOfDay: 360,
      });
      expect(clockAt(sampleTrip, 1079.5)).toEqual({
        dateLabel: "Thu, Oct 1",
        time: "23:59",
        isoDate: "2026-10-01",
        minuteOfDay: 1439.5,
      });
      expect(clockAt(sampleTrip, 1080)).toMatchObject({ dateLabel: "Fri, Oct 2", time: "00:00", minuteOfDay: 0 });
      expect(clockAt(sampleTrip, 1080).isoDate).toBe("2026-10-02");
      expect(clockAt(sampleTrip, 1785)).toMatchObject({ dateLabel: "Fri, Oct 2", time: "11:45", minuteOfDay: 705 });
    }
  });

  it("names dates that match the daily logs", () => {
    const dates = sampleTrip.daily_logs.map((log) => log.date);
    expect(dates).toContain(clockAt(sampleTrip, 100).isoDate);
    expect(dates).toContain(clockAt(sampleTrip, 1500).isoDate);
  });
});

describe("scrubber marks", () => {
  it("puts a day mark at every midnight inside the trip", () => {
    expect(dayMarks(sampleTrip, 1785)).toEqual([
      { t: 0, label: "Day 1" },
      { t: 1080, label: "Day 2" },
    ]);
    // Starting at 23:00, the first midnight comes an hour in.
    const late = "2026-10-01T23:00:00-05:00";
    const lateTrip = { ...sampleTrip, stops: [{ ...sampleTrip.stops[0], starts_at: late }] };
    expect(dayMarks(lateTrip, 2900)).toEqual([
      { t: 0, label: "Day 1" },
      { t: 60, label: "Day 2" },
      { t: 1500, label: "Day 3" },
    ]);
  });

  it("places every stop, the start included, at the minute it begins", () => {
    expect(stopMarks(sampleTrip)).toEqual([
      { t: 0, id: "s0", kind: "start" },
      { t: 345, id: "s3", kind: "pickup" },
      { t: 720, id: "s5", kind: "rest" },
      { t: 1725, id: "s7", kind: "dropoff" },
    ]);
  });

  it("steps from stop to stop, then to the end (the reduced-motion playback)", () => {
    expect(stopSteps(buildTimeline(sampleTrip))).toEqual([345, 720, 1725, 1785]);
    expect(stopSteps(buildTimeline(tripWithBreak))).toEqual([345, 720, 1560, 1725, 1785]);
  });
});

describe("describing the state", () => {
  const timeline = buildTimeline(sampleTrip);

  it("gives the mile while driving and the stop while stopped", () => {
    expect(stateDetail(sampleTrip, stateAt(timeline, 1522.5))).toBe("mile 788");
    expect(stateDetail(sampleTrip, stateAt(timeline, 1000))).toBe("10-h rest at Jasper, AR");
    expect(stateDetail(sampleTrip, stateAt(timeline, 360))).toBe("Pickup at St. Louis, MO");
  });

  it("announces where the truck is heading, or what the driver is doing", () => {
    expect(announcement(sampleTrip, stateAt(timeline, 10))).toBe("Driving to St. Louis, MO");
    expect(announcement(sampleTrip, stateAt(timeline, 1000))).toBe("Sleeper berth: 10-h rest at Jasper, AR");
    expect(announcement(sampleTrip, stateAt(timeline, 1785))).toBe("On duty (not driving): Dropoff at Dallas, TX");
  });

  it("announces the arrival at the last stop", () => {
    expect(arrivalText(sampleTrip)).toBe("Arrived at Dallas, TX");
  });

  it("reads a playing scrubber by stretch, so it only changes when its words do", () => {
    const read = (t: number) => stretchText(sampleTrip, clockAt(sampleTrip, t), stateAt(timeline, t));
    expect(read(10)).toBe("Thu, Oct 1: Driving to St. Louis, MO");
    expect(read(300)).toBe(read(10));
    expect(read(360)).toBe("Thu, Oct 1: On duty (not driving), Pickup at St. Louis, MO");
    expect(read(1000)).toBe("Thu, Oct 1: Sleeper berth, 10-h rest at Jasper, AR");
    expect(read(1100)).toBe("Fri, Oct 2: Sleeper berth, 10-h rest at Jasper, AR");
  });

  it("reads the scrubber position as date, time, status and detail", () => {
    const at = 1522.5;
    expect(valueText(sampleTrip, clockAt(sampleTrip, at), stateAt(timeline, at))).toBe(
      "Fri, Oct 2, 07:22 CDT: Driving, mile 788",
    );
    expect(valueText(sampleTrip, clockAt(sampleTrip, 1000), stateAt(timeline, 1000))).toBe(
      "Thu, Oct 1, 22:40 CDT: Sleeper berth, 10-h rest at Jasper, AR",
    );
  });
});

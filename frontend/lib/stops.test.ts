import { describe, expect, it } from "vitest";
import type { StopKind } from "./api/types";
import { SHAPE_PATHS, STOP_STYLE, stopIconLayers } from "./stops";

const KINDS: StopKind[] = ["start", "pickup", "dropoff", "fuel", "break", "rest", "restart"];

describe("stop styles", () => {
  it("gives every stop kind its own shape, so colour is never the only cue", () => {
    const shapes = KINDS.map((kind) => STOP_STYLE[kind].shape);
    expect(new Set(shapes).size).toBe(KINDS.length);
    expect(new Set(shapes.map((shape) => SHAPE_PATHS[shape])).size).toBe(KINDS.length);
  });

  it("keeps the spec's colours", () => {
    expect(Object.fromEntries(KINDS.map((kind) => [kind, STOP_STYLE[kind].color]))).toEqual({
      start: "#043b4b",
      pickup: "#f84960",
      dropoff: "#f84960",
      fuel: "#f5a524",
      break: "#7fcdc4",
      rest: "#043b4b",
      restart: "#043b4b",
    });
  });

  it("draws a white outline under each shape, and the start as a white ring edged in deep teal", () => {
    const [outline, body] = stopIconLayers("fuel");
    expect(outline).toMatchObject({ d: SHAPE_PATHS.diamond, fill: "#fff", stroke: "#fff" });
    expect(body).toMatchObject({ d: SHAPE_PATHS.diamond, fill: "#f5a524" });

    const [, ring] = stopIconLayers("start");
    expect(ring).toMatchObject({ d: SHAPE_PATHS.ring, fill: "#fff", stroke: "#043b4b" });
  });
});

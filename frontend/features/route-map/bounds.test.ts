import { describe, expect, it } from "vitest";
import { boundsOf } from "./bounds";

describe("boundsOf", () => {
  it("returns the south-west and north-east corners", () => {
    expect(
      boundsOf([
        [-87.63, 41.88],
        [-90.2, 38.63],
        [-96.8, 32.78],
      ]),
    ).toEqual([
      [-96.8, 32.78],
      [-87.63, 41.88],
    ]);
  });

  it("returns null for no points", () => {
    expect(boundsOf([])).toBeNull();
  });
});

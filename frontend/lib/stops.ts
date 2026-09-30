/** Display names and marker styles shared by the map, the legend, the itinerary and the trip form. */
import type { DutyStatus, StopKind } from "./api/types";

export const STATUS_NAMES: Record<DutyStatus, string> = {
  off_duty: "Off duty",
  sleeper_berth: "Sleeper berth",
  driving: "Driving",
  on_duty: "On duty (not driving)",
};

export type StopShape = "ring" | "circle" | "square" | "diamond" | "triangle" | "pill" | "star";

export interface StopStyle {
  label: string;
  color: string;
  shape: StopShape;
}

/** Colour plus a shape of its own, so no stop is told apart by colour alone. */
export const STOP_STYLE: Record<StopKind, StopStyle> = {
  start: { label: "Depart", color: "#043b4b", shape: "ring" },
  pickup: { label: "Pickup", color: "#f84960", shape: "circle" },
  dropoff: { label: "Dropoff", color: "#f84960", shape: "square" },
  fuel: { label: "Fuel", color: "#f5a524", shape: "diamond" },
  break: { label: "30-min break", color: "#7fcdc4", shape: "triangle" },
  rest: { label: "10-h rest", color: "#043b4b", shape: "pill" },
  restart: { label: "34-h restart", color: "#043b4b", shape: "star" },
};

/** Icons are drawn on a 20 × 20 grid; each shape is about 14–16 units across, centred. */
export const ICON_VIEWBOX = "0 0 20 20";

export const SHAPE_PATHS: Record<StopShape, string> = {
  ring: "M10 4.5a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11z",
  circle: "M10 3a7 7 0 1 0 0 14a7 7 0 1 0 0-14z",
  square: "M6 4h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  diamond: "M10 2 18 10 10 18 2 10z",
  triangle: "M10 2.5 17.5 15.5H2.5z",
  // A bed: a long, low pill.
  pill: "M6.5 5.5h7a4.5 4.5 0 0 1 0 9h-7a4.5 4.5 0 0 1 0-9z",
  star: "M10 2.1 12.35 7.36 18.08 7.97 13.8 11.84 15 17.48 10 14.6 5 17.48 6.2 11.84 1.92 7.97 7.65 7.36z",
};

const OUTLINE = 3;
const RING = 3;

export interface IconLayer {
  d: string;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
}

/** A white outline (so the icon reads on the map), then the coloured shape; the start is a white ring edged in its colour. */
export function stopIconLayers(kind: StopKind): IconLayer[] {
  const { color, shape } = STOP_STYLE[kind];
  const d = SHAPE_PATHS[shape];
  if (shape === "ring") {
    return [
      { d, fill: "#fff", stroke: "#fff", strokeWidth: RING + OUTLINE },
      { d, fill: "#fff", stroke: color, strokeWidth: RING },
    ];
  }
  return [
    { d, fill: "#fff", stroke: "#fff", strokeWidth: OUTLINE },
    { d, fill: color },
  ];
}

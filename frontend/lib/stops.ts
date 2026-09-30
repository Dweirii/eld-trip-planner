/** Display names and marker styles shared by the map, the itinerary and the log sheets. */
import type { DutyStatus, StopKind } from "./api/types";

export const STATUS_NAMES: Record<DutyStatus, string> = {
  off_duty: "Off duty",
  sleeper_berth: "Sleeper berth",
  driving: "Driving",
  on_duty: "On duty (not driving)",
};

export interface StopStyle {
  label: string;
  color: string;
  shape: "ring" | "circle" | "square" | "diamond";
}

/** Colour plus shape, so no stop is told apart by colour alone. */
export const STOP_STYLE: Record<StopKind, StopStyle> = {
  start: { label: "Depart", color: "#043b4b", shape: "ring" },
  pickup: { label: "Pickup", color: "#f84960", shape: "circle" },
  dropoff: { label: "Dropoff", color: "#f84960", shape: "square" },
  fuel: { label: "Fuel", color: "#f5a524", shape: "diamond" },
  break: { label: "30-min break", color: "#7fcdc4", shape: "circle" },
  rest: { label: "10-h rest", color: "#043b4b", shape: "circle" },
  restart: { label: "34-h restart", color: "#043b4b", shape: "diamond" },
};

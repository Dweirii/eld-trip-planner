/** Drawing math for the paper Driver's Daily Log grid, in SVG user units (viewBox 0 0 780 250). */
import type { Bracket, DutyStatus, Segment } from "@/lib/api/types";

export const MINUTES_PER_DAY = 1440;
export const VIEWBOX = { width: 780, height: 215 } as const;
export const GRID = { left: 96, top: 22, width: 624, rowHeight: 26, totalsX: 736 } as const;
export const ROWS: readonly DutyStatus[] = ["off_duty", "sleeper_berth", "driving", "on_duty"];
export const GRID_BOTTOM = GRID.top + GRID.rowHeight * ROWS.length;
export const BRACKET_TOP = GRID_BOTTOM + 6;
export const BRACKET_DEPTH = 7;
export const LABEL_Y = BRACKET_TOP + 18;

function numbers(from: number, to: number): string[] {
  return Array.from({ length: to - from + 1 }, (_, i) => String(from + i));
}

export const HOUR_LABELS: readonly string[] = [
  "Mid-night",
  ...numbers(1, 11),
  "Noon",
  ...numbers(1, 11),
  "Mid-night",
];

/** Compact numbers for SVG paths: 401.5 → "401.5", 35 → "35". */
function fmt(value: number): string {
  return String(Number(value.toFixed(2)));
}

export function minuteToX(minute: number): number {
  // Multiply before dividing so quarter-hour minutes land on exact binary fractions (705 → 401.5).
  return GRID.left + (minute * GRID.width) / MINUTES_PER_DAY;
}

export function rowTop(status: DutyStatus): number {
  return GRID.top + ROWS.indexOf(status) * GRID.rowHeight;
}

export function rowCenterY(status: DutyStatus): number {
  return rowTop(status) + GRID.rowHeight / 2;
}

/** The duty-status line: horizontal runs joined by vertical drops at each change. */
export function dutyPath(segments: readonly Segment[]): string {
  return segments
    .map((segment, index) => {
      const y = fmt(rowCenterY(segment.status));
      const x0 = fmt(minuteToX(segment.start_minute));
      const x1 = fmt(minuteToX(segment.end_minute));
      return index === 0 ? `M${x0},${y} H${x1}` : `V${y} H${x1}`;
    })
    .join(" ");
}

export interface Point {
  x: number;
  y: number;
}

/** Where the pen changes line: the corner before and after each vertical drop. */
export function changePoints(segments: readonly Segment[]): Point[] {
  const points: Point[] = [];
  for (let i = 1; i < segments.length; i += 1) {
    const x = minuteToX(segments[i].start_minute);
    points.push({ x, y: rowCenterY(segments[i - 1].status) }, { x, y: rowCenterY(segments[i].status) });
  }
  return points;
}

/** x of every hour line, midnight to midnight. */
export function hourLines(): number[] {
  return Array.from({ length: 25 }, (_, hour) => minuteToX(hour * 60));
}

export interface Tick {
  x: number;
  y1: number;
  y2: number;
}

/** Quarter-hour ticks hanging from the top of every row; the half-hour tick is longer. */
export function quarterTicks(): Tick[] {
  const ticks: Tick[] = [];
  for (const status of ROWS) {
    const top = rowTop(status);
    for (let hour = 0; hour < 24; hour += 1) {
      for (const quarter of [15, 30, 45]) {
        const length = GRID.rowHeight * (quarter === 30 ? 0.45 : 0.28);
        ticks.push({ x: minuteToX(hour * 60 + quarter), y1: top, y2: top + length });
      }
    }
  }
  return ticks;
}

/** A bracket under the grid spanning a stationary period (like the FMCSA completed example). */
export function bracketPath(startMinute: number, endMinute: number): string {
  const x0 = fmt(minuteToX(startMinute));
  const x1 = fmt(minuteToX(endMinute));
  return `M${x0},${BRACKET_TOP} v${BRACKET_DEPTH} H${x1} v-${BRACKET_DEPTH}`;
}

export interface BracketLabel {
  index: number;
  x: number;
  place: string;
}

/** Slanted place labels under brackets, skipping any that would overprint the previous one. */
export function bracketLabels(brackets: readonly Bracket[], minGap = 22): BracketLabel[] {
  const labels: BracketLabel[] = [];
  let lastX = Number.NEGATIVE_INFINITY;
  brackets.forEach((bracket, index) => {
    const x = minuteToX(bracket.start_minute) + 3;
    if (x - lastX >= minGap) {
      labels.push({ index, x, place: bracket.place });
      lastX = x;
    }
  });
  return labels;
}

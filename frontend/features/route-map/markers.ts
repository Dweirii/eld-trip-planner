/** DOM for map markers and popups. Text only (place names come from users and data files). */
import type { Stop, StopKind } from "@/lib/api/types";
import { clockTime, duration, isoDate, miles, shortDate } from "@/lib/format";
import { STATUS_NAMES, STOP_STYLE } from "@/lib/stops";

export function createMarkerElement(kind: StopKind, label: string): HTMLDivElement {
  const element = document.createElement("div");
  element.className = "stop-marker";
  element.dataset.shape = STOP_STYLE[kind].shape;
  element.style.setProperty("--marker-color", STOP_STYLE[kind].color);
  element.setAttribute("role", "button");
  element.setAttribute("tabindex", "0");
  element.setAttribute("aria-label", label);
  element.title = label;
  element.append(document.createElement("span"));
  return element;
}

export function stopTitle(stop: Stop): string {
  return `${STOP_STYLE[stop.kind].label} · ${stop.place}`;
}

function when(iso: string): string {
  return `${shortDate(isoDate(iso))} ${clockTime(iso)}`;
}

export function stopPopupLines(stop: Stop): string[] {
  const time =
    stop.duration_minutes > 0
      ? `${when(stop.starts_at)} → ${
          isoDate(stop.ends_at) === isoDate(stop.starts_at) ? clockTime(stop.ends_at) : when(stop.ends_at)
        } (${duration(stop.duration_minutes)})`
      : when(stop.starts_at);
  return [time, `${STATUS_NAMES[stop.status]} · mile ${miles(stop.mile)}`];
}

export function popupContent(title: string, lines: readonly string[]): HTMLDivElement {
  const root = document.createElement("div");
  root.className = "text-[12px] leading-snug text-text";
  const heading = document.createElement("strong");
  heading.className = "block text-[12.5px]";
  heading.textContent = title;
  root.append(heading);
  for (const line of lines) {
    const row = document.createElement("span");
    row.className = "block text-muted";
    row.textContent = line;
    root.append(row);
  }
  return root;
}

import { describe, expect, it } from "vitest";
import { sampleTrip } from "@/lib/api/__fixtures__";
import { SHAPE_PATHS } from "@/lib/stops";
import { createMarkerElement, popupContent, stopPopupLines, stopTitle } from "./markers";

const rest = sampleTrip.stops.find((stop) => stop.kind === "rest")!;

describe("map markers", () => {
  it("draws each stop kind's shape and colour, and makes it keyboard reachable", () => {
    const element = createMarkerElement("fuel", "Fuel · Joplin, MO");
    expect(element).toHaveClass("stop-marker");
    expect(element.dataset.shape).toBe("diamond");
    const paths = [...element.querySelectorAll("svg path")];
    expect(paths.map((path) => path.getAttribute("d"))).toEqual([SHAPE_PATHS.diamond, SHAPE_PATHS.diamond]);
    expect(paths[1]).toHaveAttribute("fill", "#f5a524");
    expect(element.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(element).toHaveAttribute("role", "button");
    expect(element).toHaveAttribute("tabindex", "0");
    expect(element).toHaveAccessibleName("Fuel · Joplin, MO");
  });

  it("describes a stop for its popup", () => {
    expect(stopTitle(rest)).toBe("10-h rest · Jasper, AR");
    expect(stopPopupLines(rest)).toEqual(["Thu, Oct 1 18:00 → Fri, Oct 2 04:00 (10h)", "Sleeper berth · mile 604"]);
  });

  it("uses a distinct shape for rests and restarts", () => {
    expect(createMarkerElement("rest", "10-h rest").dataset.shape).toBe("pill");
    expect(createMarkerElement("restart", "34-h restart").dataset.shape).toBe("star");
    expect(createMarkerElement("break", "30-min break").dataset.shape).toBe("triangle");
  });

  it("never parses a label as HTML", () => {
    const element = createMarkerElement("pickup", "<img src=x onerror=alert(1)>");
    expect(element.querySelector("img")).toBeNull();
    expect(element).toHaveAccessibleName("<img src=x onerror=alert(1)>");
  });

  it("builds popups from text, never HTML", () => {
    const popup = popupContent("<img src=x onerror=alert(1)>", ["<b>bold</b>"]);
    expect(popup.querySelector("img")).toBeNull();
    expect(popup.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});

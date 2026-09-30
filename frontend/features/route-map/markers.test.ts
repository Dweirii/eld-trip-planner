import { describe, expect, it } from "vitest";
import { sampleTrip } from "@/lib/api/__fixtures__";
import { createMarkerElement, popupContent, stopPopupLines, stopTitle } from "./markers";

const rest = sampleTrip.stops.find((stop) => stop.kind === "rest")!;

describe("map markers", () => {
  it("gives each stop kind a colour and a shape, and makes it keyboard reachable", () => {
    const element = createMarkerElement("fuel", "Fuel · Joplin, MO");
    expect(element).toHaveClass("stop-marker");
    expect(element.dataset.shape).toBe("diamond");
    expect(element.style.getPropertyValue("--marker-color")).toBe("#f5a524");
    expect(element).toHaveAttribute("role", "button");
    expect(element).toHaveAttribute("tabindex", "0");
    expect(element).toHaveAccessibleName("Fuel · Joplin, MO");
  });

  it("describes a stop for its popup", () => {
    expect(stopTitle(rest)).toBe("10-h rest · Jasper, AR");
    expect(stopPopupLines(rest)).toEqual(["Thu, Oct 1 18:00 → Fri, Oct 2 04:00 (10h)", "Sleeper berth · mile 604"]);
  });

  it("builds popups from text, never HTML", () => {
    const popup = popupContent("<img src=x onerror=alert(1)>", ["<b>bold</b>"]);
    expect(popup.querySelector("img")).toBeNull();
    expect(popup.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});

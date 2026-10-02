import { describe, expect, it } from "vitest";
import { TOUR_STEPS } from "./steps";
import { PLANNING_VOICE, VOICE_LINES, voiceSrc } from "./voice";

describe("the guided tour's voice lines", () => {
  it("has one line per step, plus the planning line, and no line without a step", () => {
    const ids = TOUR_STEPS.flatMap((step) => (step.id === "plan" ? [step.id, PLANNING_VOICE] : [step.id]));
    expect(Object.keys(VOICE_LINES)).toEqual(ids);
  });

  it("speaks the brief's lines", () => {
    expect(VOICE_LINES.intro).toBe(
      "Milepost plans a truck trip under F M C S A Hours of Service rules, and fills in the driver's daily logs.",
    );
    expect(VOICE_LINES.plan).toBe("Plan the trip.");
    expect(VOICE_LINES[PLANNING_VOICE]).toBe(
      "It's routing a heavy truck, then simulating every hour under the Hours of Service rules.",
    );
    expect(VOICE_LINES.share).toBe("Every trip gets a shareable link. Thanks for watching.");
  });

  it("is written to be spoken: no digits, slashes or symbols", () => {
    for (const [id, line] of Object.entries(VOICE_LINES)) {
      expect(line, id).toMatch(/^[A-Za-z][A-Za-z ,.:'-]+\.$/);
    }
  });

  it("names each clip's static file", () => {
    expect(voiceSrc("next-day")).toBe("/tour/voice/next-day.mp3");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { createNarrator } from "./narrator";

/** As much of an HTMLAudioElement as the narrator uses. */
class FakeAudio extends EventTarget {
  src = "";
  preload = "";
  paused = true;
  plays = 0;
  loads = 0;
  /** The DOMException name the next play() is rejected with (null: it plays). */
  refuse: string | null = null;

  play() {
    this.plays++;
    if (this.refuse) return Promise.reject(new DOMException("refused", this.refuse));
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  load() {
    this.loads++;
  }
  /** The clip plays to its end. */
  end() {
    this.paused = true;
    this.dispatchEvent(new Event("ended"));
  }
  /** The file is missing or can't be decoded. */
  fail() {
    this.dispatchEvent(new Event("error"));
  }
}

function setup() {
  const made: FakeAudio[] = [];
  const narrator = createNarrator({
    audio: () => {
      const audio = new FakeAudio();
      made.push(audio);
      return audio as unknown as HTMLAudioElement;
    },
  });
  return { narrator, made, player: () => made[0] };
}

/** What a play() promise has resolved with ("pending" until it does). */
function outcome(promise: Promise<boolean>) {
  const result: { heard: boolean | "pending" } = { heard: "pending" };
  void promise.then((heard) => (result.heard = heard));
  return result;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => vi.restoreAllMocks());

describe("createNarrator", () => {
  it("plays a step's clip and resolves once it has been heard to its end", async () => {
    const { narrator, made, player } = setup();
    expect(made).toHaveLength(0);
    const spoken = outcome(narrator.play("intro"));
    expect(player().src).toBe("/tour/voice/intro.mp3");
    expect(player().preload).toBe("auto");
    expect(player().paused).toBe(false);
    await settle();
    expect(spoken.heard).toBe("pending");
    player().end();
    await settle();
    expect(spoken.heard).toBe(true);
  });

  it("uses one audio element for every clip", async () => {
    const { narrator, made, player } = setup();
    void narrator.play("intro");
    player().end();
    void narrator.play("current");
    expect(made).toHaveLength(1);
    expect(player().src).toBe("/tour/voice/current.mp3");
  });

  it("resolves at once, quietly, when the clip is missing or broken", async () => {
    const noise = [vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "log")];
    const { narrator, player } = setup();
    const missing = outcome(narrator.play("intro"));
    player().fail();
    await settle();
    expect(missing.heard).toBe(false);

    player().refuse = "NotSupportedError";
    const broken = outcome(narrator.play("current"));
    await settle();
    expect(broken.heard).toBe(false);
    expect(narrator.blocked).toBe(false);
    noise.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it("pauses the clip and resumes it where it was", async () => {
    const { narrator, player } = setup();
    const spoken = outcome(narrator.play("intro"));
    narrator.pause();
    expect(player().paused).toBe(true);
    await settle();
    expect(spoken.heard).toBe("pending");
    narrator.resume();
    expect(player().paused).toBe(false);
    expect(player().src).toBe("/tour/voice/intro.mp3");
    player().end();
    await settle();
    expect(spoken.heard).toBe(true);
  });

  it("keeps a clip that was paused before it began, for resume", async () => {
    const { narrator, player } = setup();
    void narrator.play("warm-up");
    player().end();
    // The browser rejects a play() that pause() interrupts.
    player().refuse = "AbortError";
    const spoken = outcome(narrator.play("intro"));
    narrator.pause();
    await settle();
    expect(spoken.heard).toBe("pending");
    player().refuse = null;
    narrator.resume();
    player().end();
    await settle();
    expect(spoken.heard).toBe(true);
  });

  it("holds a clip that is asked for while paused until the tour resumes", () => {
    const { narrator, player } = setup();
    narrator.pause();
    void narrator.play("intro");
    expect(player().plays).toBe(0);
    narrator.resume();
    expect(player().plays).toBe(1);
  });

  it("stops the clip at once, and has nothing left to resume", async () => {
    const { narrator, player } = setup();
    const spoken = outcome(narrator.play("intro"));
    narrator.stop();
    expect(player().paused).toBe(true);
    await settle();
    expect(spoken.heard).toBe(false);
    narrator.pause();
    narrator.resume();
    expect(player().plays).toBe(1);
  });

  it("cuts the clip in flight when another is played", async () => {
    const { narrator, player } = setup();
    const first = outcome(narrator.play("intro"));
    const second = outcome(narrator.play("current"));
    await settle();
    expect(first.heard).toBe(false);
    player().end();
    await settle();
    expect(second.heard).toBe(true);
  });

  it("plays nothing while it is disabled, and cuts the clip when it is turned off", async () => {
    const { narrator, made, player } = setup();
    narrator.setEnabled(false);
    const silent = outcome(narrator.play("intro"));
    narrator.preload(["current"]);
    await settle();
    expect(silent.heard).toBe(false);
    expect(made).toHaveLength(0);

    narrator.setEnabled(true);
    const spoken = outcome(narrator.play("intro"));
    narrator.setEnabled(false);
    expect(player().paused).toBe(true);
    await settle();
    expect(spoken.heard).toBe(false);
  });

  it("carries on silently when the browser refuses to play without a click, until it is unblocked", async () => {
    const { narrator, player } = setup();
    const changes = vi.fn();
    narrator.subscribe(changes);
    void narrator.play("warm-up");
    player().end();

    player().refuse = "NotAllowedError";
    const refused = outcome(narrator.play("intro"));
    await settle();
    expect(refused.heard).toBe(false);
    expect(narrator.blocked).toBe(true);
    expect(changes).toHaveBeenCalledTimes(1);

    // Blocked: the next steps don't even try.
    const plays = player().plays;
    const skipped = outcome(narrator.play("current"));
    await settle();
    expect(skipped.heard).toBe(false);
    expect(player().plays).toBe(plays);

    // The click on the voice button: audio from the next step on.
    player().refuse = null;
    narrator.unblock();
    expect(narrator.blocked).toBe(false);
    expect(changes).toHaveBeenCalledTimes(2);
    expect(player().loads).toBe(1);
    const spoken = outcome(narrator.play("stops"));
    player().end();
    await settle();
    expect(spoken.heard).toBe(true);
  });

  it("fetches the coming clips ahead, and lets go of the ones that have passed", () => {
    const { narrator, made } = setup();
    narrator.preload(["current", "stops"]);
    expect(made.map((audio) => [audio.src, audio.preload, audio.plays])).toEqual([
      ["/tour/voice/current.mp3", "auto", 0],
      ["/tour/voice/stops.mp3", "auto", 0],
    ]);
    narrator.preload(["stops", "cycle"]);
    expect(made.map((audio) => audio.src)).toEqual([
      "/tour/voice/current.mp3",
      "/tour/voice/stops.mp3",
      "/tour/voice/cycle.mp3",
    ]);
  });

  it("stays silent where there is no audio at all", async () => {
    const narrator = createNarrator({ audio: () => null });
    const spoken = outcome(narrator.play("intro"));
    narrator.preload(["current"]);
    narrator.pause();
    narrator.resume();
    narrator.stop();
    await settle();
    expect(spoken.heard).toBe(false);
  });
});

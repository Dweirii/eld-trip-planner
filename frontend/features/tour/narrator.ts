/**
 * The guided tour's voice: plays each step's pre-generated clip (a static file under /tour/voice/) on
 * one audio element. Nothing here can break the tour: a clip that is missing, broken, stalled or refused
 * by the browser's autoplay policy just isn't heard, and the tour carries on at its own pace.
 */
import { type Scheduler, type TourVoice, browserScheduler, createPausableClock } from "./runner";
import { voiceSrc } from "./voice";

export interface Narrator extends TourVoice {
  /** Off: nothing plays (the clip in flight is cut) and nothing is fetched. */
  setEnabled(enabled: boolean): void;
  /** The browser refused to play without a click (a direct load of /?tour=1): silent until unblock(). */
  readonly blocked: boolean;
  /** Call from the click or key press that asks for the voice: clips play again from the next step. */
  unblock(): void;
  /** Told when `blocked` changes. */
  subscribe(listener: () => void): () => void;
}

export interface NarratorOptions {
  /** Makes an audio element (null: this browser has none). */
  audio?: () => HTMLAudioElement | null;
  scheduler?: Scheduler;
}

/** A clip may end this long after its length says it should (ms); after that it has stalled. */
const STALL_GRACE = 3000;
/** A clip whose length isn't known (its metadata hasn't loaded) gets this long in all (ms). */
const UNKNOWN_LENGTH_LIMIT = 20_000;

const browserAudio = () => (typeof Audio === "undefined" ? null : new Audio());

export function createNarrator({
  audio: createAudio = browserAudio,
  scheduler = browserScheduler,
}: NarratorOptions = {}): Narrator {
  // Times the stall limit: it stands still while the tour is paused.
  const clock = createPausableClock(scheduler);
  let enabled = true;
  let blocked = false;
  /** The tour is paused: the clip waits for resume(). */
  let held = false;
  // Made for the first clip, so a visitor who never starts the tour loads nothing.
  let player: HTMLAudioElement | null = null;
  /** Settles the clip in flight (true: heard to its end); null when none is. */
  let settle: ((heard: boolean) => void) | null = null;
  /** Cancels the stall limit of the clip in flight. */
  let limit: AbortController | null = null;
  /** The coming clips, fetched ahead; the player then finds them in the browser's cache. */
  const ahead = new Map<string, HTMLAudioElement>();
  const listeners = new Set<() => void>();

  function setBlocked(next: boolean) {
    if (blocked === next) return;
    blocked = next;
    listeners.forEach((listener) => listener());
  }

  function start(audio: HTMLAudioElement) {
    const clip = settle;
    let playing: Promise<void> | undefined;
    try {
      playing = audio.play();
    } catch {
      clip?.(false);
      return;
    }
    playing?.catch((error: unknown) => {
      // Cut or replaced since: its rejection is old news.
      if (settle !== clip) return;
      const name = typeof error === "object" && error !== null && "name" in error ? error.name : "";
      // pause() came before the clip began: resume() starts it again.
      if (name === "AbortError") return;
      if (name === "NotAllowedError") setBlocked(true);
      clip?.(false);
    });
  }

  function stop() {
    player?.pause();
    settle?.(false);
  }

  /**
   * A clip that stalls (it never ends, and never fails) must not hold its step for ever: once it is
   * overdue, it is cut and counts as not heard. Set again whenever the clip's length becomes known.
   */
  function watch(audio: HTMLAudioElement) {
    limit?.abort();
    const overdue = new AbortController();
    limit = overdue;
    const known = Number.isFinite(audio.duration) && audio.duration > 0;
    const left = known ? Math.max(0, audio.duration - audio.currentTime) * 1000 + STALL_GRACE : UNKNOWN_LENGTH_LIMIT;
    clock.sleep(left, overdue.signal).then(stop, () => undefined);
  }

  return {
    play(id) {
      stop();
      if (!enabled || blocked) return Promise.resolve(false);
      const audio = (player ??= createAudio());
      if (!audio) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        const onEnded = () => done(true);
        const onError = () => done(false);
        const onLength = () => watch(audio);
        const done = (heard: boolean) => {
          if (settle !== done) return;
          settle = null;
          limit?.abort();
          limit = null;
          audio.removeEventListener("ended", onEnded);
          audio.removeEventListener("error", onError);
          audio.removeEventListener("durationchange", onLength);
          resolve(heard);
        };
        settle = done;
        audio.addEventListener("ended", onEnded);
        audio.addEventListener("error", onError);
        audio.addEventListener("durationchange", onLength);
        audio.preload = "auto";
        audio.src = voiceSrc(id);
        watch(audio);
        if (!held) start(audio);
      });
    },
    pause() {
      held = true;
      clock.pause();
      if (settle) player?.pause();
    },
    resume() {
      held = false;
      clock.resume();
      if (settle && player) start(player);
    },
    stop,
    preload(ids) {
      if (!enabled) return;
      for (const id of [...ahead.keys()]) if (!ids.includes(id)) ahead.delete(id);
      for (const id of ids) {
        if (ahead.has(id)) continue;
        const audio = createAudio();
        if (!audio) return;
        audio.preload = "auto";
        audio.src = voiceSrc(id);
        ahead.set(id, audio);
      }
    },
    setEnabled(next) {
      enabled = next;
      if (!enabled) stop();
    },
    get blocked() {
      return blocked;
    },
    unblock() {
      // Safari lifts its no-autoplay rule for an element that is loaded inside a click.
      if (blocked && !settle) player?.load();
      setBlocked(false);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * The guided tour's narration: what is SPOKEN at each step, by step id. It is worded for speech (no
 * symbols, numbers as words, nothing that changes with the trip), so every clip is a static file; the
 * captions on screen stay in steps.ts. The text lives in voice-lines.json, which
 * scripts/generate-tour-voice.mjs reads to make the clips.
 */
import lines from "./voice-lines.json";

export const VOICE_LINES: Readonly<Record<string, string>> = lines;

/** The plan step's second clip, spoken only while the plan is still on its way when "Plan the trip." ends. */
export const PLANNING_VOICE = "planning";

/** Where a clip is served from (public/tour/voice/). */
export const voiceSrc = (id: string) => `/tour/voice/${id}.mp3`;

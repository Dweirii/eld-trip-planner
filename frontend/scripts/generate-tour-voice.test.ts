// @vitest-environment node
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "./generate-tour-voice.mjs";

const KEY = "sk_test_never_printed_0123456789";
const BRIAN = { voice_id: "brian-id", name: "Brian", category: "premade" };
const VOICES = [
  { voice_id: "cloned-id", name: "My clone", category: "cloned" },
  { voice_id: "aria-id", name: "Aria", category: "premade" },
  BRIAN,
];
const LINES = { intro: "Milepost plans a truck trip.", plan: "Plan the trip." };

interface Call {
  method: string;
  url: string;
  key: string | null;
  body: { text: string; model_id: string; voice_settings: Record<string, number> } | null;
}

let root: string;
let paths: { lines: string; out: string; envFile: string };
let calls: Call[];
let output: string[];
/** What the next text-to-speech calls answer with (0: the clip), before they all answer with the clip. */
let failures: number[];
let voices: typeof VOICES;
/** What listing the voices answers with (0: the voices). A key limited to text-to-speech gets a 401. */
let listing: number;

const speech = () => calls.filter((call) => call.method === "POST");
const clip = (text: string) => `mp3:${text}`;
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const manifest = () => JSON.parse(readFileSync(join(paths.out, "manifest.json"), "utf8"));

/** ElevenLabs, as far as the script uses it. */
const fakeFetch: typeof fetch = async (input, init) => {
  const url = String(input);
  const headers = new Headers(init?.headers);
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  calls.push({ method: init?.method ?? "GET", url, key: headers.get("xi-api-key"), body });
  if (headers.get("xi-api-key") !== KEY) return Response.json({ detail: { status: "invalid_api_key" } }, { status: 401 });
  if (url === "https://api.elevenlabs.io/v1/voices") {
    if (!listing) return Response.json({ voices });
    const detail = { status: "missing_permissions", message: "The API key you used is missing the permission voices_read" };
    return Response.json({ detail }, { status: listing });
  }
  const failure = failures.shift();
  if (failure) return Response.json({ detail: { status: "busy" } }, { status: failure });
  return new Response(clip(body.text), { headers: { "Content-Type": "audio/mpeg" } });
};

function run(argv: string[] = [], env: Record<string, string> = { ELEVENLABS_API_KEY: KEY }) {
  return main(argv, {
    env,
    fetch: fakeFetch,
    log: (line: string) => output.push(line),
    error: (line: string) => output.push(line),
    wait: async () => undefined,
    paths,
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tour-voice-"));
  paths = { lines: join(root, "voice-lines.json"), out: join(root, "public", "tour", "voice"), envFile: join(root, ".env.tts") };
  writeFileSync(paths.lines, JSON.stringify(LINES));
  calls = [];
  output = [];
  failures = [];
  voices = VOICES;
  listing = 0;
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("generate-tour-voice", () => {
  it("resolves the voice by name, whatever its case, and speaks each line with it", async () => {
    expect(await run([], { ELEVENLABS_API_KEY: KEY, ELEVENLABS_VOICE: "brian" })).toBe(0);
    expect(calls[0]).toMatchObject({ method: "GET", url: "https://api.elevenlabs.io/v1/voices", key: KEY });
    expect(speech().map((call) => call.url)).toEqual([
      "https://api.elevenlabs.io/v1/text-to-speech/brian-id?output_format=mp3_44100_128",
      "https://api.elevenlabs.io/v1/text-to-speech/brian-id?output_format=mp3_44100_128",
    ]);
    expect(speech()[0]).toMatchObject({
      key: KEY,
      body: {
        text: LINES.intro,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      },
    });
    expect(speech()[1].body?.text).toBe(LINES.plan);
  });

  it("defaults to Brian, and takes a voice id or a name with a description after it", async () => {
    await run();
    expect(speech()[0].url).toContain("/text-to-speech/brian-id?");

    calls = [];
    await run(["--force"], { ELEVENLABS_API_KEY: KEY, ELEVENLABS_VOICE: "aria-id" });
    expect(speech()[0].url).toContain("/text-to-speech/aria-id?");

    calls = [];
    voices = [{ ...BRIAN, name: "Brian - Deep, Resonant and Comforting" }];
    await run(["--force"]);
    expect(speech()[0].url).toContain("/text-to-speech/brian-id?");
  });

  it("uses a voice id as given, without listing the voices", async () => {
    listing = 401;
    expect(await run([], { ELEVENLABS_API_KEY: KEY, ELEVENLABS_VOICE: "nPczCjzI2devNBz1zQrb" })).toBe(0);
    expect(calls.map((call) => call.method)).toEqual(["POST", "POST"]);
    expect(speech()[0].url).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/nPczCjzI2devNBz1zQrb?output_format=mp3_44100_128",
    );
    expect(manifest().intro.voice).toBe("nPczCjzI2devNBz1zQrb");
    expect(output.join("\n")).toMatch(/Voice: nPczCjzI2devNBz1zQrb.*as given/);
  });

  it("falls back to its own table of premade voices when the key may not list them (401 or 403)", async () => {
    listing = 401;
    expect(await run()).toBe(0);
    expect(calls[0]).toMatchObject({ method: "GET", url: "https://api.elevenlabs.io/v1/voices" });
    expect(speech()).toHaveLength(2);
    expect(speech()[0].url).toContain("/text-to-speech/nPczCjzI2devNBz1zQrb?");
    expect(output.join("\n")).toMatch(/Voice: Brian \(nPczCjzI2devNBz1zQrb\).*built-in/);

    const ids = { george: "JBFqnCBsd6RMkjVDRZzb", SARAH: "EXAVITQu4vr4xnSDxMaL", Rachel: "21m00Tcm4TlvDq8ikWAM", adam: "pNInz6obpgDQGcFmaJgB" };
    listing = 403;
    for (const [name, id] of Object.entries(ids)) {
      calls = [];
      expect(await run(["--force"], { ELEVENLABS_API_KEY: KEY, ELEVENLABS_VOICE: name })).toBe(0);
      expect(speech()[0].url).toContain(`/text-to-speech/${id}?`);
    }
  });

  it("stops with a clear message when the key may not list voices and the name is not in its table", async () => {
    listing = 401;
    expect(await run([], { ELEVENLABS_API_KEY: KEY, ELEVENLABS_VOICE: "Nobody" })).toBe(1);
    expect(speech()).toEqual([]);
    expect(existsSync(paths.out)).toBe(false);
    const said = output.join("\n");
    expect(said).toMatch(/"Nobody"/);
    expect(said).toMatch(/voice id/);
    expect(said).toMatch(/Voices: Read/);
    expect(said).not.toContain(KEY);
  });

  it("still fails on any other error from listing the voices", async () => {
    listing = 500;
    expect(await run()).toBe(1);
    expect(speech()).toEqual([]);
    expect(output.join("\n")).toMatch(/500/);
  });

  it("falls back to the first premade voice, and says which, when nothing matches", async () => {
    expect(await run([], { ELEVENLABS_API_KEY: KEY, ELEVENLABS_VOICE: "Nobody" })).toBe(0);
    expect(speech()[0].url).toContain("/text-to-speech/aria-id?");
    expect(output.join("\n")).toMatch(/Nobody.*first premade voice.*Aria/);
  });

  it("writes one mp3 per line and a manifest of what it made", async () => {
    expect(await run()).toBe(0);
    expect(readdirSync(paths.out).sort()).toEqual(["intro.mp3", "manifest.json", "plan.mp3"]);
    expect(readFileSync(join(paths.out, "intro.mp3"), "utf8")).toBe(clip(LINES.intro));
    expect(manifest()).toEqual({
      intro: { hash: sha256(LINES.intro), voice: "brian-id", bytes: clip(LINES.intro).length },
      plan: { hash: sha256(LINES.plan), voice: "brian-id", bytes: clip(LINES.plan).length },
    });
  });

  it("skips the clips whose text is unchanged, and makes them all again with --force", async () => {
    await run();
    calls = [];
    expect(await run()).toBe(0);
    expect(speech()).toEqual([]);

    writeFileSync(paths.lines, JSON.stringify({ ...LINES, plan: "Plan the trip, now." }));
    await run();
    expect(speech().map((call) => call.body?.text)).toEqual(["Plan the trip, now."]);
    expect(manifest().plan.hash).toBe(sha256("Plan the trip, now."));

    calls = [];
    await run(["--force"]);
    expect(speech()).toHaveLength(2);
  });

  it("makes a clip again when its file is gone or the voice changes, and drops a line that was removed", async () => {
    await run();
    rmSync(join(paths.out, "plan.mp3"));
    calls = [];
    await run();
    expect(speech().map((call) => call.body?.text)).toEqual([LINES.plan]);

    calls = [];
    await run([], { ELEVENLABS_API_KEY: KEY, ELEVENLABS_VOICE: "Aria" });
    expect(speech()).toHaveLength(2);
    expect(manifest().intro.voice).toBe("aria-id");

    writeFileSync(paths.lines, JSON.stringify({ intro: LINES.intro }));
    await run([], { ELEVENLABS_API_KEY: KEY, ELEVENLABS_VOICE: "Aria" });
    expect(existsSync(join(paths.out, "plan.mp3"))).toBe(false);
    expect(Object.keys(manifest())).toEqual(["intro"]);
  });

  it("retries once on a 429 or a 5xx", async () => {
    failures = [429];
    expect(await run()).toBe(0);
    expect(speech().map((call) => call.body?.text)).toEqual([LINES.intro, LINES.intro, LINES.plan]);
    expect(readFileSync(join(paths.out, "intro.mp3"), "utf8")).toBe(clip(LINES.intro));

    calls = [];
    failures = [503];
    expect(await run(["--force"])).toBe(0);
    expect(speech()).toHaveLength(3);
  });

  it("stops with exit code 1 when the retry fails too, keeping the clips it already made", async () => {
    await run();
    writeFileSync(paths.lines, JSON.stringify({ intro: "A new intro.", plan: "A new plan." }));
    // The first clip is made; the second is refused twice.
    failures = [0, 429, 429];
    expect(await run()).toBe(1);
    expect(output.join("\n")).toMatch(/429/);
    expect(manifest().intro.hash).toBe(sha256("A new intro."));
    expect(manifest().plan.hash).toBe(sha256(LINES.plan));
  });

  it("fails cleanly without a key: exit code 1, a clear message, and no request", async () => {
    expect(await run([], {})).toBe(1);
    expect(output.join("\n")).toMatch(/ELEVENLABS_API_KEY[\s\S]*\.env\.tts/);
    expect(calls).toEqual([]);

    writeFileSync(paths.envFile, "ELEVENLABS_API_KEY=\n");
    expect(await run([], {})).toBe(1);
    expect(calls).toEqual([]);
    expect(existsSync(paths.out)).toBe(false);
  });

  it("reads the key from .env.tts, and never prints it", async () => {
    writeFileSync(paths.envFile, `# ElevenLabs\nELEVENLABS_API_KEY="${KEY}"\n`);
    expect(await run([], {})).toBe(0);
    expect(calls.every((call) => call.key === KEY)).toBe(true);

    // A failure that quotes the request back must not leak it either.
    voices = [];
    expect(await run(["--force"], {})).toBe(1);
    const failing: typeof fetch = async () => {
      throw new Error(`connect failed for xi-api-key ${KEY}`);
    };
    const print = (line: string) => output.push(line);
    expect(await main([], { env: {}, fetch: failing, log: print, error: print, paths })).toBe(1);
    expect(output.length).toBeGreaterThan(3);
    expect(output.join("\n")).not.toContain(KEY);
  });
});

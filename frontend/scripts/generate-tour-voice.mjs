// Makes the guided tour's narration: one mp3 per line of features/tour/voice-lines.json, spoken by
// ElevenLabs, written to public/tour/voice/<step-id>.mp3. The clips are committed; the app only plays
// the files, with no key and no call at run time.
//
//   pnpm gen:voice            make the clips whose text (or voice) changed
//   pnpm gen:voice --force    make them all again
//
// ELEVENLABS_API_KEY comes from the environment, or from .env.tts at the repository root (git-ignored).
// ELEVENLABS_VOICE is a voice name or id (default: Brian). The key is never printed.
//
// A key limited to text-to-speech is enough: a voice id is used as given, and when the key may not list
// the account's voices, a name is looked up in the small table of premade voices below.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const API = "https://api.elevenlabs.io/v1";
const OUTPUT_FORMAT = "mp3_44100_128";
const MODEL = "eleven_multilingual_v2";
const VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.75 };
const DEFAULT_VOICE = "Brian";
/** ElevenLabs' premade voices by name, for a key that may not list the account's voices. */
const PREMADE_VOICES = {
  Brian: "nPczCjzI2devNBz1zQrb",
  George: "JBFqnCBsd6RMkjVDRZzb",
  Sarah: "EXAVITQu4vr4xnSDxMaL",
  Rachel: "21m00Tcm4TlvDq8ikWAM",
  Adam: "pNInz6obpgDQGcFmaJgB",
};
/** What a voice id looks like: about twenty letters and digits, nothing else. */
const VOICE_ID = /^[A-Za-z0-9]{18,24}$/;
/** A 429 or a 5xx is tried once more, after this long. */
const RETRY_AFTER_MS = 2000;

const frontend = new URL("..", import.meta.url);
const DEFAULT_PATHS = {
  lines: fileURLToPath(new URL("features/tour/voice-lines.json", frontend)),
  out: fileURLToPath(new URL("public/tour/voice/", frontend)),
  envFile: fileURLToPath(new URL("../.env.tts", frontend)),
};

/**
 * @typedef {object} Options
 * @property {Record<string, string | undefined>} env
 * @property {typeof globalThis.fetch} fetch
 * @property {(line: string) => void} log
 * @property {(line: string) => void} error
 * @property {(ms: number) => Promise<void>} wait
 * @property {{ lines: string, out: string, envFile: string }} paths
 *
 * @typedef {{ voice_id: string, name?: string, category?: string }} Voice
 * @typedef {Voice & { how: string }} ResolvedVoice
 * @typedef {{ hash: string, voice: string, bytes: number }} Clip
 */

const sleep = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (/** @type {string} */ text) => createHash("sha256").update(text).digest("hex");

/**
 * A setting from the environment, or from its `NAME=value` line in the env file ("" when it is in neither).
 * @param {string} name
 * @param {Options["env"]} env
 * @param {string} envFile
 */
function setting(name, env, envFile) {
  const fromEnv = env[name]?.trim();
  if (fromEnv) return fromEnv;
  if (!existsSync(envFile)) return "";
  const assignment = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=(.*)$`);
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const value = assignment.exec(line)?.[1].trim();
    if (value !== undefined) return value.replace(/^(["'])(.*)\1$/, "$2");
  }
  return "";
}

/**
 * Fetch, trying once more on a 429 or a 5xx; anything else that isn't OK is an error.
 * @param {string} url
 * @param {RequestInit} init
 * @param {Pick<Options, "fetch" | "log" | "wait">} io
 */
async function request(url, init, { fetch, log, wait }) {
  let response = await fetch(url, init);
  if (response.status === 429 || response.status >= 500) {
    log(`  ElevenLabs answered ${response.status}; trying once more…`);
    await wait(RETRY_AFTER_MS);
    response = await fetch(url, init);
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    const message = `ElevenLabs answered ${response.status} for ${new URL(url).pathname}${detail && `: ${detail}`}`;
    throw Object.assign(new Error(message), { status: response.status });
  }
  return response;
}

/**
 * `wanted` among the account's voices: as an id, then as a name (any case; "Brian" also finds
 * "Brian - Deep, Resonant and Comforting"), else the account's first premade voice.
 * @param {string} wanted
 * @param {Voice[]} voices
 * @param {Options["log"]} log
 * @returns {ResolvedVoice}
 */
function pickVoice(wanted, voices, log) {
  const name = wanted.toLowerCase();
  const named = (/** @type {Voice} */ voice) => (voice.name ?? "").toLowerCase();
  const match =
    voices.find((voice) => voice.voice_id === wanted) ??
    voices.find((voice) => named(voice) === name) ??
    voices.find((voice) => named(voice).split(" - ")[0].trim() === name);
  if (match) return { ...match, how: "found among the account's voices" };
  const premade = voices.find((voice) => voice.category === "premade");
  if (!premade) throw new Error(`No voice matches "${wanted}", and the account has no premade voice to fall back to.`);
  log(`No voice matches "${wanted}": using the first premade voice, ${premade.name} (${premade.voice_id}).`);
  return { ...premade, how: "the account's first premade voice" };
}

/**
 * The voice to speak with. A voice id is used as given, with no call. A name is looked up among the
 * account's voices; if the key may not list them (a key limited to text-to-speech answers 401 or 403),
 * in the built-in table of premade voices instead.
 * @param {string} wanted
 * @param {string} key
 * @param {Pick<Options, "fetch" | "log" | "wait">} io
 * @returns {Promise<ResolvedVoice>}
 */
async function resolveVoice(wanted, key, io) {
  if (VOICE_ID.test(wanted)) return { voice_id: wanted, how: "the voice id as given" };
  let listed;
  try {
    listed = await (await request(`${API}/voices`, { headers: { "xi-api-key": key } }, io)).json();
  } catch (error) {
    const status = error instanceof Error && "status" in error ? error.status : undefined;
    if (status !== 401 && status !== 403) throw error;
    const name = Object.keys(PREMADE_VOICES).find((premade) => premade.toLowerCase() === wanted.toLowerCase());
    if (!name) {
      throw new Error(
        `This key may not list voices (ElevenLabs answered ${status}), and "${wanted}" is not one of the built-in names (${Object.keys(PREMADE_VOICES).join(", ")}). Set ELEVENLABS_VOICE to a voice id, or grant the key the "Voices: Read" permission.`,
      );
    }
    return {
      voice_id: PREMADE_VOICES[/** @type {keyof typeof PREMADE_VOICES} */ (name)],
      name,
      how: `from the built-in table: this key may not list voices (${status})`,
    };
  }
  return pickVoice(wanted, listed.voices ?? [], io.log);
}

/** @param {string} file */
function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Make the clips. Returns how many were made and how many were kept.
 * @param {{ key: string, wanted: string, force: boolean }} run
 * @param {Options} options
 */
async function generate({ key, wanted, force }, { fetch, log, wait, paths }) {
  /** @type {Record<string, string>} */
  const lines = readJson(paths.lines) ?? {};
  const ids = Object.keys(lines);
  if (ids.length === 0) throw new Error(`No voice lines in ${paths.lines}.`);
  const unsafe = ids.find((id) => !/^[a-z0-9-]+$/.test(id));
  if (unsafe) throw new Error(`"${unsafe}" can't name a clip: step ids are lower-case letters, digits and dashes.`);

  const io = { fetch, log, wait };
  const voice = await resolveVoice(wanted, key, io);
  log(`Voice: ${voice.name ? `${voice.name} (${voice.voice_id})` : voice.voice_id}, ${voice.how}`);

  mkdirSync(paths.out, { recursive: true });
  const manifestFile = join(paths.out, "manifest.json");
  /** @type {Record<string, Clip>} */
  const manifest = readJson(manifestFile) ?? {};
  // Saved after every clip, in the lines' order, so a run that stops half way keeps what it made.
  const save = () => {
    const kept = Object.fromEntries(ids.filter((id) => manifest[id]).map((id) => [id, manifest[id]]));
    writeFileSync(manifestFile, `${JSON.stringify(kept, null, 2)}\n`);
  };

  // A line that is gone takes its clip with it.
  for (const id of Object.keys(manifest).filter((known) => !ids.includes(known))) {
    rmSync(join(paths.out, `${id}.mp3`), { force: true });
    delete manifest[id];
    log(`${id}.mp3  removed (no such line now)`);
  }
  save();

  let made = 0;
  for (const id of ids) {
    const text = lines[id];
    const file = join(paths.out, `${id}.mp3`);
    const hash = sha256(text);
    const known = manifest[id];
    const unchanged =
      known?.hash === hash && known.voice === voice.voice_id && existsSync(file) && statSync(file).size === known.bytes;
    if (unchanged && !force) {
      log(`${id}.mp3  unchanged`);
      continue;
    }
    const response = await request(
      `${API}/text-to-speech/${voice.voice_id}?output_format=${OUTPUT_FORMAT}`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ text, model_id: MODEL, voice_settings: VOICE_SETTINGS }),
      },
      io,
    );
    const audio = Buffer.from(await response.arrayBuffer());
    if (audio.length === 0) throw new Error(`ElevenLabs sent an empty clip for "${id}".`);
    writeFileSync(file, audio);
    manifest[id] = { hash, voice: voice.voice_id, bytes: audio.length };
    save();
    made++;
    log(`${id}.mp3  ${(audio.length / 1024).toFixed(0)} kB`);
  }
  return { made, kept: ids.length - made };
}

/**
 * The command: resolves to its exit code.
 * @param {string[]} [argv]
 * @param {Partial<Options>} [overrides]
 */
export async function main(argv = process.argv.slice(2), overrides = {}) {
  /** @type {Options} */
  const options = {
    env: process.env,
    fetch: globalThis.fetch,
    log: console.log,
    error: console.error,
    wait: sleep,
    paths: DEFAULT_PATHS,
    ...overrides,
  };
  const { env, paths } = options;
  const key = setting("ELEVENLABS_API_KEY", env, paths.envFile);
  if (!key) {
    options.error(
      "gen:voice: ELEVENLABS_API_KEY is not set. Put it in the environment, or as an ELEVENLABS_API_KEY= line in .env.tts at the repository root.",
    );
    return 1;
  }
  // Nothing this prints may carry the key, whatever an error message quotes.
  const redact = (/** @type {string} */ line) => line.replaceAll(key, "[key]");
  const log = (/** @type {string} */ line) => options.log(redact(line));
  try {
    const wanted = setting("ELEVENLABS_VOICE", env, paths.envFile) || DEFAULT_VOICE;
    const { made, kept } = await generate({ key, wanted, force: argv.includes("--force") }, { ...options, log });
    log(`Made ${made} ${made === 1 ? "clip" : "clips"}, kept ${kept}, in ${paths.out}`);
    return 0;
  } catch (error) {
    options.error(redact(`gen:voice failed: ${error instanceof Error ? error.message : String(error)}`));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}

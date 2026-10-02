# Milepost web (frontend)

The map workspace for Milepost: plan a truck trip under FMCSA Hours-of-Service rules, see the route, turn-by-turn directions and every required stop, check each rule, and print filled-in Driver's Daily Logs. The Django API in `../backend` does the planning; this app is the UI.

## Stack

- **Next.js 16** (App Router, Turbopack) with **React 19** and **TypeScript**
- **Tailwind CSS 4** (design tokens in `app/globals.css` under `@theme`)
- **MapLibre GL 6** with the OpenFreeMap *Positron* style
- **zod** for client-side validation that mirrors the API
- API types generated from `../backend/openapi.yaml` with **openapi-typescript**
- **Vitest** + Testing Library (jsdom) for unit and component tests, **Playwright** for the end-to-end smoke test

## Folder structure

```
app/                    routes: / (workspace), /trips/[id] (saved trip, fetched on the server),
                        layout, error page, loading skeleton, not-found pages, globals.css
features/
  trip-form/            the form: LocationInput (autocomplete combobox), CycleGauge, DetailsSection,
                        ExampleChips; model.ts (validation, API mapping, examples)
  route-map/            RouteMap (MapLibre), stop markers and popups, MapLegend, bounds helpers
  itinerary/            stops grouped by day
  compliance/           RuleChecks (observed / limit per rule) and Assumptions
  directions/           Directions: turn-by-turn route instructions per leg (from OpenRouteService)
  log-sheets/           LogSheet (the paper form as SVG), geometry.ts (grid math), linking.ts
                        (brackets ↔ stops), miles.ts (daily miles), day tabs and print
  replay/               trip replay: timeline.ts (pure timeline, route and clock math), usePlayback
                        (rAF clock, speeds, reduced-motion steps), useTripReplay, PlaybackBar
  tour/                 the guided tour (top bar "Take the tour", or /?tour=1): steps.ts (captions, what each
                        step shows, timings), runner.ts (pure, pausable step runner), typing.ts, controller.ts
                        (what Workspace lets the tour drive), useTour (URL, keyboard), TourOverlay (captions,
                        controls, spotlight)
  workspace/            Workspace shell, ResultsPanel, usePlanner (all planner state), toast, overlay
components/             TopBar, HowItWorks, StopIcon; components/ui/ holds shared primitives (Tabs)
lib/
  api/                  client.ts (browser calls via /api), server.ts (server-side trip fetch),
                        types.ts (friendly names over the generated schema.d.ts)
  format.ts             times, dates, hours and miles (times are read from the string, never converted)
  stops.ts              stop names, colours and shapes shared by the map, legend, itinerary and form
e2e/                    Playwright smoke test and guided tour test
scripts/                copy-maplibre-worker.mjs, generate-tour-voice.mjs (the tour's narration clips)
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Copy the MapLibre worker, then start the dev server on :3000 |
| `pnpm build` | Copy the MapLibre worker, then build for production |
| `pnpm test` | Unit and component tests (Vitest); no network |
| `pnpm test:e2e` | Build, start on :3100 and run the Playwright smoke and guided tour tests (API calls are stubbed in the browser) |
| `pnpm typecheck` | Generate Next's route types, then `tsc --noEmit` |
| `pnpm lint` | ESLint (`eslint .`) |
| `pnpm gen:api` | Regenerate `lib/api/schema.d.ts` from `../backend/openapi.yaml` |
| `pnpm gen:voice` | Regenerate the guided tour's narration clips with ElevenLabs (needs `ELEVENLABS_API_KEY`; see below) |

## Environment

Copy `.env.example` to `.env.local`.

- `API_BASE_URL`: where the Django API runs, e.g. `http://localhost:8000` (a trailing slash is fine). It is read at **build time**, for the `/api/*` rewrite in `next.config.ts` that keeps the browser on one origin, and at **run time**, when `/trips/[id]` is rendered on the server. On Vercel, set it for both. A Vercel build fails if it is missing, so a deploy can't silently proxy to localhost.

## The MapLibre worker copy step

MapLibre 6 starts a module worker (`maplibre-gl-worker.mjs`, which imports `maplibre-gl-shared.mjs`). Turbopack does not bundle or emit that worker. So `dev` and `build` first run `scripts/copy-maplibre-worker.mjs`, which copies both files into `public/maplibre/` (git-ignored), and `RouteMap` points `maplibregl.setWorkerUrl` at the copy. If the map stays blank, run `pnpm build` or `pnpm dev` once to create the copy.

## The tour's narration

The guided tour speaks one pre-generated clip per step. The clips are static files in `public/tour/voice/` (committed, with a `manifest.json`), so the running app needs no key and makes no call to a speech service.

The spoken text lives in `features/tour/voice-lines.json`, one line per step id. To change a line, edit it there and regenerate:

```bash
pnpm gen:voice            # make the clips whose text or voice changed
pnpm gen:voice --force    # make them all again
```

- `ELEVENLABS_API_KEY` is read from the environment, or from an `ELEVENLABS_API_KEY=` line in `.env.tts` at the repository root (git-ignored). The script never prints it, and exits with code 1 when it is missing.
- `ELEVENLABS_VOICE` is a voice name or id (default: `Brian`). If nothing matches, the script falls back to the account's first premade voice and says which one it used.
- Clips are made one at a time; a 429 or 5xx answer is retried once. `manifest.json` records each clip's text hash, voice and size, which is how unchanged clips are skipped.

Commit the regenerated `public/tour/voice/` files with the change to the lines.

## Deliberate simplifications

- On small screens the planner panel is a **scrollable** bottom sheet, not a draggable one.
- On small screens the log sheets **scroll sideways** at their natural size instead of scaling down, and there is no "open full size" view. Printing and the PDF always use the full-size sheet, one landscape Letter page per day.
- While a trip is being planned, an **animated overlay** ("Planning under FMCSA rules…") stands in for skeleton panels and an animated dashed route. A saved trip opened by link shows a skeleton while it loads.

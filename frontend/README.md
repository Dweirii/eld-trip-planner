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
  workspace/            Workspace shell, ResultsPanel, usePlanner (all planner state), toast, overlay
components/             TopBar, HowItWorks, StopIcon; components/ui/ holds shared primitives (Tabs)
lib/
  api/                  client.ts (browser calls via /api), server.ts (server-side trip fetch),
                        types.ts (friendly names over the generated schema.d.ts)
  format.ts             times, dates, hours and miles (times are read from the string, never converted)
  stops.ts              stop names, colours and shapes shared by the map, legend, itinerary and form
e2e/                    Playwright smoke test
scripts/                copy-maplibre-worker.mjs
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Copy the MapLibre worker, then start the dev server on :3000 |
| `pnpm build` | Copy the MapLibre worker, then build for production |
| `pnpm test` | Unit and component tests (Vitest); no network |
| `pnpm test:e2e` | Build, start on :3100 and run the Playwright smoke test (API calls are stubbed in the browser) |
| `pnpm typecheck` | Generate Next's route types, then `tsc --noEmit` |
| `pnpm lint` | ESLint (`eslint .`) |
| `pnpm gen:api` | Regenerate `lib/api/schema.d.ts` from `../backend/openapi.yaml` |

## Environment

Copy `.env.example` to `.env.local`.

- `API_BASE_URL`: where the Django API runs, e.g. `http://localhost:8000` (a trailing slash is fine). It is read at **build time**, for the `/api/*` rewrite in `next.config.ts` that keeps the browser on one origin, and at **run time**, when `/trips/[id]` is rendered on the server. On Vercel, set it for both. A Vercel build fails if it is missing, so a deploy can't silently proxy to localhost.

## The MapLibre worker copy step

MapLibre 6 starts a module worker (`maplibre-gl-worker.mjs`, which imports `maplibre-gl-shared.mjs`). Turbopack does not bundle or emit that worker. So `dev` and `build` first run `scripts/copy-maplibre-worker.mjs`, which copies both files into `public/maplibre/` (git-ignored), and `RouteMap` points `maplibregl.setWorkerUrl` at the copy. If the map stays blank, run `pnpm build` or `pnpm dev` once to create the copy.

## Deliberate simplifications

- On small screens the planner panel is a **scrollable** bottom sheet, not a draggable one.
- On small screens the log sheets **scroll sideways** at their natural size instead of scaling down, and there is no "open full size" view. Printing and the PDF always use the full-size sheet, one landscape Letter page per day.
- While a trip is being planned, an **animated overlay** ("Planning under FMCSA rules…") stands in for skeleton panels and an animated dashed route. A saved trip opened by link shows a skeleton while it loads.

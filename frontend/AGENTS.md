# AGENTS.md: frontend

This is the Next.js app for Milepost. The repository-wide rules are in [`../AGENTS.md`](../AGENTS.md); the stack, folders and scripts are in [`README.md`](README.md).

## Before you change code

- This is Next.js 16 (see the managed block below):
  - `params` is a `Promise` (use `PageProps<"/route">`);
  - `fetch` is not cached by default;
  - `next lint` no longer exists, so lint runs through `eslint .`;
  - route types come from `next typegen`.
  Check `node_modules/next/dist/docs/` for any Next API you touch.
- Run `pnpm test && pnpm typecheck && pnpm lint && pnpm build` before calling a change done. Run `pnpm test:e2e` when the planning flow changes.

## Rules

- **Times.** Display times by slicing the API's ISO strings, using the helpers in `lib/format.ts`. Never create `Date`s for display or call `toLocale*` with the browser's time zone.
- **API.** Use `lib/api/client.ts` in the browser and `lib/api/server.ts` on the server. Types come only from `lib/api/types.ts`, which aliases the generated `schema.d.ts`. After a backend API change, run `pnpm gen:api`.
- **Stops.** Names, colours and shapes come from `lib/stops.ts`, which the map markers, the legend, the itinerary and the form all share. Every stop kind keeps its own shape, so colour is never the only cue.
- **State.** `features/workspace/usePlanner.ts` owns all planner state:
  - a request counter discards late plan results;
  - the URL follows the trip through `history.replaceState`.
- **Map.** `RouteMap` rebuilds markers only when the trip or preview content changes. Selection only toggles classes and popups.
  - Popups are built from text nodes, never `innerHTML` from data.
  - MapLibre's worker is served from `public/maplibre/`; see the README.
- **Log sheets.** Grid math lives in `features/log-sheets/geometry.ts` as pure functions with exact tests.
  - Every day stays in the DOM, so printing includes all days.
  - Days that aren't on screen are `hidden print:block`.
- **Accessibility.** These are required, not optional:
  - WCAG AA contrast (`--color-coral-ink` for coral text and buttons);
  - visible focus rings;
  - the WAI-ARIA combobox pattern for location inputs;
  - the WAI-ARIA tabs pattern (`components/ui/Tabs.tsx`);
  - keyboard-reachable map pins and log brackets;
  - `prefers-reduced-motion` respected.
- **Tests.** Use Vitest with Testing Library and query by role and accessible name. Tests never hit the network.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

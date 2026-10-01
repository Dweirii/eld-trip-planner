# AGENTS.md: working in this repository

This guide is for coding agents and contributors.

Milepost is an ELD trip planner. Given a trip, it plans the route under FMCSA Hours-of-Service rules (49 CFR Part 395) and draws the Driver's Daily Log sheets.

The binding spec is [`docs/design/2026-09-30-eld-trip-planner-design.md`](docs/design/2026-09-30-eld-trip-planner-design.md). Read it before changing behaviour.

## Repository map

| Path | What lives there | Its own guide |
|---|---|---|
| `backend/` | Django 5.2 + DRF API (Python 3.13, uv) | [`backend/README.md`](backend/README.md) |
| `frontend/` | Next.js 16 + React 19 + Tailwind 4 app (pnpm) | [`frontend/README.md`](frontend/README.md), [`frontend/AGENTS.md`](frontend/AGENTS.md) |
| `docs/design/` | The spec and UI mockups | |
| `.github/workflows/ci.yml` | CI jobs `backend`, `frontend` and `e2e` | |

## Commands

```bash
# Backend (from backend/)
uv sync
uv run pytest                                              # all tests, no network
uv run ruff check . && uv run ruff format --check .
uv run python manage.py runserver 8000                     # Swagger at /api/docs/
uv run python manage.py spectacular --file openapi.yaml    # after any API change

# Frontend (from frontend/)
pnpm install
pnpm test && pnpm typecheck && pnpm lint && pnpm build
pnpm test:e2e                                              # Playwright, API mocked
pnpm gen:api                                               # regenerate types from backend/openapi.yaml
pnpm dev                                                   # http://localhost:3000, proxies /api to :8000
```

A change is done when the backend and frontend checks above are green.

## Architecture rules

- **`backend/hos/` is a pure HOS engine.** It imports only the standard library: no Django, no I/O.
  - Every limit lives in `hos/rules.py`, with its CFR citation.
  - `planner.py` simulates the trip on a 15-minute grid.
  - `daily_logs.py` builds the sheets.
  - `compliance.py` re-checks every plan independently. A plan that fails a check is a bug, never a warning to hide.
- **`backend/geo/` wraps the outside world:**
  - Photon for geocoding;
  - OpenRouteService `driving-hgv` for truck routing;
  - an offline GeoNames town index;
  - Postgres caches.

  `geo` never imports `hos` or `trips`.
- **`backend/trips/` is where they meet:**
  - validation (`serializers.py`);
  - orchestration (`services.py`);
  - payload shaping (`presenters.py`);
  - persistence.
- **Errors use one envelope:** `{"error": {"code", "message", "field"?, "details"?}}` (`config/errors.py`).
- **The frontend is organised by feature** under `frontend/features/`. Shared primitives live in `components/ui/`, and the API client and types in `lib/api/`.

## Contracts that must not break

- **Times.** Every timestamp is a home-terminal ISO string with its offset (`2026-10-01T06:00:00-05:00`).
  - The frontend displays times by slicing that string, and never converts time zones in the browser.
  - Tests switch `TZ` to prove it.
- **The API contract.** `backend/openapi.yaml` is generated, and a drift test fails when it is stale. The frontend uses only types generated from it (`pnpm gen:api`). Never hand-write API shapes.
- **The proxy.** Next.js rewrites `/api/:path*` to `${API_BASE_URL}/api/:path*/`, and Django never redirects (`APPEND_SLASH = False`). Client paths always end with `/`.
- **Log sheets.**
  - Each day totals exactly 24 hours.
  - Remarks appear at every change of duty status.
  - The recap follows the paper form (A / B / C).
  - Printing gives one landscape page per day.
- **Tests never touch the network.**
  - Backend: fakes in `tests/fakes.py`, or `httpx.MockTransport`.
  - Frontend: stubs.
  - E2E: `/api/**` is mocked and map tiles are aborted.

## Conventions

- Use test-driven changes: write the failing test first.
  - Backend tests include FMCSA guide examples and property-based tests (Hypothesis) that plan random trips and require zero violations.
- Use Conventional Commits (`feat(scope): …`, `fix(scope): …`, `docs: …`), each commit small and green.
- Never commit secrets: `.env` stays local (see `.env.example` in each app).
- Match the surrounding code's naming, comment density and idioms.

## Deployment

The app runs as two Vercel projects:
- the API: framework `django` (see `backend/vercel.json`), with Neon Postgres via `DATABASE_URL`;
- the web app: framework `nextjs`.

Required environment variables:
- API: `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=false`, `DJANGO_ALLOWED_HOSTS`, `ORS_API_KEY`, `DATABASE_URL`.
- Web app: `API_BASE_URL`. It is read at build time and at run time, and a Vercel build fails fast without it.

Migrations run on production deploys only (`backend/scripts/vercel_build.py`).

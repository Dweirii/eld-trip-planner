# Milepost API (Django)

Plans property-carrying truck trips under FMCSA Hours-of-Service rules (49 CFR Part 395) and returns the route, required stops, daily log sheets and a compliance report.

## Run locally

```bash
cp .env.example .env        # add your free ORS_API_KEY
uv sync
uv run python manage.py migrate
uv run python manage.py runserver 8000
```

- API docs (Swagger): http://localhost:8000/api/docs/
- Health: http://localhost:8000/api/health/

## Test

```bash
uv run pytest               # unit, property-based and API tests (no network)
uv run ruff format . && uv run ruff check .
```

## Layout

| Module | Responsibility |
|---|---|
| `hos/` | Pure-Python HOS engine: `rules.py` (every limit + CFR citation), `planner.py` (trip simulation), `daily_logs.py` (log sheets + recap), `compliance.py` (independent verifier) |
| `geo/` | Outside world: Photon geocoder, OpenRouteService truck router, GeoNames nearest-town index, Postgres caches, geocoding endpoints |
| `trips/` | The API: validation, orchestration (`services.py`), payload shaping (`presenters.py`), persistence |
| `config/` | Settings, URLs, the error envelope (`errors.py`) |

`hos` imports only the standard library, `geo` never imports `hos` or `trips`, and `trips` is where they meet.

## Regenerate artifacts

```bash
uv run python manage.py spectacular --file openapi.yaml   # after changing the API
uv run python scripts/build_places.py                     # refresh GeoNames towns
```

Data credits: © OpenStreetMap contributors (via Photon and OpenRouteService), GeoNames (CC BY 4.0).

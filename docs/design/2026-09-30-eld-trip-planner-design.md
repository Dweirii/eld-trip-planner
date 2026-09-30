# Milepost — ELD Trip Planner · Design Spec

| | |
|---|---|
| **Status** | Approved design, pre-implementation |
| **Date** | 2026-09-30 |
| **Repo** | `eld-trip-planner` (monorepo: `backend/` Django · `frontend/` Next.js) |
| **Product name** | Milepost |

---

## 1. Summary

Milepost takes a truck trip (current location, pickup, dropoff, and the driver's current 70-hour cycle usage). It plans the whole trip under the FMCSA Hours-of-Service (HOS) rules for property-carrying drivers and returns:

1. **A route map** showing the truck route and every stop: pickup, dropoff, fuel, 30-minute breaks, 10-hour rests and 34-hour restarts.
2. **Filled-in Driver's Daily Log sheets**, one per calendar day, drawn like the FMCSA paper log: the 24-hour grid with the duty-status line, totals, remarks, and the 70-hour/8-day recap.

The backend (Django) does all the computing. The frontend (Next.js) only presents the result.

### 1.1 Goals

- **Accuracy:** every plan complies with 49 CFR Part 395 under the stated assumptions, and a separate checker verifies this.
- **Clarity:** a reviewer can check the plan by hand from the itinerary, the rule panel and the log sheets.
- **Quality UI/UX:** a map-first workspace in the Spotter brand palette, with log sheets rendered as paper forms that print cleanly.
- **Maintainable code:** a pure domain core, small modules with one job each, typed API contracts, and thorough tests and docs.

### 1.2 Non-goals

Authentication and user accounts; dark mode; the split sleeper-berth option; the adverse-driving and short-haul exceptions; pre-/post-trip inspection time; the 60-hour/7-day schedule; team drivers; finding real truck stops (stops are placed at route positions and labeled with the nearest town); trips outside the United States; API rate limiting.

---

## 2. Requirements traceability

| Requirement (assessment brief) | Where it is satisfied |
|---|---|
| Django backend, React frontend | `backend/` (Django 5.2 LTS + DRF), `frontend/` (Next.js 16 / React 19) |
| Live hosted version | Two Vercel projects (API + web) and Neon Postgres (§10) |
| Input: current location, pickup, dropoff | `trip-form` → `POST /api/trips/` (§7) |
| Input: current cycle used (hrs) | `current_cycle_used_hours`, 0–70 (§7) |
| Output: map with route and stop/rest info, using a free map API | OpenRouteService `driving-hgv` routing, MapLibre + OpenFreeMap tiles (§6, §8) |
| Output: filled-in daily log sheets, drawn, multiple for long trips | `hos/daily_logs.py` → `log-sheets` SVG, one per day (§5.6, §8) |
| Property-carrying driver, 70 h / 8 days, no adverse conditions | `HOSRules` (§3) |
| Fuel at least once every 1,000 miles | `HOSRules.fuel_interval_mi` (§3, §5) |
| 1 hour for pickup and for dropoff | `HOSRules.pickup_min` / `dropoff_min` (§3, §5) |
| Good UI/UX | §8 |

---

## 3. Rules and assumptions

### 3.1 `HOSRules`: one frozen dataclass, the single source of every limit

| Field | Value | Source |
|---|---|---|
| `max_driving_min` | 660 (11 h) | 49 CFR 395.3(a)(3) |
| `driving_window_min` | 840 (14 h) | 49 CFR 395.3(a)(2) |
| `break_after_driving_min` | 480 (8 h cumulative) | 49 CFR 395.3(a)(3)(ii) |
| `break_min` | 30 | 49 CFR 395.3(a)(3)(ii) |
| `daily_rest_min` | 600 (10 h), logged as **sleeper berth** | 49 CFR 395.3(a)(1) |
| `cycle_limit_min` | 4,200 (70 h / 8 days) | 49 CFR 395.3(b)(2) |
| `restart_min` | 2,040 (34 h), logged as **off duty** | 49 CFR 395.3(c) |
| `fuel_interval_mi` | 1,000 | Brief |
| `fuel_min` | 30, **on duty (not driving)** | Assumption (typical) |
| `pickup_min` / `dropoff_min` | 60 each, **on duty (not driving)** | Brief |
| `quantum_min` | 15 | Paper-log grid resolution |

### 3.2 Domain assumptions

These are shown in the UI's *Assumptions* tab and in the README.

1. **Trip sequence:** drive current → pickup, 1 h on duty, drive pickup → dropoff, 1 h on duty.
2. **Fresh daily clocks at start:** the driver has had ≥10 h off before the trip, so the 11 h and 14 h clocks start full. The time from midnight to the start is logged as off duty.
3. **Cycle hours are conservative:** `current_cycle_used_hours` counts toward the 70 h limit and **never rolls off during the trip**, because the input has no per-day history. It counts inside every recap window. A 34 h off-duty restart resets it to zero.
4. **Full tank at start:** the first fuel stop comes before 1,000 route miles.
5. **Any 30+ consecutive minutes of non-driving satisfies the 30-minute break** (off duty, sleeper, or on-duty not driving: fuel, pickup, dropoff), per the FMCSA guide.
6. **The 10 h rest is logged in the sleeper berth.** The 30-minute break and the 34 h restart are logged off duty.
7. **Only driving is barred by the 11 h / 14 h / 70 h limits.** On-duty work such as pickup and dropoff may continue after them, per the FMCSA guide.
8. **Home-terminal time:** the time zone of the *current location*. Its UTC offset at trip start is used for the whole trip, so every log day is exactly 24 h, even across a DST change.
9. **Drive time comes from the truck-profile route** (average speed per leg). Durations snap to the 15-minute grid (§5.2).
10. **Log-sheet header details** (driver, carrier, truck/trailer, shipping document) are optional inputs with sensible defaults.

---

## 4. Architecture

### 4.1 Repository layout

```
eld-trip-planner/
├── README.md                  start here: live links, screenshots, architecture, rules → code map
├── docs/design/               this spec + mockups
├── .github/workflows/ci.yml   backend + frontend jobs
├── backend/                   Django project — Vercel project "milepost-api" (root dir: backend/)
│   ├── manage.py
│   ├── pyproject.toml, uv.lock, .python-version (3.13)
│   ├── openapi.yaml           exported API schema (source for frontend types)
│   ├── vercel.json            function maxDuration
│   ├── config/                settings.py, urls.py, wsgi.py
│   ├── hos/                   PURE domain package — no Django, no I/O
│   │   ├── __init__.py        ENGINE_VERSION
│   │   ├── rules.py           HOSRules
│   │   ├── models.py          DutyStatus, EventKind, Leg, DutyEvent, TripPlan, DailyLog, RuleCheck …
│   │   ├── planner.py         plan_trip(legs, cycle_used, start, rules) -> TripPlan
│   │   ├── daily_logs.py      build_daily_logs(plan, …) -> list[DailyLog]
│   │   ├── compliance.py      check(plan, logs, rules) -> list[RuleCheck]  (independent verifier)
│   │   └── timeutil.py        quarter-hour snapping, minute ↔ datetime helpers
│   ├── geo/                   Django app — external-world adapters
│   │   ├── types.py           Place, RouteLeg, Route
│   │   ├── providers/
│   │   │   ├── base.py        Geocoder / Router Protocols
│   │   │   ├── photon.py      PhotonGeocoder (search + reverse)
│   │   │   └── ors.py         OrsRouter (driving-hgv)
│   │   ├── polyline.py        haversine, cumulative distance, point-at-mile, simplify (RDP)
│   │   ├── places.py          NearestPlaceIndex over bundled GeoNames data
│   │   ├── data/us_places.csv generated by scripts/build_places.py
│   │   ├── models.py          GeocodeCache, RouteCache
│   │   └── services.py        cached geocode / route facades
│   ├── trips/                 Django app — the HTTP API
│   │   ├── models.py          Trip
│   │   ├── serializers.py     request validation, response shape
│   │   ├── services.py        plan_and_save(): geocode → route → plan → logs → check → persist
│   │   ├── views.py, urls.py
│   │   └── exceptions.py      domain errors + DRF exception handler
│   ├── scripts/build_places.py
│   └── tests/                 hos/ · geo/ · api/  (+ fixtures/)
└── frontend/                  Next.js — Vercel project "milepost" (root dir: frontend/)
    ├── app/                   / (workspace) · /trips/[id] (saved trip) · layout, globals
    ├── features/
    │   ├── trip-form/         LocationInput, CycleGauge, DetailsSection, ExampleChips
    │   ├── route-map/         RouteMap (MapLibre), markers, legend, popups
    │   ├── itinerary/         Itinerary (grouped by day)
    │   ├── compliance/        RuleChecks, Assumptions
    │   ├── log-sheets/        LogSheet (SVG), geometry.ts, LogSheetTabs, print styles
    │   └── workspace/         Workspace shell, results panel, selection store
    ├── lib/api/               client.ts, errors.ts, schema.d.ts (generated from OpenAPI)
    ├── lib/format.ts          hours / time / miles formatting
    └── components/ui/         Button, Pill, Tabs, Skeleton, Toast …
```

### 4.2 Dependency rules

- `hos` imports only the standard library. It is fully unit-testable and deterministic.
- `geo` wraps the outside world (HTTP providers, the places dataset, caches). It never imports `hos` or `trips`.
- `trips` is the **only** module that ties the two together (`trips/services.py`).
- Frontend feature modules talk to Django only through `lib/api`. Shared UI primitives live in `components/ui`.

### 4.3 Request flow

```
Browser ──POST /api/trips/──▶ Next.js (rewrite /api/* → Django)
   Django: validate → geocode (cached) → route (cached, 1 ORS call, 3 waypoints)
         → hos.plan_trip → attach positions + nearest towns → hos.build_daily_logs
         → hos.compliance.check → save Trip → 201 {…trip}
Browser ──navigates to /trips/{id}──▶ server component GET /api/trips/{id}/ → render
```

The rewrite keeps the browser on a single origin: no CORS, no cookies.

### 4.4 Technology

| Layer | Choice |
|---|---|
| Backend | Python 3.13 · Django 5.2 LTS · Django REST Framework · drf-spectacular (OpenAPI + Swagger UI) · httpx · dj-database-url · psycopg 3 · uv · ruff · pytest, pytest-django, Hypothesis |
| Frontend | Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 · maplibre-gl · zod · openapi-typescript · Vitest · Testing Library · Playwright (one smoke test) |
| Data / infra | Neon Postgres · Vercel (two projects) · GitHub Actions |
| Map data | OpenRouteService (routing) · Photon/komoot (geocoding) · OpenFreeMap (vector tiles) · GeoNames `cities1000` (nearest town, time zone; CC-BY 4.0) |

Django 5.2 LTS is chosen over 6.1 because DRF and drf-spectacular officially support it.

---

## 5. HOS planner (`backend/hos/`)

### 5.1 Inputs

- `legs`: two `Leg`s (current → pickup, pickup → dropoff). Each has `miles`, `duration_min` and its geometry. The planner only uses miles and duration; geometry is used later for positions. A 0-mile leg is allowed (current = pickup).
- `cycle_used_min`: `round(current_cycle_used_hours × 60)`.
- `start`: the local start minute (minutes since the trip's first local midnight), snapped **up** to the next quarter hour.
- `rules`: `HOSRules`.

### 5.2 Time model

- Time is an **integer number of minutes** since local midnight of day 1, in the fixed home-terminal offset.
- Every event boundary lies on the **15-minute grid**:
  - A drive that ends because the **leg finishes** is rounded **up** to the next quarter hour (arrive late, never early).
  - A drive that ends because **fuel is due** is rounded **down** (never exceed 1,000 mi).
  - Rule-bound drives (11 h, 14 h, 8 h) already fall on the grid. The cycle bound is rounded **down**.
- Miles within a leg run at that leg's constant average speed (`miles / duration_min`). The last drive of a leg covers exactly the miles left.

### 5.3 State (clocks)

| Clock | Limit | Reset by |
|---|---|---|
| `shift_drive` | 660 min | a 600-min sleeper rest or a 34 h restart |
| `shift_start` (window) | driving not allowed after `shift_start + 840` | same; starts at the first on-duty/driving minute after a reset |
| `drive_since_break` | 480 min | any ≥30 consecutive non-driving minutes |
| `cycle` | 4,200 min, starts at `cycle_used_min` | a 34 h restart |
| `miles_since_fuel` | 1,000 mi | a fuel stop |

### 5.4 Algorithm

```
emit OFF_DUTY [0, start)                                   # pre-trip, kind=OFF_BEFORE
for task in [DRIVE(leg1), PICKUP, DRIVE(leg2), DROPOFF]:
    if task is DRIVE:
        while miles_left > 0:
            resolve_limits()
            bound = min( 660 − shift_drive,
                         window_left,                        # 840 if no shift started
                         480 − drive_since_break,
                         floor15(4200 − cycle),
                         floor15(minutes_to_fuel),
                         ceil15(minutes_to_finish_leg) )
            drive `bound` minutes → emit DRIVING event (miles, start_mi → end_mi)
    else:                                                    # PICKUP / DROPOFF
        emit ON_DUTY 60 min; resets drive_since_break; counts toward cycle; starts shift if needed
emit OFF_DUTY [end, end-of-that-day)                        # post-trip, kind=OFF_AFTER

resolve_limits():   # repeat until every bound > 0, in this priority order:
    1. cycle exhausted     → OFF_DUTY 34 h (RESTART): reset cycle, shift, break clocks
    2. fuel due            → ON_DUTY 30 min (FUEL): reset miles_since_fuel and break clock; +cycle; starts shift if needed
    3. 11 h or 14 h reached → SLEEPER_BERTH 10 h (REST): reset shift and break clocks
    4. 8 h since break     → OFF_DUTY 30 min (BREAK): reset break clock
```

Consecutive non-driving events keep their separate kinds (for example FUEL followed by REST). The break clock resets whenever a non-driving run reaches 30+ consecutive minutes.

**Worked example** (start 08:00, one long leg, cycle 0): drive 08:00–16:00 (8 h) → BREAK 16:00–16:30 → drive 16:30–19:30 (11 h total) → REST 19:30–05:30 → next shift starts 05:30.

### 5.5 Plan output

`TripPlan` contains:
- `events`: an ordered, contiguous list of `DutyEvent`s (`status`, `kind`, `start_min`, `end_min`, `start_mi`, `end_mi`).
- `summary`: total miles, driving hours, on-duty hours, trip start and arrival, number of days, and counts per stop kind.

`trips.services` adds positions to non-driving events: `lat/lng` = the point at `start_mi` on the full route polyline, and `place` = the nearest town ("Joplin, MO").

### 5.6 Daily logs (`build_daily_logs`)

For each calendar day from day 1 through the arrival day, using the window `[d·1440, (d+1)·1440)`:

- **segments:** events clipped to the day and merged by status, as `(status, start_min, end_min)` minutes within the day.
- **totals:** hours per status (multiples of 0.25) that **sum to exactly 24.00**.
- **miles_today:** driving miles inside the window. A drive that crosses midnight is split in proportion to time.
- **from / to:** the place at the day's start and end.
- **remarks:** one entry per duty-status change inside the day: `{minute, time "HH:MM", place, note}` (e.g. "Pickup — on duty"). The first remark gives the location at day start when an event carries over from the previous day.
- **brackets:** `(start_min, end_min, place)` for each stationary stop clipped to the day, drawn under the grid like the FMCSA example.
- **header:** date, carrier, main office, home terminal, truck/trailer, driver, co-driver ("—"), shipping document, shipper and commodity, and the home time zone.
- **recap:** the 70 h / 8-day column of the provided template:
  - `on_duty_today` = driving + on-duty hours today
  - `a_last_7_days` = on-duty over the last 7 days including today
  - `b_available_tomorrow` = max(0, 70 − A)
  - `c_last_5_days` = on-duty over the last 5 days including today

  The prior `cycle_used` hours count inside every window (assumption 3) until a 34 h restart. After a restart, only hours after it count.

### 5.7 Compliance checker (`compliance.check`)

The checker is independent of the planner: it re-derives everything from the event list alone. It returns one `RuleCheck(id, title, citation, limit, observed, unit, passed)` per rule:

| Check | Observed value |
|---|---|
| 11-hour driving limit | max driving in any shift (a shift = the time between ≥10 h off/sleeper periods) |
| 14-hour driving window | max (last driving end − first on-duty start) in any shift |
| 30-minute break after 8 h | max driving between ≥30-min non-driving periods |
| 70-hour / 8-day cycle | peak cycle hours at any driving moment (prior + on-duty since the last ≥34 h off) |
| Fuel ≤ 1,000 mi | max miles between fuel stops (trip start and end included) |
| Pickup and dropoff 1 h | both present, each ≥ 60 min on duty |
| Log totals = 24 h | every daily log's totals sum to 24.00 and its segments are contiguous |

---

## 6. Geo layer (`backend/geo/`)

- **Protocols:**
  - `Geocoder.search(q, limit) -> list[Place]`
  - `Geocoder.reverse(lat, lng) -> Place | None`
  - `Router.route([a, b, c]) -> Route` (the route has `legs[2]`, each with `miles`, `duration_min` and geometry)

  Adapters are chosen through settings, so tests inject fakes.
- **OrsRouter:** `POST https://api.openrouteservice.org/v2/directions/driving-hgv/geojson` with 3 coordinates and `units: "mi"`, `instructions: false`.
  - Legs come from `properties.segments[]`, and `way_points` split the geometry per leg.
  - Free plan: 2,000 requests/day, 40/min, 6,000 km max route.
  - Timeout 10 s with one retry on network errors.
  - Errors map to `route_not_found` (unroutable, too far, outside the US) or `upstream_unavailable`.
- **PhotonGeocoder:** `GET https://photon.komoot.io/api/?q=…&limit=8&lang=en` and `/reverse`.
  - Only results with `countrycode == "US"` are kept.
  - Labels read "City, ST" (plus street or house number for addresses).
  - Photon is fair-use, so the frontend debounces (300 ms, at least 3 characters) and the backend caches.
- **Caches (Postgres):**
  - `GeocodeCache(query_norm, results, created_at)`, 30-day TTL.
  - `RouteCache(key = profile + coordinates rounded to 5 dp, payload, created_at)`.
- **NearestPlaceIndex:**
  - Loads `geo/data/us_places.csv` (GeoNames `cities1000`, US only: name, state, lat, lng, IANA time zone), about 1 MB, once per process.
  - Indexes places in a 0.5° grid of buckets and searches rings of neighboring buckets with haversine distance.
  - Answers `nearest(lat, lng) -> Place` and `timezone_at(lat, lng)`.
  - `scripts/build_places.py` regenerates the file from the GeoNames dump.
- **Polyline helpers:**
  - Haversine cumulative distance and `point_at_mile(mile)`.
  - Ramer–Douglas–Peucker simplification to ≤ 1,500 points for storage and response.

---

## 7. API contract (DRF, OpenAPI via drf-spectacular)

| Method & path | Purpose |
|---|---|
| `POST /api/trips/` | Plan and persist a trip; returns the full `Trip` (201) |
| `GET /api/trips/{id}/` | Fetch a saved trip (404 if unknown) |
| `GET /api/geocode/?q=` | Autocomplete suggestions (≥3 chars, US only, cached) |
| `GET /api/geocode/reverse/?lat=&lng=` | "Use my location" |
| `GET /api/health/` | `{status, engine_version}` |
| `GET /api/schema/`, `/api/docs/` | OpenAPI document and Swagger UI |

### 7.1 Request

```json
{
  "current_location":  { "label": "Chicago, IL", "lat": 41.8781, "lng": -87.6298 },
  "pickup_location":   { "label": "St. Louis, MO" },
  "dropoff_location":  { "label": "Dallas, TX" },
  "current_cycle_used_hours": 12.5,
  "start_time": "2026-10-01T06:00",
  "log_details": {
    "driver_name": "J. Driver", "co_driver_name": "",
    "carrier_name": "Milepost Freight Co.", "main_office_address": "Green Bay, WI",
    "home_terminal_address": "Green Bay, WI",
    "truck_number": "TRK 1042", "trailer_number": "TRL 88317",
    "shipping_document": "BOL-2026-0142", "shipper_commodity": "Acme Paper Co. · paper products"
  }
}
```

**Validation:**
- `label` is 1–200 characters. `lat`/`lng` are optional but must come as a pair; if missing, the label is geocoded.
- Cycle hours are 0–70.
- `start_time` is an optional naive local time in home-terminal time; the default is now, rounded up to the next quarter hour.
- `log_details` is optional; defaults fill any missing fields.
- Pickup and dropoff must not resolve to the same point (within 0.1 mi).

### 7.2 Response (`Trip`)

```jsonc
{
  "id": "k3x9q2mfa1",
  "created_at": "…",
  "engine_version": "1.0.0",
  "inputs": { /* resolved locations with lat/lng, cycle hours, start, log_details */ },
  "home_time_zone": { "iana": "America/Chicago", "abbreviation": "CDT", "utc_offset": "-05:00" },
  "summary": { "total_miles": 932.4, "driving_hours": 16.25, "on_duty_hours": 18.25,
               "starts_at": "2026-10-01T06:00:00-05:00", "arrives_at": "2026-10-02T10:15:00-05:00",
               "days": 2, "stops": { "fuel": 0, "break": 0, "rest": 1, "restart": 0 } },
  "route": { "geometry": { "type": "LineString", "coordinates": [[-87.63, 41.88], …] },
             "legs": [ { "from": "Chicago, IL", "to": "St. Louis, MO", "miles": 297.1, "hours": 4.75 }, … ] },
  "stops": [ { "id": "s3", "kind": "rest", "status": "sleeper_berth",
               "starts_at": "…", "ends_at": "…", "duration_minutes": 600,
               "mile": 640.2, "lat": 36.64, "lng": -95.15, "place": "Vinita, OK" }, … ],
  "daily_logs": [ { "date": "2026-10-01", "day_number": 1, "from": "Chicago, IL", "to": "Vinita, OK",
                    "miles_today": 640.2,
                    "segments": [ { "status": "off_duty", "start_minute": 0, "end_minute": 360 }, … ],
                    "totals": { "off_duty": 6.0, "sleeper_berth": 6.0, "driving": 11.0, "on_duty": 1.0 },
                    "remarks": [ { "minute": 645, "time": "10:45", "place": "St. Louis, MO", "note": "Pickup — on duty" }, … ],
                    "brackets": [ { "start_minute": 645, "end_minute": 705, "place": "St. Louis, MO" }, … ],
                    "header": { /* log_details + home terminal + time zone */ },
                    "recap": { "on_duty_today": 12.0, "a_last_7_days": 24.5,
                               "b_available_tomorrow": 45.5, "c_last_5_days": 24.5 } }, … ],
  "compliance": [ { "id": "driving_11h", "title": "11-hour driving limit", "citation": "49 CFR 395.3(a)(3)",
                    "limit": 11, "observed": 11, "unit": "h", "passed": true }, … ],
  "assumptions": { /* HOSRules values + the assumption list from §3.2 */ }
}
```

All times use the fixed home-terminal offset. `start_minute`/`end_minute` are minutes within the day (0–1440).

### 7.3 Errors

Every error has one shape: `{ "error": { "code", "message", "field"?, "details"? } }`.

| Code | HTTP status | When |
|---|---|---|
| `validation_error` | 400 | Serializer failures (with a `details` map of fields) |
| `location_not_found` | 422 | A label has no US geocoding result (`field` names the input) |
| `route_not_found` | 422 | ORS cannot route (unroutable, over 6,000 km, non-US) |
| `upstream_unavailable` | 503 | Provider timeout or outage; the message suggests retrying |
| `not_found` | 404 | Unknown trip id |

### 7.4 Persistence

- **`Trip`:**
  - `id` (10-char base62, from `secrets`) and `created_at` (indexed).
  - Key inputs as columns: the three labels, `cycle_used_hours`, `total_miles` and `days`, for a readable admin list.
  - `engine_version`, `request` (JSON) and `result` (JSON: the full response body minus `id` and `created_at`).
- **`GeocodeCache`, `RouteCache`:** see §6.
- Admin is registered for all three.

---

## 8. Frontend and UX (`frontend/`)

Reference mockups: `docs/design/mockups/`.

### 8.1 Visual language

- **Shell:** Spotter brand palette. Deep teal `#043B4B` (top bar, primary text accents), coral `#F84960` (primary action, pickup/dropoff), teal `#008080` (route), mint `#BCDDDE`, page background `#F5F8F8`, white cards with soft shadows, rounded 14 px corners.
- **Stop colors** (each marker kind also has a distinct shape, so color is never the only cue):

  | Stop | Color |
  |---|---|
  | Start | white with deep-teal ring |
  | Pickup / dropoff | coral |
  | Fuel | amber `#F5A524` |
  | 30-minute break | mint `#7FCDC4` |
  | Rest / restart | deep teal |

- **Log sheets:** paper `#FFFDF8` with a faint ruled texture; navy ink `#1C2433` for the form; the duty line and filled values in blue ink `#1F4FB5`, as in the FMCSA completed example.
- **Type** (loaded with `next/font`): Plus Jakarta Sans for the UI; on the sheet, IBM Plex Mono for form labels, Fraunces for the sheet title, and Caveat for "handwritten" values and remarks.

### 8.2 Pages and layout (map workspace)

- `/`: a full-bleed map with a floating panel (left, 310 px) holding the **trip form**.
  - Picking a place drops a pin and draws a dashed preview line.
  - **Plan trip** submits; on success the panel becomes the **results panel** and the URL becomes `/trips/{id}`.
- `/trips/[id]`: the same workspace, with the trip fetched on the server.
  - The results panel shows the title, **Edit trip** (the form returns with values filled in), stats (miles, log days, door-to-door time), and tabs: **Itinerary · Rules ✓ n/n · Assumptions**.
  - Below the map: **Daily logs** with day tabs, *Show all*, and **Print / PDF all**.
- The top bar links to *How it works* (a dialog explaining the rules and assumptions in plain language), *API docs* (Swagger) and *GitHub*.

### 8.3 Components

| Feature | Components and behavior |
|---|---|
| trip-form | `LocationInput`: WAI-ARIA combobox, debounced autocomplete, keyboard navigation, free text allowed; "◎ use my location" on current location. `CycleGauge`: slider plus number box, 0–70 in 0.25 steps, shows "x h used · y h left of 70". `DetailsSection` (collapsed): start time and log-sheet details. `ExampleChips`: *Short haul* (Dallas → Fort Worth → Houston, cycle 20), *Multi-day* (Chicago → St. Louis → Dallas, 12.5), *Cross-country* (New York → Newark → Los Angeles, 0), *Restart needed* (Atlanta → Nashville → Denver, 62). Client validation (zod) mirrors the server rules. |
| route-map | MapLibre with the OpenFreeMap *Positron* style; route line teal with a white casing; fit to bounds; kind-specific markers; hover/click popups (kind, place, mile, start → end); legend. |
| itinerary | Stops grouped by day: time, kind, place, duration, status and mile marker. |
| compliance | One row per `RuleCheck`: title, `observed / limit` with ✓/✕ and the citation (tooltip). The *Assumptions* tab renders the `assumptions` object. |
| log-sheets | `LogSheet` SVG matching the paper form: header fields; the 24-hour grid (4 rows, hour lines, 15-minute ticks, midnight/noon labels); the duty line with vertices; row totals and "=24"; remark brackets and slanted place labels; shipping line; recap. `geometry.ts` holds pure functions (minute → x, status → y, segments → path, brackets). A screen-reader-only table lists the segments. |
| workspace | `Workspace` shell, `ResultsPanel`, and a small **selection store**: hovering or clicking a stop highlights it on the map, in the itinerary and on its log bracket. |

### 8.4 States

- **Loading:** skeleton panels, and the dashed preview route animates as if being drawn.
- **Field errors:** `location_not_found` appears under the matching input; validation details map to fields.
- **Provider errors:** `upstream_unavailable` or `route_not_found` show a toast with the message, plus Retry where it makes sense.
- **Empty state:** the map, the form, and the example chips with a one-line hint.

### 8.5 Print

- `@media print` hides the app shell and prints **one log sheet per landscape Letter page**.
- The **Print / PDF all** button shows every sheet, then calls `window.print()`.

### 8.6 Responsive and accessibility

- Below 1024 px, the floating panel becomes a draggable **bottom sheet** over the map (tabs: Stops · Rules · Logs). Log sheets scale to the viewport width, with "open full size".
- Keyboard reachable throughout, visible focus rings, AA contrast, `prefers-reduced-motion` respected, and `<title>`/`<desc>` on SVGs.

### 8.7 API client

- `lib/api/schema.d.ts` is generated with `openapi-typescript` from `backend/openapi.yaml`, which is exported with `manage.py spectacular`.
- `client.ts` wraps `fetch` with typed request and response and maps error codes (`errors.ts`).

---

## 9. Testing strategy

### Backend (pytest)

- **`hos` unit tests:**
  - Each rule on its own: 11 h; the 14 h window; the break after 8 h; 10 h rest resets; the 70 h cycle and 34 h restart; fuel ≤ 1,000 mi; pickup and dropoff 60 min.
  - Quarter-hour snapping; midnight splitting; totals = 24; recap math; 0-mile first leg.
- **FMCSA guide examples as tests:**
  - p. 6: a shift starting 06:00 allows no driving after 20:00. Tested on the planner's window clock, and on the compliance checker with a hand-built timeline that violates it.
  - p. 7: on duty 06:00, driving from 07:00. The 11th hour of driving is reached at 18:30, including a 30-minute break, and no driving is scheduled after that.
  - p. 11: the rolling 8-day table (67 → 73 → 63 h) against the recap window function.
- **Scenario tests:** same-day short haul; 2-day trip; about 2,800 mi cross-country (several fuel stops and rests); 65 h used (restart mid-trip); 70 h used (restart before the first drive).
- **Property tests (Hypothesis)** over random legs (0–3,000 mi, 35–65 mph), cycle used (0–70 h) and start time. These must always hold:
  - `compliance.check` reports no failures.
  - Every daily log sums to 24.00.
  - Events are contiguous and non-overlapping.
  - Driven miles equal route miles.
  - No stretch between fuel stops exceeds 1,000 mi.
- **`geo` tests:** ORS/Photon adapters parse recorded fixture responses (no network) and map errors correctly; the nearest-town and time-zone lookups return known answers for known coordinates; RDP simplification and `point_at_mile` are correct.
- **API tests** (DRF client, fake providers): validation errors, the 422/503 mappings, the happy-path response shape, GET round-trip, and 404.

### Frontend

- **Vitest:** `log-sheets/geometry.ts`, `lib/format.ts`, API error mapping.
- **Testing Library:** `LogSheet` renders totals, remarks and recap from a fixture.
- **Playwright smoke test:** example chip → Plan trip (API mocked with a fixture) → results panel and log sheet visible.

### CI (GitHub Actions)

- **backend:** `uv sync`, `ruff check`, `ruff format --check`, `pytest`.
- **frontend:** `pnpm install`, `lint`, `tsc --noEmit`, `vitest run`, `next build`.

---

## 10. Deployment and operations

- **Neon:** one project. The Vercel ↔ Neon integration provides `DATABASE_URL` (pooled). Django uses `CONN_MAX_AGE=0` with `sslmode=require`.
- **Backend** (Vercel project `milepost-api`, root `backend/`):
  - Vercel's zero-config Django detection (it reads `manage.py` and `WSGI_APPLICATION`); dependencies from `pyproject.toml` + `uv.lock`; Python 3.13.
  - The build script (`[tool.vercel.scripts] build`) runs `migrate --noinput` **only when `VERCEL_ENV == "production"`**. `collectstatic` runs automatically (for admin and Swagger assets).
  - `vercel.json` sets `maxDuration: 30` for `config/wsgi.py`.
  - Environment: `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_DEBUG=false`, `DATABASE_URL`, `ORS_API_KEY`.
- **Frontend** (Vercel project `milepost`, root `frontend/`): `API_BASE_URL` points at the backend deployment, and `next.config.ts` rewrites `/api/:path*` there.
- **Local development:**
  - `backend`: `uv run manage.py runserver` (SQLite fallback when `DATABASE_URL` is unset).
  - `frontend`: `pnpm dev` with `API_BASE_URL=http://localhost:8000`.
  - Both folders include a `.env.example`.
- **Attribution:** map and data credits (© OpenStreetMap contributors, OpenRouteService, Photon, OpenFreeMap, GeoNames CC-BY 4.0) appear in the map's attribution control and in the README.

---

## 11. Repository conventions

- **Commits:** Conventional Commits (`feat(hos): …`, `test(hos): …`, `fix(api): …`, `docs: …`, `chore: …`), each one logical change that passes tests.
- **Code style:** ruff (lint + format) for Python; ESLint and the TypeScript strict flags for the frontend. Docstrings on every public function in `hos` and `geo`, and short module headers explaining responsibility.
- **README:**
  - Live links (app, API docs), a screenshot or GIF, and a quick start.
  - An architecture diagram (Mermaid), a **rules → code** table, the assumptions, the testing and deployment notes, and credits.
- **Kept out of git:** the brief and other assessment material, secrets (`.env*` except `.env.example`), and editor/tool folders.

---

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| ORS quota or outage | `RouteCache`; clear `upstream_unavailable` message; one retry |
| Photon throttling | Debounce, 3-character minimum, server cache; free text still works (geocoded on submit) |
| Serverless cold start | Small dependency set, precompiled bytecode (Vercel default), one warm-up `/api/health/` call when the page loads |
| Neon scale-to-zero latency | The first query may take a few hundred ms; acceptable |
| Very long routes (>6,000 km) | Map to `route_not_found` with a helpful message |
| DST during a trip | Fixed home-terminal offset (assumption 8) |

---

## 13. Delivery checklist

- [ ] Public GitHub repo with a clean history and a README
- [ ] Hosted app (Vercel) and API (Vercel, with Swagger at `/api/docs/`)
- [ ] CI green
- [ ] 3–5 minute Loom walkthrough (app demo, then a tour of the code: `hos/`, the compliance checker, log-sheet rendering, tests)

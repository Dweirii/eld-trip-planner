"""Write a sample Trip payload for frontend tests: fixed inputs, offline fake providers.

Usage (from backend/): uv run python scripts/export_sample_trip.py ../frontend/lib/api/__fixtures__/trip-multi-day.json
"""

import json
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings"
os.environ["GEO_GEOCODER"] = "tests.fakes.FakeGeocoder"
os.environ["GEO_ROUTER"] = "tests.fakes.FakeRouter"
os.environ["DATABASE_URL"] = "sqlite://:memory:"

SAMPLE_TRIP = {
    "current_location": {"label": "Chicago, IL", "lat": 41.8781, "lng": -87.6298},
    "pickup_location": {"label": "St. Louis, MO", "lat": 38.627, "lng": -90.1994},
    "dropoff_location": {"label": "Dallas, TX", "lat": 32.7767, "lng": -96.797},
    "current_cycle_used_hours": 12.5,
    "start_time": "2026-10-01T06:00",
}


def main() -> None:
    import django

    django.setup()
    from django.core.management import call_command
    from django.test import Client

    call_command("migrate", verbosity=0)
    response = Client(HTTP_HOST="localhost").post(
        "/api/trips/", SAMPLE_TRIP, content_type="application/json"
    )
    if response.status_code != 201:
        raise SystemExit(f"Planning failed: {response.status_code} {response.content!r}")
    out = Path(sys.argv[1])
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(response.json(), indent=2) + "\n")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()

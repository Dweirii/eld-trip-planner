import pytest

from tests.fakes import FakeRouter

pytestmark = pytest.mark.django_db

CHICAGO = {"label": "Chicago, IL", "lat": 41.8781, "lng": -87.6298}


def body(**overrides):
    return {
        "current_location": CHICAGO,
        "pickup_location": {"label": "St. Louis, MO"},
        "dropoff_location": {"label": "Dallas, TX"},
        "current_cycle_used_hours": 12.5,
        "start_time": "2026-10-01T06:00",
        **overrides,
    }


def post(client, payload):
    return client.post("/api/trips/", payload, content_type="application/json")


def test_plans_a_multi_day_trip(client):
    response = post(client, body())

    assert response.status_code == 201, response.json()
    trip = response.json()
    assert set(trip) == {
        "id",
        "created_at",
        "engine_version",
        "inputs",
        "home_time_zone",
        "summary",
        "route",
        "stops",
        "daily_logs",
        "compliance",
        "assumptions",
    }
    assert trip["home_time_zone"] == {
        "iana": "America/Chicago",
        "abbreviation": "CDT",
        "utc_offset": "-05:00",
    }
    assert trip["summary"]["starts_at"] == "2026-10-01T06:00:00-05:00"
    assert trip["summary"]["days"] == len(trip["daily_logs"]) == 2
    assert all(check["passed"] for check in trip["compliance"])
    assert all(sum(log["totals"].values()) == 24 for log in trip["daily_logs"])
    kinds = [stop["kind"] for stop in trip["stops"]]
    assert kinds[0] == "start" and "pickup" in kinds and "rest" in kinds and kinds[-1] == "dropoff"
    assert trip["daily_logs"][0]["date"] == "2026-10-01"
    assert trip["daily_logs"][0]["header"]["carrier_name"] == "Milepost Freight Co."
    assert trip["inputs"]["pickup_location"]["label"] == "St. Louis, MO"
    assert trip["route"]["geometry"]["type"] == "LineString"
    assert [leg["from"] for leg in trip["route"]["legs"]] == ["Chicago, IL", "St. Louis, MO"]


def test_saved_trip_round_trips(client):
    created = post(client, body()).json()
    fetched = client.get(f"/api/trips/{created['id']}/")
    assert fetched.status_code == 200
    assert fetched.json() == created


def test_unknown_trip_is_404(client):
    response = client.get("/api/trips/nope123456/")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_current_location_equal_to_pickup_routes_two_points(client):
    response = post(client, body(pickup_location=CHICAGO))

    assert response.status_code == 201
    assert len(FakeRouter.calls[-1]) == 2
    stops = response.json()["stops"]
    assert stops[1]["kind"] == "pickup"
    assert stops[1]["mile"] == 0
    assert stops[1]["starts_at"] == "2026-10-01T06:00:00-05:00"


def test_start_just_before_midnight_begins_the_next_day(client):
    trip = post(client, body(start_time="2026-10-01T23:50")).json()
    assert trip["summary"]["starts_at"] == "2026-10-02T00:00:00-05:00"
    assert trip["daily_logs"][0]["date"] == "2026-10-02"


def test_default_start_time_is_on_the_grid(client):
    payload = body()
    del payload["start_time"]
    trip = post(client, payload).json()
    assert int(trip["summary"]["starts_at"][14:16]) % 15 == 0


def test_log_details_override_defaults(client):
    trip = post(client, body(log_details={"driver_name": "Sam Rivera", "truck_number": ""})).json()
    header = trip["daily_logs"][0]["header"]
    assert header["driver_name"] == "Sam Rivera"
    assert header["truck_number"] == "TRK 1042"  # blank falls back to the default
    assert header["time_zone"] == "America/Chicago (CDT, UTC-05:00)"


def test_same_pickup_and_dropoff_is_rejected(client):
    response = post(client, body(dropoff_location={"label": "St. Louis, MO"}))
    assert response.status_code == 400
    assert response.json()["error"] == {
        "code": "validation_error",
        "message": "Pickup and dropoff are the same place.",
        "field": "dropoff_location",
    }


def test_unknown_location_names_the_field(client):
    response = post(client, body(pickup_location={"label": "Atlantis"}))
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "location_not_found"
    assert response.json()["error"]["field"] == "pickup_location"


def test_unroutable_trip_is_422(client):
    response = post(client, body(dropoff_location={"label": "Honolulu, HI"}))
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "route_not_found"


def test_provider_outage_is_503(client):
    response = post(client, body(pickup_location={"label": "Outage City"}))
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "upstream_unavailable"


def test_validation_errors_list_fields(client):
    response = post(client, body(current_cycle_used_hours=71))
    assert response.status_code == 400
    assert "current_cycle_used_hours" in response.json()["error"]["details"]


def test_full_cycle_trip_starts_with_a_restart(client):
    trip = post(client, body(current_cycle_used_hours=70)).json()
    assert [stop["kind"] for stop in trip["stops"]][:2] == ["start", "restart"]
    assert trip["summary"]["stops"]["restart"] == 1
    assert all(check["passed"] for check in trip["compliance"])

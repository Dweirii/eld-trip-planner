"""Coast-to-coast trips: routed one leg at a time and still fully compliant."""

import pytest

from geo.types import Route, RouteLeg
from tests.fakes import FakeRouter
from trips.services import _join

pytestmark = pytest.mark.django_db


def post(client, current: str, pickup: str, dropoff: str, cycle: float = 0) -> dict:
    response = client.post(
        "/api/trips/",
        {
            "current_location": {"label": current},
            "pickup_location": {"label": pickup},
            "dropoff_location": {"label": dropoff},
            "current_cycle_used_hours": cycle,
            "start_time": "2026-10-01T07:00",
        },
        content_type="application/json",
    )
    assert response.status_code == 201, response.json()
    return response.json()


def assert_compliant(trip: dict) -> None:
    assert all(check["passed"] for check in trip["compliance"]), trip["compliance"]
    assert all(sum(log["totals"].values()) == 24 for log in trip["daily_logs"])


def test_join_offsets_the_second_legs_waypoints():
    first = Route((RouteLeg(10, 10),), ((0, 0), (1, 1), (2, 2)), (0, 2))
    second = Route((RouteLeg(20, 20),), ((2, 2), (3, 3), (4, 4), (5, 5)), (0, 3))

    joined = _join(first, second)

    assert joined.legs == (RouteLeg(10, 10), RouteLeg(20, 20))
    assert joined.coordinates == ((0, 0), (1, 1), (2, 2), (3, 3), (4, 4), (5, 5))
    assert joined.waypoints == (0, 2, 5)


def test_very_long_trip_routes_each_leg_separately(client):
    trip = post(client, "New York, NY", "Los Angeles, CA", "Newark, NJ")

    assert [len(points) for points in FakeRouter.calls] == [2, 2]
    assert len(trip["route"]["legs"]) == 2
    assert [leg["from"] for leg in trip["route"]["legs"]] == ["New York, NY", "Los Angeles, CA"]
    assert_compliant(trip)

import csv

import pytest

from geo.places import DATA_FILE, NearestPlaceIndex, default_index
from geo.polyline import haversine_mi
from geo.types import Town

A = Town("Alpha", "AA", 0.0, 0.0, "Etc/UTC")
B = Town("Bravo", "BB", 0.0, 3.0, "Etc/UTC")
C = Town("Charlie", "CC", 5.0, 5.0, "America/Chicago")


def test_nearest_in_the_same_cell():
    assert NearestPlaceIndex([A, B, C]).nearest(0.1, 0.2) is A


def test_nearest_across_cells():
    assert NearestPlaceIndex([A, B, C]).nearest(0.0, 2.4) is B


def test_far_query_expands_the_search():
    index = NearestPlaceIndex([A, B, C])
    assert index.nearest(40.0, 40.0) is C
    assert index.timezone_at(40.0, 40.0) == "America/Chicago"


def test_empty_index_is_rejected():
    with pytest.raises(ValueError):
        NearestPlaceIndex([])


@pytest.mark.parametrize(
    ("lat", "lng", "state", "tz"),
    [
        (36.64, -95.15, "OK", "America/Chicago"),  # Vinita, OK
        (41.8781, -87.6298, "IL", "America/Chicago"),  # Chicago
        (34.0522, -118.2437, "CA", "America/Los_Angeles"),  # Los Angeles
        (40.7128, -74.0060, "NY", "America/New_York"),  # New York
        (39.7392, -104.9903, "CO", "America/Denver"),  # Denver
    ],
)
def test_bundled_us_data(lat, lng, state, tz):
    town = default_index().nearest(lat, lng)
    assert town.state == state
    assert town.timezone == tz


def test_vinita_is_found_by_name():
    assert default_index().nearest(36.64, -95.15).label == "Vinita, OK"


def test_off_us_points_match_a_brute_force_scan():
    """Off-US points (e.g. Paris, Sydney) should match exact scan results."""
    # Load all towns into memory for brute-force comparison
    towns = []
    with DATA_FILE.open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            towns.append(
                Town(
                    row["name"], row["state"], float(row["lat"]), float(row["lng"]), row["timezone"]
                )
            )

    index = default_index()

    # Test Paris
    lat, lng = 48.8, 2.3
    nearest = index.nearest(lat, lng)
    brute_force = min(towns, key=lambda t: haversine_mi((lng, lat), (t.lng, t.lat)))
    assert nearest == brute_force

    # Test Sydney
    lat, lng = -33.0, 151.0
    nearest = index.nearest(lat, lng)
    brute_force = min(towns, key=lambda t: haversine_mi((lng, lat), (t.lng, t.lat)))
    assert nearest == brute_force


def test_ring_search_matches_brute_force_across_the_us():
    """Ring search results should match brute-force scan across US grid points."""
    # Load all towns into memory for brute-force comparison
    towns = []
    with DATA_FILE.open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            towns.append(
                Town(
                    row["name"], row["state"], float(row["lat"]), float(row["lng"]), row["timezone"]
                )
            )

    index = default_index()

    # Test a grid of US coordinates
    for lat in (26, 30, 34, 38, 42, 46):
        for lng in (-122, -114, -106, -98, -90, -82, -74):
            nearest = index.nearest(lat, lng)
            brute_force = min(towns, key=lambda t: haversine_mi((lng, lat), (t.lng, t.lat)))
            assert nearest == brute_force, f"Mismatch at ({lat}, {lng})"

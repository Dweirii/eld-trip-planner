from datetime import datetime
from decimal import Decimal

import pytest

from trips.serializers import TripRequestSerializer

VALID = {
    "current_location": {"label": "Chicago, IL", "lat": 41.8781, "lng": -87.6298},
    "pickup_location": {"label": "St. Louis, MO"},
    "dropoff_location": {"label": "Dallas, TX"},
    "current_cycle_used_hours": 12.5,
}


def validate(**overrides):
    serializer = TripRequestSerializer(data={**VALID, **overrides})
    return serializer.is_valid(), serializer


def test_minimal_request_is_valid():
    ok, serializer = validate()
    assert ok, serializer.errors
    assert serializer.validated_data["current_cycle_used_hours"] == Decimal("12.5")
    assert "start_time" not in serializer.validated_data


def test_start_time_is_parsed_as_naive_local_time():
    ok, serializer = validate(start_time="2026-10-01T06:00")
    assert ok
    assert serializer.validated_data["start_time"] == datetime(2026, 10, 1, 6, 0)


def test_bad_start_time_format_is_rejected():
    ok, serializer = validate(start_time="10/01/2026 6am")
    assert not ok and "start_time" in serializer.errors


def test_far_future_start_time_is_rejected():
    ok, serializer = validate(start_time="9999-12-31T23:50")
    assert not ok
    assert serializer.errors["start_time"] == [
        "Start time must be between the years 2000 and 2100."
    ]


@pytest.mark.parametrize(
    ("label", "lat", "lng"),
    [
        ("Calgary, AB", 51.05, -114.07),  # north of the box (Toronto, at 43.65 N, is inside it)
        ("Mexico City", 19.43, -99.13),  # south
        ("Honolulu, HI", 21.31, -157.86),  # west
    ],
)
def test_coordinates_outside_the_contiguous_us_are_rejected(label, lat, lng):
    ok, serializer = validate(current_location={"label": label, "lat": lat, "lng": lng})
    assert not ok
    assert serializer.errors["current_location"]["non_field_errors"] == [
        "Locations must be in the contiguous United States."
    ]


def test_coordinates_inside_the_contiguous_us_are_accepted():
    ok, serializer = validate(pickup_location={"label": "Denver, CO", "lat": 39.74, "lng": -104.99})
    assert ok, serializer.errors
    assert serializer.validated_data["pickup_location"]["lat"] == 39.74


def test_cycle_hours_must_be_between_0_and_70():
    assert not validate(current_cycle_used_hours=70.25)[0]
    assert not validate(current_cycle_used_hours=-1)[0]
    assert validate(current_cycle_used_hours=70)[0]


def test_lat_and_lng_come_together():
    ok, serializer = validate(pickup_location={"label": "X", "lat": 38.6})
    assert not ok and "pickup_location" in serializer.errors


def test_blank_label_is_rejected():
    assert not validate(dropoff_location={"label": "  "})[0]


def test_log_details_are_optional_and_partial():
    ok, serializer = validate(log_details={"driver_name": "Sam Rivera"})
    assert ok
    assert serializer.validated_data["log_details"] == {"driver_name": "Sam Rivera"}

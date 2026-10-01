"""Route instructions as the API returns them: rounded, and compacted for the UI."""

from geo.types import RouteStep
from trips.presenters import route_steps


def test_steps_are_rounded_for_display():
    steps = route_steps([RouteStep("Head south on Main Street", "Main Street", 0.083, 0.1783)])
    assert steps == [
        {
            "instruction": "Head south on Main Street",
            "road": "Main Street",
            "miles": 0.1,
            "minutes": 0,
        }
    ]


def test_consecutive_steps_on_the_same_road_merge_into_one():
    steps = route_steps(
        [
            RouteStep("Keep left onto US 51", "US 51", 0.494, 1.06),
            RouteStep("Keep left onto US 51", "US 51", 3.398, 3.86),
            RouteStep("Continue straight onto US 51", "US 51", 10.05, 9.4),
            RouteStep("Turn left onto IL 48", "IL 48", 49.032, 74.26),
        ]
    )
    assert steps == [
        {"instruction": "Keep left onto US 51", "road": "US 51", "miles": 13.9, "minutes": 14},
        {"instruction": "Turn left onto IL 48", "road": "IL 48", "miles": 49.0, "minutes": 74},
    ]


def test_unnamed_roads_never_merge():
    steps = route_steps(
        [
            RouteStep("Keep right", "", 0.405, 0.98),
            RouteStep("Keep left", "", 0.025, 0.06),
            RouteStep("Arrive at your destination, on the right", "", 0.0, 0.0),
        ]
    )
    assert [s["instruction"] for s in steps] == [
        "Keep right",
        "Keep left",
        "Arrive at your destination, on the right",
    ]


def test_a_turn_onto_a_different_road_is_never_dropped():
    steps = route_steps(
        [
            RouteStep("Keep right onto I 57", "I 57", 123.2, 171.0),
            RouteStep("Keep left onto I 57 Business", "I 57 Business", 2.0, 3.0),
            RouteStep("Turn right onto I 57", "I 57", 40.0, 41.0),
        ]
    )
    assert [(s["road"], s["miles"]) for s in steps] == [
        ("I 57", 123.2),
        ("I 57 Business", 2.0),
        ("I 57", 40.0),
    ]

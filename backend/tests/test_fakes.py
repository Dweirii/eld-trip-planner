"""The offline router must look enough like ORS for the app and its fixtures."""

import pytest

from tests.fakes import FakeRouter

CHICAGO, ST_LOUIS, DALLAS = (41.8781, -87.6298), (38.627, -90.1994), (32.7767, -96.797)


def test_fake_router_gives_each_leg_plausible_directions():
    first, second = FakeRouter().route([CHICAGO, ST_LOUIS, DALLAS]).legs

    assert [(s.instruction, s.road) for s in first.steps] == [
        ("Head toward St. Louis, MO", "I-55 S"),
        ("Continue onto I-44 W", "I-44 W"),
        ("Arrive at your destination", ""),
    ]
    assert second.steps[0].instruction == "Head toward Dallas, TX"
    for leg in (first, second):
        assert sum(s.miles for s in leg.steps) == pytest.approx(leg.miles)
        assert sum(s.minutes for s in leg.steps) == pytest.approx(leg.duration_min)
        assert leg.steps[1].miles > leg.steps[0].miles  # the highway carries the bulk

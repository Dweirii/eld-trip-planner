import pytest

from geo.polyline import RouteLocator, cumulative_miles, haversine_mi, simplify
from geo.types import Route, RouteLeg

CHICAGO = (-87.6298, 41.8781)
ST_LOUIS = (-90.1994, 38.6270)


def test_haversine_chicago_to_st_louis():
    assert haversine_mi(CHICAGO, ST_LOUIS) == pytest.approx(262.3, abs=0.5)


def test_cumulative_miles_starts_at_zero_and_increases():
    cum = cumulative_miles([(0, 0), (1, 0), (2, 0)])
    assert cum[0] == 0
    assert cum[1] == pytest.approx(69.09, abs=0.1)
    assert cum[2] == pytest.approx(2 * cum[1])


def equator_route() -> Route:
    return Route(
        legs=(RouteLeg(100, 120), RouteLeg(100, 120)),
        coordinates=((0.0, 0.0), (1.0, 0.0), (2.0, 0.0)),
        waypoints=(0, 1, 2),
    )


def test_locator_hits_waypoints_exactly_and_interpolates_within_legs():
    locator = RouteLocator(equator_route())
    assert locator.total_miles == 200
    assert locator.at_mile(0) == pytest.approx((0.0, 0.0))
    assert locator.at_mile(100) == pytest.approx((0.0, 1.0))
    assert locator.at_mile(50) == pytest.approx((0.0, 0.5))
    assert locator.at_mile(150) == pytest.approx((0.0, 1.5))
    assert locator.at_mile(999) == pytest.approx((0.0, 2.0))


def test_locator_handles_a_zero_mile_first_leg():
    route = Route(
        legs=(RouteLeg(0, 0), RouteLeg(50, 60)),
        coordinates=((0.0, 0.0), (1.0, 0.0)),
        waypoints=(0, 0, 1),
    )
    locator = RouteLocator(route)
    assert locator.at_mile(0) == pytest.approx((0.0, 0.0))
    assert locator.at_mile(25) == pytest.approx((0.0, 0.5))


def test_route_round_trips_through_a_dict():
    route = equator_route()
    assert Route.from_dict(route.to_dict()) == route


def test_simplify_collapses_a_straight_line_and_keeps_corners():
    line = [(i / 1000, 0.0) for i in range(5001)]
    assert simplify(line) == [line[0], line[-1]]
    corner = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0)]
    assert simplify(corner) == corner


def test_simplify_respects_max_points():
    zigzag = [(i / 100, (i % 2) * 0.01) for i in range(4000)]
    assert len(simplify(zigzag, max_points=300)) <= 300


def test_simplify_rejects_fewer_than_two_points():
    """max_points < 2 should raise ValueError."""
    line = [(0.0, 0.0), (1.0, 0.0), (2.0, 0.0)]
    with pytest.raises(ValueError):
        simplify(line, max_points=1)


def test_simplify_keeps_both_ends_when_thinning():
    """Both first and last points must be preserved after simplification."""
    zigzag = [(i / 100, (i % 2) * 0.01) for i in range(4000)]
    result = simplify(zigzag, max_points=300)
    assert result[0] == zigzag[0]
    assert result[-1] == zigzag[-1]

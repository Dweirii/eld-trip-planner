import pytest

from geo import services
from geo.errors import LocationNotFound
from geo.models import RouteCache
from geo.types import Place
from tests.fakes import FakeGeocoder, FakeRouter

pytestmark = pytest.mark.django_db


def test_search_is_cached_per_normalized_query():
    first = services.search_places("Chicago, IL")
    second = services.search_places("  chicago,   il ")
    assert first == second == [Place("Chicago, IL", 41.8781, -87.6298)]
    assert FakeGeocoder.calls == ["Chicago, IL"]


def test_resolve_uses_given_coordinates_without_geocoding():
    place = services.resolve_place("Warehouse 9", 41.0, -87.0)
    assert place == Place("Warehouse 9", 41.0, -87.0)
    assert FakeGeocoder.calls == []


def test_resolve_geocodes_a_bare_label():
    assert services.resolve_place("dallas, tx").label == "Dallas, TX"


def test_resolve_unknown_label_names_the_field():
    with pytest.raises(LocationNotFound) as info:
        services.resolve_place("Atlantis", field="pickup_location")
    assert info.value.field == "pickup_location"


def test_reverse_is_cached():
    first = services.reverse_place(36.64, -95.15)
    second = services.reverse_place(36.64, -95.15)
    assert first == second
    assert len([c for c in FakeGeocoder.calls if c.startswith("reverse:")]) == 1


def test_routes_are_cached_by_rounded_coordinates():
    points = [(41.8781, -87.6298), (38.627, -90.1994), (32.7767, -96.797)]
    first = services.get_route(points)
    second = services.get_route([(41.878100001, -87.6298), (38.627, -90.1994), (32.7767, -96.797)])
    assert first == second
    assert len(FakeRouter.calls) == 1


def test_a_cached_route_keeps_its_steps():
    points = [(41.8781, -87.6298), (38.627, -90.1994), (32.7767, -96.797)]
    fresh = services.get_route(points)
    cached = services.get_route(points)

    assert len(FakeRouter.calls) == 1
    assert cached == fresh
    assert all(leg.steps for leg in cached.legs)


def test_routes_cached_before_steps_existed_are_routed_again():
    points = [(41.8781, -87.6298), (38.627, -90.1994)]
    old_key = "driving-hgv:41.87810,-87.62980;38.62700,-90.19940"
    RouteCache.objects.create(
        key=old_key, payload={"legs": [[300.0, 330.0]], "coordinates": [], "waypoints": [0, 0]}
    )

    route = services.get_route(points)

    assert len(FakeRouter.calls) == 1
    assert route.legs[0].steps

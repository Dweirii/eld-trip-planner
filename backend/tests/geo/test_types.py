from geo.types import Route, RouteLeg, RouteStep


def stepped_route() -> Route:
    return Route(
        legs=(
            RouteLeg(
                12.5,
                20.0,
                steps=(
                    RouteStep("Head south on Main Street", "Main Street", 0.5, 1.5),
                    RouteStep("Turn right onto I 55", "I 55", 12.0, 18.5),
                    RouteStep("Arrive at your destination, on the right", "", 0.0, 0.0),
                ),
            ),
        ),
        coordinates=((-87.6, 41.8), (-87.7, 41.7)),
        waypoints=(0, 1),
    )


def test_route_round_trips_its_steps_through_the_cache_payload():
    route = stepped_route()
    assert Route.from_dict(route.to_dict()) == route


def test_cache_payload_stores_each_step_as_a_compact_list():
    legs = stepped_route().to_dict()["legs"]
    assert legs[0][:2] == [12.5, 20.0]
    assert legs[0][2][1] == ["Turn right onto I 55", "I 55", 12.0, 18.5]


def test_a_payload_cached_before_steps_existed_loads_with_no_steps():
    old = {
        "legs": [[12.5, 20.0]],
        "coordinates": [[-87.6, 41.8], [-87.7, 41.7]],
        "waypoints": [0, 1],
    }

    route = Route.from_dict(old)

    assert route.legs == (RouteLeg(12.5, 20.0),)
    assert route.legs[0].steps == ()

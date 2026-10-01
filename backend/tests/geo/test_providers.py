import json
from pathlib import Path

import httpx
import pytest

from geo.errors import RouteNotFound, UpstreamUnavailable
from geo.providers.ors import OrsRouter
from geo.providers.photon import PhotonGeocoder
from geo.types import Place, Route, RouteStep

FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


def client_returning(payload=None, status=200, seen=None, exc=None):
    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        if exc is not None:
            raise exc
        return httpx.Response(status, json=payload)

    return httpx.Client(transport=httpx.MockTransport(handler))


# ── Photon ───────────────────────────────────────────────────────────────
def test_photon_city_search_filters_to_us_states_and_dedupes():
    seen: list[httpx.Request] = []
    geocoder = PhotonGeocoder(
        base_url="https://photon.test",
        client=client_returning(fixture("photon_search_city.json"), seen=seen),
    )

    places = geocoder.search("St. Louis", limit=5)

    assert places == [
        Place("Saint Louis, MO", 38.6254063, -90.190009),
        Place("East Saint Louis, IL", 38.6268666, -90.159707),
    ]
    params = seen[0].url.params
    assert params["q"] == "St. Louis"
    assert params["layer"] == "city"
    assert params["bbox"] == "-125.0,24.3,-66.9,49.4"


def test_photon_address_search_skips_the_city_layer_and_labels_streets():
    seen: list[httpx.Request] = []
    geocoder = PhotonGeocoder(
        base_url="https://photon.test",
        client=client_returning(fixture("photon_search_address.json"), seen=seen),
    )

    places = geocoder.search("2100 Ross Ave Dallas")

    assert "layer" not in seen[0].url.params
    assert [p.label for p in places] == [
        "2100 Ross Ave Tower, Dallas, TX",
        "2150 Ross Avenue, Dallas, TX",
    ]


def test_photon_widens_a_town_search_that_finds_nothing():
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if "layer" in request.url.params:
            return httpx.Response(200, json={"type": "FeatureCollection", "features": []})
        return httpx.Response(200, json=fixture("photon_search_address.json"))

    geocoder = PhotonGeocoder(
        base_url="https://photon.test", client=httpx.Client(transport=httpx.MockTransport(handler))
    )

    places = geocoder.search("Ross Avenue Dallas", limit=5)

    assert [p.label for p in places] == [
        "2100 Ross Ave Tower, Dallas, TX",
        "2150 Ross Avenue, Dallas, TX",
    ]
    assert len(seen) == 2
    first, second = (request.url.params for request in seen)
    assert first["layer"] == "city" and "layer" not in second
    for key in ("q", "limit", "lang", "bbox"):
        assert first[key] == second[key]


def feature(name: str, state: str, lng: float, lat: float, **props) -> dict:
    properties = {"name": name, "state": state, "countrycode": "US", **props}
    return {"geometry": {"coordinates": [lng, lat]}, "properties": properties}


def town_then_everything(towns: list[dict], everything: list[dict], seen: list) -> httpx.Client:
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        features = towns if "layer" in request.url.params else everything
        return httpx.Response(200, json={"type": "FeatureCollection", "features": features})

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_photon_widens_when_the_only_towns_merely_share_a_word_with_the_query():
    seen: list[httpx.Request] = []
    long_beach_in = feature("Long Beach", "Indiana", -86.88, 41.74)
    port = feature("Port of Long Beach", "California", -118.21, 33.75, city="Long Beach")
    geocoder = PhotonGeocoder(
        base_url="https://photon.test",
        client=town_then_everything([long_beach_in], [port], seen),
    )

    places = geocoder.search("Port of Long Beach")

    assert [p.label for p in places] == ["Port of Long Beach, Long Beach, CA"]
    assert len(seen) == 2


@pytest.mark.parametrize(
    ("query", "town"),
    [
        ("Dallas TX", "Dallas"),
        ("Dallas, TX", "Dallas"),
        ("Portland Oregon", "Portland"),
        ("Ft Worth", "Fort Worth"),
        ("chic", "Chicago"),
        ("Winston Salem", "Winston-Salem"),
    ],
)
def test_photon_keeps_towns_the_query_names(query, town):
    seen: list[httpx.Request] = []
    geocoder = PhotonGeocoder(
        base_url="https://photon.test",
        client=town_then_everything([feature(town, "Texas", -97.0, 32.0)], [], seen),
    )

    places = geocoder.search(query)

    assert [p.label for p in places] == [f"{town}, TX"]
    assert len(seen) == 1


def test_photon_reverse_labels_the_town():
    geocoder = PhotonGeocoder(
        base_url="https://photon.test", client=client_returning(fixture("photon_reverse.json"))
    )
    assert geocoder.reverse(36.64, -95.15) == Place("Vinita, OK", 36.64, -95.15)


def test_photon_outage_raises_upstream_unavailable():
    geocoder = PhotonGeocoder(
        base_url="https://photon.test", client=client_returning({}, status=502)
    )
    with pytest.raises(UpstreamUnavailable):
        geocoder.search("Chicago")


# ── OpenRouteService ─────────────────────────────────────────────────────
POINTS = [(41.8781, -87.6298), (38.627, -90.1994), (32.7767, -96.797)]


def test_ors_parses_legs_geometry_and_waypoints():
    seen: list[httpx.Request] = []
    router = OrsRouter(
        api_key="k",
        base_url="https://ors.test",
        client=client_returning(fixture("ors_route.json"), seen=seen),
    )

    route = router.route(POINTS)

    assert [leg.miles for leg in route.legs] == [297.1, 635.3]
    assert route.legs[0].duration_min == pytest.approx(285)
    assert route.waypoints == (0, 2, 4)
    assert route.coordinates[0] == (-87.6298, 41.8781)
    request = seen[0]
    assert request.url.path == "/v2/directions/driving-hgv/geojson"
    assert request.headers["Authorization"] == "k"
    body = json.loads(request.content)
    assert body["coordinates"][0] == [-87.6298, 41.8781]  # lng, lat
    assert body["units"] == "mi"
    assert body["radiuses"] == [-1, -1, -1]
    # ORS only returns the per-leg "segments" when instructions are on (checked against the live API).
    assert body["instructions"] is True


def ors_route_with(payload: dict) -> Route:
    router = OrsRouter(api_key="k", base_url="https://ors.test", client=client_returning(payload))
    return router.route(POINTS)


def test_ors_keeps_each_legs_turn_by_turn_steps():
    first, second = ors_route_with(fixture("ors_route.json")).legs

    assert first.steps[0] == RouteStep(
        "Head south on South Federal Street", "South Federal Street", 0.083, 10.7 / 60
    )
    assert [s.instruction for s in second.steps] == [
        "Head south on South Tucker Boulevard",
        "Keep left onto Ozark Expressway, I 55",
        "Keep right onto I 30, US 67",
        "Arrive at your destination, on the right",
    ]
    for leg in (first, second):
        assert sum(s.miles for s in leg.steps) == pytest.approx(leg.miles)
        assert sum(s.minutes for s in leg.steps) == pytest.approx(leg.duration_min)


def test_ors_steps_without_a_road_name_get_an_empty_road():
    first = ors_route_with(fixture("ors_route.json")).legs[0]
    assert [s.road for s in first.steps] == ["South Federal Street", "", "I 55", ""]


def test_ors_drops_zero_distance_steps_but_keeps_each_legs_arrival():
    first, second = ors_route_with(fixture("ors_route.json")).legs

    assert [s.instruction for s in first.steps] == [
        "Head south on South Federal Street",
        "Keep right",  # the zero-distance "Keep right" before it is gone
        "Keep left onto I 55",
        "Arrive at South Tucker Boulevard, on the right",
    ]
    assert first.steps[-1].miles == 0 and first.steps[-1].minutes == 0
    assert second.steps[-1].instruction == "Arrive at your destination, on the right"


def test_ors_segments_without_steps_give_legs_without_steps():
    payload = fixture("ors_route.json")
    for segment in payload["features"][0]["properties"]["segments"]:
        del segment["steps"]

    route = ors_route_with(payload)

    assert [leg.steps for leg in route.legs] == [(), ()]
    assert [leg.miles for leg in route.legs] == [297.1, 635.3]


@pytest.mark.parametrize(
    "steps",
    [None, ["Turn left"], [{"distance": "x", "duration": 1.0, "instruction": "Turn left"}]],
    ids=["steps-null", "step-is-a-string", "distance-not-a-number"],
)
def test_ors_malformed_steps_raise_upstream_unavailable(steps):
    payload = fixture("ors_route.json")
    for segment in payload["features"][0]["properties"]["segments"]:
        segment["steps"] = steps

    with pytest.raises(UpstreamUnavailable, match="unexpected response"):
        ors_route_with(payload)


@pytest.mark.parametrize(("status", "code"), [(404, 2010), (404, 2009), (400, 2004)])
def test_ors_unroutable_trips_raise_route_not_found(status, code):
    router = OrsRouter(
        api_key="k",
        base_url="https://ors.test",
        client=client_returning({"error": {"code": code, "message": "x"}}, status=status),
    )
    with pytest.raises(RouteNotFound):
        router.route(POINTS)


def test_ors_server_errors_raise_upstream_unavailable():
    router = OrsRouter(
        api_key="k",
        base_url="https://ors.test",
        client=client_returning({"error": "Access denied"}, status=403),
    )
    with pytest.raises(UpstreamUnavailable):
        router.route(POINTS)


@pytest.mark.parametrize("exc", [httpx.ConnectError("down"), httpx.ConnectTimeout("no answer")])
def test_ors_retries_a_network_failure_once(exc):
    seen: list[httpx.Request] = []
    router = OrsRouter(
        api_key="k",
        base_url="https://ors.test",
        client=client_returning(seen=seen, exc=exc),
    )
    with pytest.raises(UpstreamUnavailable):
        router.route(POINTS)
    assert len(seen) == 2


def test_ors_does_not_retry_a_read_timeout():
    seen: list[httpx.Request] = []
    router = OrsRouter(
        api_key="k",
        base_url="https://ors.test",
        client=client_returning(seen=seen, exc=httpx.ReadTimeout("slow")),
    )
    with pytest.raises(UpstreamUnavailable):
        router.route(POINTS)
    assert len(seen) == 1


def test_ors_without_an_api_key_fails_fast():
    seen: list[httpx.Request] = []
    router = OrsRouter(
        api_key="", base_url="https://ors.test", client=client_returning({}, seen=seen)
    )
    with pytest.raises(UpstreamUnavailable, match="ORS_API_KEY"):
        router.route(POINTS)
    assert seen == []

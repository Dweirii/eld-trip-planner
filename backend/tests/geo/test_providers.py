import json
from pathlib import Path

import httpx
import pytest

from geo.errors import RouteNotFound, UpstreamUnavailable
from geo.providers.ors import OrsRouter
from geo.providers.photon import PhotonGeocoder
from geo.types import Place

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


def test_ors_retries_a_network_failure_once():
    seen: list[httpx.Request] = []
    router = OrsRouter(
        api_key="k",
        base_url="https://ors.test",
        client=client_returning(seen=seen, exc=httpx.ConnectError("down")),
    )
    with pytest.raises(UpstreamUnavailable):
        router.route(POINTS)
    assert len(seen) == 2


def test_ors_without_an_api_key_fails_fast():
    seen: list[httpx.Request] = []
    router = OrsRouter(
        api_key="", base_url="https://ors.test", client=client_returning({}, seen=seen)
    )
    with pytest.raises(UpstreamUnavailable, match="ORS_API_KEY"):
        router.route(POINTS)
    assert seen == []

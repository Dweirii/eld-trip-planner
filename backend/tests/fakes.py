"""In-memory stand-ins for the geocoder and router, so tests never touch the network."""

from geo.errors import RouteNotFound, UpstreamUnavailable
from geo.polyline import haversine_mi
from geo.types import Place, Route, RouteLeg

KNOWN_PLACES = {
    "chicago, il": Place("Chicago, IL", 41.8781, -87.6298),
    "st. louis, mo": Place("St. Louis, MO", 38.6270, -90.1994),
    "dallas, tx": Place("Dallas, TX", 32.7767, -96.7970),
    "fort worth, tx": Place("Fort Worth, TX", 32.7555, -97.3308),
    "houston, tx": Place("Houston, TX", 29.7604, -95.3698),
    "new york, ny": Place("New York, NY", 40.7128, -74.0060),
    "newark, nj": Place("Newark, NJ", 40.7357, -74.1724),
    "los angeles, ca": Place("Los Angeles, CA", 34.0522, -118.2437),
    "atlanta, ga": Place("Atlanta, GA", 33.7490, -84.3880),
    "nashville, tn": Place("Nashville, TN", 36.1627, -86.7816),
    "denver, co": Place("Denver, CO", 39.7392, -104.9903),
    "honolulu, hi": Place("Honolulu, HI", 21.3069, -157.8583),
}
ROAD_FACTOR = 1.2
FAKE_MPH = 55.0


class FakeGeocoder:
    calls: list[str] = []

    def search(self, query: str, limit: int = 5) -> list[Place]:
        FakeGeocoder.calls.append(query)
        q = " ".join(query.lower().split())
        if q.startswith("outage"):
            raise UpstreamUnavailable(
                "Address search is temporarily unavailable. Please try again."
            )
        return [place for key, place in KNOWN_PLACES.items() if key.startswith(q)][:limit]

    def reverse(self, lat: float, lng: float) -> Place | None:
        FakeGeocoder.calls.append(f"reverse:{lat},{lng}")
        if lat < 24.3:
            return None
        nearest = min(KNOWN_PLACES.values(), key=lambda p: haversine_mi((lng, lat), (p.lng, p.lat)))
        return Place(nearest.label, lat, lng)


class FakeRouter:
    calls: list[list[tuple[float, float]]] = []

    def route(self, points) -> Route:
        FakeRouter.calls.append(list(points))
        if any(lat < 24.3 for lat, _ in points):
            raise RouteNotFound("No truck route connects these locations.")
        coords: list[tuple[float, float]] = [(points[0][1], points[0][0])]
        waypoints, legs = [0], []
        for (lat1, lng1), (lat2, lng2) in zip(points, points[1:], strict=False):
            coords += [((lng1 + lng2) / 2, (lat1 + lat2) / 2), (lng2, lat2)]
            waypoints.append(len(coords) - 1)
            miles = haversine_mi((lng1, lat1), (lng2, lat2)) * ROAD_FACTOR
            legs.append(RouteLeg(miles, miles / FAKE_MPH * 60))
        return Route(tuple(legs), tuple(coords), tuple(waypoints))

"""OpenRouteService router using the heavy-goods-vehicle (truck) profile."""

from collections.abc import Sequence

import httpx
from django.conf import settings

from ..errors import RouteNotFound, UpstreamUnavailable
from ..types import Route, RouteLeg

PROFILE = "driving-hgv"
NOT_RESPONDING = "The routing service is not responding. Please try again."

# ORS error codes meaning "this trip can't be routed" rather than "the service failed".
ROUTE_ERRORS = {
    2004: "This trip is longer than the routing service allows (about 3,700 miles).",
    2009: "No truck route connects these locations.",
    2010: "One of the locations is too far from a road a truck can use.",
}


class OrsRouter:
    """Router backed by the OpenRouteService directions API (heavy-goods-vehicle profile)."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: float | None = None,
        client: httpx.Client | None = None,
    ) -> None:
        self.api_key = settings.ORS_API_KEY if api_key is None else api_key
        self.base_url = (base_url or settings.ORS_BASE_URL).rstrip("/")
        self.client = client or httpx.Client(
            timeout=timeout or settings.HTTP_TIMEOUT_SECONDS,
            headers={"User-Agent": settings.HTTP_USER_AGENT},
        )

    def route(self, points: Sequence[tuple[float, float]]) -> Route:
        """Route through ``points`` given as (lat, lng); one leg per consecutive pair."""
        if not self.api_key:
            raise UpstreamUnavailable(
                "Routing is not configured on the server (missing ORS_API_KEY)."
            )
        body = {
            "coordinates": [[lng, lat] for lat, lng in points],
            "units": "mi",
            "instructions": True,  # without them ORS omits the per-leg "segments" we read below
            "radiuses": [-1] * len(points),  # snap each stop to the nearest road, however far
        }
        response = self._post(body)
        if response.status_code >= 400:
            raise self._error(response)
        try:
            feature = response.json()["features"][0]
            segments = feature["properties"]["segments"]
            waypoints = tuple(feature["properties"]["way_points"])
            coordinates = tuple((c[0], c[1]) for c in feature["geometry"]["coordinates"])
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise UpstreamUnavailable(
                "The routing service returned an unexpected response."
            ) from exc
        legs = tuple(
            RouteLeg(
                miles=float(s.get("distance", 0.0)), duration_min=float(s.get("duration", 0.0)) / 60
            )
            for s in segments
        )
        return Route(legs=legs, coordinates=coordinates, waypoints=waypoints)

    def _post(self, body: dict) -> httpx.Response:
        url = f"{self.base_url}/v2/directions/{PROFILE}/geojson"
        headers = {
            "Authorization": self.api_key,
            "Accept": "application/geo+json, application/json",
        }
        for attempt in range(2):
            try:
                return self.client.post(url, json=body, headers=headers)
            except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
                if attempt == 1:  # a connection that never opened is safe to retry once
                    raise UpstreamUnavailable(NOT_RESPONDING) from exc
            except httpx.TransportError as exc:  # e.g. a read timeout: don't wait twice
                raise UpstreamUnavailable(NOT_RESPONDING) from exc
        raise AssertionError("unreachable")

    @staticmethod
    def _error(response: httpx.Response) -> Exception:
        try:
            error = response.json().get("error")
        except ValueError:
            error = None
        code = error.get("code") if isinstance(error, dict) else None
        if code in ROUTE_ERRORS:
            return RouteNotFound(ROUTE_ERRORS[code])
        return UpstreamUnavailable(
            f"The routing service failed (HTTP {response.status_code}). Please try again."
        )

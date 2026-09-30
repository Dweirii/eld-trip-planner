"""Errors raised by geocoding and routing; each carries its public API code."""

from config.errors import ApiError


class GeoError(ApiError):
    """Base class for geocoding and routing failures."""


class LocationNotFound(GeoError):
    """A place could not be found in the United States (HTTP 422)."""

    status_code = 422
    code = "location_not_found"


class RouteNotFound(GeoError):
    """No truck route connects the stops (HTTP 422)."""

    status_code = 422
    code = "route_not_found"


class UpstreamUnavailable(GeoError):
    """A map provider failed or is not configured (HTTP 503)."""

    status_code = 503
    code = "upstream_unavailable"

"""Errors raised by geocoding and routing; each carries its public API code."""

from config.errors import ApiError


class GeoError(ApiError):
    """Base class for geocoding and routing failures."""


class LocationNotFound(GeoError):
    status_code = 422
    code = "location_not_found"


class RouteNotFound(GeoError):
    status_code = 422
    code = "route_not_found"


class UpstreamUnavailable(GeoError):
    status_code = 503
    code = "upstream_unavailable"

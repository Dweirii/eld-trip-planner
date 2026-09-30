"""Great-circle distances, road-mile → coordinate lookup, and line simplification."""

import bisect
import math
from collections.abc import Sequence

from .types import LngLat, Route

EARTH_RADIUS_MI = 3958.7613


def haversine_mi(a: LngLat, b: LngLat) -> float:
    """Great-circle distance in statute miles between two (lng, lat) points."""
    lng1, lat1, lng2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    )
    return 2 * EARTH_RADIUS_MI * math.asin(math.sqrt(h))


def cumulative_miles(coords: Sequence[LngLat]) -> list[float]:
    """Running great-circle miles along a line: one entry per point, starting at 0.0."""
    out = [0.0]
    for a, b in zip(coords, coords[1:], strict=False):
        out.append(out[-1] + haversine_mi(a, b))
    return out


def _interpolate(coords: Sequence[LngLat], cum: Sequence[float], target: float) -> LngLat:
    if target <= 0 or len(coords) == 1:
        return coords[0]
    if target >= cum[-1]:
        return coords[-1]
    i = bisect.bisect_right(cum, target)
    (x1, y1), (x2, y2) = coords[i - 1], coords[i]
    span = cum[i] - cum[i - 1]
    f = (target - cum[i - 1]) / span if span else 0.0
    return (x1 + (x2 - x1) * f, y1 + (y2 - y1) * f)


class RouteLocator:
    """Maps a road-mile position on a multi-leg route to (lat, lng).

    Road miles (from the router) and geometric miles differ slightly, so each leg
    is scaled on its own: waypoints (pickup, dropoff) land exactly on their coordinates.
    """

    def __init__(self, route: Route) -> None:
        self._legs: list[tuple[float, float, Sequence[LngLat], list[float]]] = []
        start = 0.0
        for i, leg in enumerate(route.legs):
            a, b = route.waypoints[i], route.waypoints[i + 1]
            coords = route.coordinates[a : b + 1]
            self._legs.append((start, leg.miles, coords, cumulative_miles(coords)))
            start += leg.miles
        self.total_miles = start

    def at_mile(self, mile: float) -> tuple[float, float]:
        """(lat, lng) at ``mile`` road miles from the start, clamped to the route's ends."""
        for index, (start, miles, coords, cum) in enumerate(self._legs):
            if mile <= start + miles or index == len(self._legs) - 1:
                fraction = 0.0 if miles == 0 else min(max((mile - start) / miles, 0.0), 1.0)
                lng, lat = _interpolate(coords, cum, fraction * cum[-1])
                return lat, lng
        raise ValueError("route has no legs")


def _perpendicular(p: LngLat, a: LngLat, b: LngLat) -> float:
    (x, y), (x1, y1), (x2, y2) = p, a, b
    dx, dy = x2 - x1, y2 - y1
    if dx == dy == 0:
        return math.hypot(x - x1, y - y1)
    return abs(dy * x - dx * y + x2 * y1 - y2 * x1) / math.hypot(dx, dy)


def _rdp(coords: Sequence[LngLat], tolerance: float) -> list[LngLat]:
    keep = [False] * len(coords)
    keep[0] = keep[-1] = True
    stack = [(0, len(coords) - 1)]
    while stack:
        first, last = stack.pop()
        best, index = 0.0, None
        for i in range(first + 1, last):
            d = _perpendicular(coords[i], coords[first], coords[last])
            if d > best:
                best, index = d, i
        if index is not None and best > tolerance:
            keep[index] = True
            stack += [(first, index), (index, last)]
    return [c for c, k in zip(coords, keep, strict=False) if k]


def _thin_uniformly(coords: Sequence[LngLat], limit: int) -> list[LngLat]:
    """Evenly spaced subset of at most ``limit`` points, keeping both ends."""
    if len(coords) <= limit:
        return list(coords)
    last = len(coords) - 1
    return [coords[round(i * last / (limit - 1))] for i in range(limit)]


def simplify(
    coords: Sequence[LngLat], max_points: int = 1500, tolerance: float = 0.0005
) -> list[LngLat]:
    """Ramer–Douglas–Peucker for display, with bounded cost.

    Very dense or adversarial lines are first thinned uniformly to at most 4 × max_points;
    after one RDP pass the result is thinned uniformly to at most max_points.
    First and last points are always kept.
    """
    if max_points < 2:
        raise ValueError("max_points must be at least 2")
    coords = list(coords)
    if len(coords) <= 2:
        return coords
    coords = _thin_uniformly(coords, 4 * max_points)
    result = _rdp(coords, tolerance)
    return _thin_uniformly(result, max_points)

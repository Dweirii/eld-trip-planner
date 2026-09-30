"""Trip planning use case: validated input → a saved, fully planned Trip."""

import functools
from collections.abc import Callable
from datetime import datetime
from decimal import Decimal

from django.utils import timezone as dj_timezone

from config.errors import ApiError
from geo import services as geo
from geo.places import NearestPlaceIndex, default_index
from geo.polyline import RouteLocator, haversine_mi
from geo.types import Place, Route, RouteLeg
from hos import ENGINE_VERSION
from hos.compliance import check
from hos.daily_logs import build_daily_logs
from hos.models import Leg
from hos.planner import plan_trip

from . import presenters
from .clock import HomeClock
from .models import Trip
from .serializers import DEFAULT_LOG_DETAILS

LOCATION_FIELDS = ("current_location", "pickup_location", "dropoff_location")
SAME_POINT_MILES = 0.1
WAYPOINT_MILES = 0.05
# Straight-line; beyond this one ORS request can pass its 6,000 km cap.
SINGLE_REQUEST_MAX_MILES = 3000


def plan_and_save(data: dict, *, now: datetime | None = None) -> Trip:
    current, pickup, dropoff = (
        geo.resolve_place(data[f]["label"], data[f].get("lat"), data[f].get("lng"), field=f)
        for f in LOCATION_FIELDS
    )
    if _same_point(pickup, dropoff):
        raise ApiError("Pickup and dropoff are the same place.", field="dropoff_location")

    route = _route(current, pickup, dropoff)
    index = default_index()
    clock = HomeClock.create(
        index.timezone_at(current.lat, current.lng),
        data.get("start_time"),
        now or dj_timezone.now(),
    )
    cycle_used = data["current_cycle_used_hours"]
    plan = plan_trip(
        [Leg(leg.miles, leg.duration_min) for leg in route.legs],
        float(cycle_used),
        clock.start_minute,
    )

    locator = RouteLocator(route)
    place_at_mile = _place_namer(locator, index, route.legs[0].miles, current, pickup, dropoff)
    logs = build_daily_logs(plan, place_at_mile)
    log_details = {
        **DEFAULT_LOG_DETAILS,
        **{k: v for k, v in data.get("log_details", {}).items() if v},
    }
    inputs = {
        "current_location": current.to_dict(),
        "pickup_location": pickup.to_dict(),
        "dropoff_location": dropoff.to_dict(),
        "current_cycle_used_hours": float(cycle_used),
        "start_time": clock.start_local,
        "log_details": log_details,
    }
    result = presenters.trip_result(
        inputs=inputs,
        plan=plan,
        logs=logs,
        checks=check(plan, logs),
        route=route,
        clock=clock,
        locator=locator,
        place_at_mile=place_at_mile,
    )
    return Trip.objects.create(
        current_label=current.label,
        pickup_label=pickup.label,
        dropoff_label=dropoff.label,
        cycle_used_hours=cycle_used,
        total_miles=Decimal(str(round(plan.total_miles, 1))),
        days=len(logs),
        engine_version=ENGINE_VERSION,
        request=inputs,
        result=result,
    )


def _straight_miles(a: Place, b: Place) -> float:
    return haversine_mi((a.lng, a.lat), (b.lng, b.lat))


def _same_point(a: Place, b: Place) -> bool:
    return _straight_miles(a, b) < SAME_POINT_MILES


def _route(current: Place, pickup: Place, dropoff: Place) -> Route:
    if _same_point(current, pickup):  # routers reject duplicate points: route the tail only
        tail = geo.get_route([(pickup.lat, pickup.lng), (dropoff.lat, dropoff.lng)])
        return Route(
            legs=(RouteLeg(0.0, 0.0), *tail.legs),
            coordinates=tail.coordinates,
            waypoints=(0, *tail.waypoints),
        )
    if (
        _straight_miles(current, pickup) + _straight_miles(pickup, dropoff)
        > SINGLE_REQUEST_MAX_MILES
    ):
        return _join(
            geo.get_route([(current.lat, current.lng), (pickup.lat, pickup.lng)]),
            geo.get_route([(pickup.lat, pickup.lng), (dropoff.lat, dropoff.lng)]),
        )
    return geo.get_route([(p.lat, p.lng) for p in (current, pickup, dropoff)])


def _join(first: Route, second: Route) -> Route:
    """Concatenate two single-leg routes that meet at the pickup."""
    offset = len(first.coordinates) - 1
    return Route(
        legs=(*first.legs, *second.legs),
        coordinates=(*first.coordinates, *second.coordinates[1:]),
        waypoints=(*first.waypoints, *(w + offset for w in second.waypoints[1:])),
    )


def _place_namer(
    locator: RouteLocator,
    index: NearestPlaceIndex,
    pickup_mile: float,
    current: Place,
    pickup: Place,
    dropoff: Place,
) -> Callable[[float], str]:
    """Label a road-mile position: the user's own labels at the stops, else the nearest town."""

    @functools.lru_cache(maxsize=1024)
    def name(mile: float) -> str:
        if abs(mile - pickup_mile) < WAYPOINT_MILES:
            return pickup.label
        if abs(mile) < WAYPOINT_MILES:
            return current.label
        if abs(mile - locator.total_miles) < WAYPOINT_MILES:
            return dropoff.label
        lat, lng = locator.at_mile(mile)
        return index.nearest(lat, lng).label

    return name

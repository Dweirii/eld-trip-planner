"""Cached access to the configured geocoder and router."""

import functools
from collections.abc import Sequence
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from django.utils.module_loading import import_string

from .errors import LocationNotFound
from .models import GeocodeCache, RouteCache
from .providers.base import Geocoder, Router
from .types import Place, Route

GEOCODE_TTL = timedelta(days=30)
ROUTE_PROFILE = "driving-hgv"


@functools.cache
def _provider(dotted_path: str):
    """One adapter instance per configured class (keeps HTTP connection pools alive)."""
    return import_string(dotted_path)()


def geocoder() -> Geocoder:
    return _provider(settings.GEO_GEOCODER)


def router() -> Router:
    return _provider(settings.GEO_ROUTER)


def search_places(query: str, limit: int = 5) -> list[Place]:
    key = f"search:{limit}:{' '.join(query.lower().split())}"
    cached = _fresh(key)
    if cached is not None:
        return [Place(**p) for p in cached]
    places = geocoder().search(query, limit)
    GeocodeCache.objects.update_or_create(
        query=key, defaults={"results": [p.to_dict() for p in places]}
    )
    return places


def reverse_place(lat: float, lng: float) -> Place | None:
    key = f"reverse:{lat:.3f},{lng:.3f}"
    cached = _fresh(key)
    if cached is not None:
        return Place(**cached[0]) if cached else None
    place = geocoder().reverse(lat, lng)
    GeocodeCache.objects.update_or_create(
        query=key, defaults={"results": [place.to_dict()] if place else []}
    )
    return place


def resolve_place(
    label: str, lat: float | None = None, lng: float | None = None, *, field: str | None = None
) -> Place:
    """Coordinates from the client win; otherwise geocode the label (US only)."""
    if lat is not None and lng is not None:
        return Place(label, lat, lng)
    matches = search_places(label, limit=1)
    if not matches:
        raise LocationNotFound(f'We couldn\'t find "{label}" in the United States.', field=field)
    return matches[0]


def get_route(points: Sequence[tuple[float, float]]) -> Route:
    key = f"{ROUTE_PROFILE}:" + ";".join(f"{lat:.5f},{lng:.5f}" for lat, lng in points)
    cached = RouteCache.objects.filter(key=key).first()
    if cached is not None:
        return Route.from_dict(cached.payload)
    route = router().route(points)
    RouteCache.objects.update_or_create(key=key, defaults={"payload": route.to_dict()})
    return route


def _fresh(key: str) -> list[dict] | None:
    row = GeocodeCache.objects.filter(
        query=key, updated_at__gte=timezone.now() - GEOCODE_TTL
    ).first()
    return row.results if row else None

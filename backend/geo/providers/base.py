"""Provider interfaces. Adapters are chosen by settings.GEO_GEOCODER / GEO_ROUTER."""

from collections.abc import Sequence
from typing import Protocol

from ..types import Place, Route


class Geocoder(Protocol):
    def search(self, query: str, limit: int = 5) -> list[Place]: ...

    def reverse(self, lat: float, lng: float) -> Place | None: ...


class Router(Protocol):
    def route(self, points: Sequence[tuple[float, float]]) -> Route:
        """Route through ``points`` given as (lat, lng)."""
        ...

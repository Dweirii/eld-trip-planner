"""Provider interfaces. Adapters are chosen by settings.GEO_GEOCODER / GEO_ROUTER."""

from collections.abc import Sequence
from typing import Protocol

from ..types import Place, Route


class Geocoder(Protocol):
    """Looks up US places by text or by coordinate."""

    def search(self, query: str, limit: int = 5) -> list[Place]:
        """Up to ``limit`` US places matching ``query``, best first."""
        ...

    def reverse(self, lat: float, lng: float) -> Place | None:
        """The US town at (lat, lng), or None when there isn't one."""
        ...


class Router(Protocol):
    """Routes a truck through an ordered list of stops."""

    def route(self, points: Sequence[tuple[float, float]]) -> Route:
        """Route through ``points`` given as (lat, lng)."""
        ...

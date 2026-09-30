"""Offline nearest-town lookup over bundled GeoNames data (CC BY 4.0).

Towns are bucketed into a lat/lng grid. A query searches growing square rings
of cells and stops once the best match is closer than any unsearched cell could be.
"""

import csv
import functools
import math
from collections import defaultdict
from collections.abc import Iterable
from pathlib import Path

from .polyline import haversine_mi
from .types import Town

DATA_FILE = Path(__file__).resolve().parent / "data" / "us_places.csv"
_MILES_PER_DEGREE = 69.0  # slightly under the true 69.09, so the stop condition stays safe


class NearestPlaceIndex:
    def __init__(self, towns: Iterable[Town], cell_deg: float = 1.0) -> None:
        self._cell = cell_deg
        self._grid: dict[tuple[int, int], list[Town]] = defaultdict(list)
        for town in towns:
            self._grid[self._key(town.lat, town.lng)].append(town)
        if not self._grid:
            raise ValueError("NearestPlaceIndex needs at least one town")

    @classmethod
    def from_csv(cls, path: Path = DATA_FILE) -> "NearestPlaceIndex":
        with path.open(encoding="utf-8") as fh:
            return cls(
                Town(
                    row["name"], row["state"], float(row["lat"]), float(row["lng"]), row["timezone"]
                )
                for row in csv.DictReader(fh)
            )

    def nearest(self, lat: float, lng: float) -> Town:
        cy, cx = self._key(lat, lng)
        best: Town | None = None
        best_d = math.inf
        for ring in range(0, 360):
            for ky in range(cy - ring, cy + ring + 1):
                for kx in range(cx - ring, cx + ring + 1):
                    if max(abs(ky - cy), abs(kx - cx)) != ring:
                        continue
                    for town in self._grid.get((ky, kx), ()):
                        d = haversine_mi((lng, lat), (town.lng, town.lat))
                        if d < best_d:
                            best, best_d = town, d
            if best is not None and best_d <= self._searched_radius_mi(lat, lng, cy, cx, ring):
                return best
        if best is None:  # pragma: no cover - impossible with a non-empty grid
            raise ValueError("no towns indexed")
        return best

    def timezone_at(self, lat: float, lng: float) -> str:
        return self.nearest(lat, lng).timezone

    def _key(self, lat: float, lng: float) -> tuple[int, int]:
        return math.floor(lat / self._cell), math.floor(lng / self._cell)

    def _searched_radius_mi(self, lat: float, lng: float, cy: int, cx: int, ring: int) -> float:
        """Distance from the query to the nearest edge of the square already searched."""
        south, north = (cy - ring) * self._cell, (cy + ring + 1) * self._cell
        west, east = (cx - ring) * self._cell, (cx + ring + 1) * self._cell
        widest_lat = min(89.0, max(abs(south), abs(north)))
        to_lat_edge = min(lat - south, north - lat) * _MILES_PER_DEGREE
        to_lng_edge = (
            min(lng - west, east - lng) * _MILES_PER_DEGREE * math.cos(math.radians(widest_lat))
        )
        return min(to_lat_edge, to_lng_edge)


@functools.lru_cache(maxsize=1)
def default_index() -> NearestPlaceIndex:
    """The bundled US index, loaded once per process."""
    return NearestPlaceIndex.from_csv()

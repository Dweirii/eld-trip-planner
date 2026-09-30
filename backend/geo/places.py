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
_MAX_RING = 3  # past this, one exact scan beats more rings


class NearestPlaceIndex:
    def __init__(self, towns: Iterable[Town], cell_deg: float = 1.0) -> None:
        self._cell = cell_deg
        self._towns = list(towns)
        self._grid: dict[tuple[int, int], list[Town]] = defaultdict(list)
        for town in self._towns:
            self._grid[self._key(town.lat, town.lng)].append(town)
        if not self._towns:
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
        for ring in range(0, _MAX_RING + 1):
            for ky, kx in self._ring_cells(cy, cx, ring):
                for town in self._grid.get((ky, kx), ()):
                    d = haversine_mi((lng, lat), (town.lng, town.lat))
                    if d < best_d:
                        best, best_d = town, d
            if best is not None and best_d <= self._searched_radius_mi(lat, lng, cy, cx, ring):
                return best
        # Far from every town (e.g. outside the US): exact scan.
        return min(self._towns, key=lambda t: haversine_mi((lng, lat), (t.lng, t.lat)))

    def timezone_at(self, lat: float, lng: float) -> str:
        return self.nearest(lat, lng).timezone

    @staticmethod
    def _ring_cells(cy: int, cx: int, ring: int) -> list[tuple[int, int]]:
        """Yield cells on the perimeter of a square ring around (cy, cx).

        Ring 0 yields (cy, cx). Otherwise yield top/bottom rows and left/right columns.
        """
        if ring == 0:
            return [(cy, cx)]
        cells: list[tuple[int, int]] = []
        # Top and bottom rows
        for kx in range(cx - ring, cx + ring + 1):
            cells.append((cy - ring, kx))
            cells.append((cy + ring, kx))
        # Left and right columns (excluding corners already added)
        for ky in range(cy - ring + 1, cy + ring):
            cells.append((ky, cx - ring))
            cells.append((ky, cx + ring))
        return cells

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

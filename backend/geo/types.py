"""Value types for places and routes. Route coordinates are (lng, lat), like GeoJSON."""

from dataclasses import dataclass

LngLat = tuple[float, float]


@dataclass(frozen=True, slots=True)
class Place:
    label: str
    lat: float
    lng: float

    def to_dict(self) -> dict:
        return {"label": self.label, "lat": self.lat, "lng": self.lng}


@dataclass(frozen=True, slots=True)
class Town:
    name: str
    state: str
    lat: float
    lng: float
    timezone: str

    @property
    def label(self) -> str:
        return f"{self.name}, {self.state}"


@dataclass(frozen=True, slots=True)
class RouteLeg:
    miles: float
    duration_min: float


@dataclass(frozen=True, slots=True)
class Route:
    legs: tuple[RouteLeg, ...]
    coordinates: tuple[LngLat, ...]
    waypoints: tuple[int, ...]  # coordinate index of each stop; len(legs) + 1 entries

    def to_dict(self) -> dict:
        return {
            "legs": [[leg.miles, leg.duration_min] for leg in self.legs],
            "coordinates": [list(c) for c in self.coordinates],
            "waypoints": list(self.waypoints),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Route":
        return cls(
            legs=tuple(RouteLeg(miles, minutes) for miles, minutes in data["legs"]),
            coordinates=tuple((c[0], c[1]) for c in data["coordinates"]),
            waypoints=tuple(data["waypoints"]),
        )

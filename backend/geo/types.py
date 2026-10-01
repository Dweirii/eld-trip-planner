"""Value types for places and routes. Route coordinates are (lng, lat), like GeoJSON."""

from dataclasses import dataclass

LngLat = tuple[float, float]


@dataclass(frozen=True, slots=True)
class Place:
    """A labelled point: a user's stop or a geocoder result."""

    label: str
    lat: float
    lng: float

    def to_dict(self) -> dict:
        """JSON-ready {"label", "lat", "lng"}."""
        return {"label": self.label, "lat": self.lat, "lng": self.lng}


@dataclass(frozen=True, slots=True)
class Town:
    """A bundled GeoNames town with its IANA time zone."""

    name: str
    state: str
    lat: float
    lng: float
    timezone: str

    @property
    def label(self) -> str:
        """Display label such as "Tulsa, OK"."""
        return f"{self.name}, {self.state}"


@dataclass(frozen=True, slots=True)
class RouteStep:
    """One turn-by-turn instruction: the manoeuvre, the road it puts you on, and how far it runs."""

    instruction: str
    road: str  # "" when the router has no name for it
    miles: float
    minutes: float


@dataclass(frozen=True, slots=True)
class RouteLeg:
    """One leg between consecutive stops: road miles, drive minutes and the directions."""

    miles: float
    duration_min: float
    steps: tuple[RouteStep, ...] = ()


@dataclass(frozen=True, slots=True)
class Route:
    """A routed line through the stops, with one leg per consecutive pair."""

    legs: tuple[RouteLeg, ...]
    coordinates: tuple[LngLat, ...]
    waypoints: tuple[int, ...]  # coordinate index of each stop; len(legs) + 1 entries

    def to_dict(self) -> dict:
        """JSON-ready form, as stored in the route cache."""
        return {
            "legs": [
                [
                    leg.miles,
                    leg.duration_min,
                    [[s.instruction, s.road, s.miles, s.minutes] for s in leg.steps],
                ]
                for leg in self.legs
            ],
            "coordinates": [list(c) for c in self.coordinates],
            "waypoints": list(self.waypoints),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Route":
        """Inverse of ``to_dict``."""
        return cls(
            legs=tuple(_leg_from_list(leg) for leg in data["legs"]),
            coordinates=tuple((c[0], c[1]) for c in data["coordinates"]),
            waypoints=tuple(data["waypoints"]),
        )


def _leg_from_list(item: list) -> RouteLeg:
    miles, minutes, *rest = item
    steps = rest[0] if rest else []  # payloads cached before steps existed have none
    return RouteLeg(miles, minutes, tuple(RouteStep(*step) for step in steps))

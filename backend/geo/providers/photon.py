"""Photon (komoot) geocoder: OpenStreetMap search that allows autocomplete (fair use)."""

import httpx
from django.conf import settings

from ..errors import UpstreamUnavailable
from ..types import Place

US_BBOX = "-125.0,24.3,-66.9,49.4"  # contiguous United States

US_STATES = {
    "Alabama": "AL", "Arizona": "AZ", "Arkansas": "AR", "California": "CA", "Colorado": "CO",
    "Connecticut": "CT", "Delaware": "DE", "District of Columbia": "DC", "Florida": "FL",
    "Georgia": "GA", "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
    "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD", "Massachusetts": "MA",
    "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS", "Missouri": "MO", "Montana": "MT",
    "Nebraska": "NE", "Nevada": "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM",
    "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
    "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
    "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT",
    "Virginia": "VA", "Washington": "WA", "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
}  # fmt: skip


class PhotonGeocoder:
    def __init__(
        self,
        base_url: str | None = None,
        timeout: float | None = None,
        client: httpx.Client | None = None,
    ) -> None:
        self.base_url = (base_url or settings.PHOTON_BASE_URL).rstrip("/")
        self.client = client or httpx.Client(
            timeout=timeout or settings.HTTP_TIMEOUT_SECONDS,
            headers={"User-Agent": settings.HTTP_USER_AGENT},
        )

    def search(self, query: str, limit: int = 5) -> list[Place]:
        params = [("q", query), ("limit", str(limit * 2)), ("lang", "en"), ("bbox", US_BBOX)]
        if not any(ch.isdigit() for ch in query):
            params.append(("layer", "city"))  # towns first; digits suggest a street address
        places: list[Place] = []
        for feature in self._get("/api/", params).get("features", []):
            place = to_place(feature)
            if place and place.label not in {p.label for p in places}:
                places.append(place)
        return places[:limit]

    def reverse(self, lat: float, lng: float) -> Place | None:
        params = [("lat", f"{lat:.6f}"), ("lon", f"{lng:.6f}"), ("lang", "en")]
        for feature in self._get("/reverse", params).get("features", []):
            props = feature.get("properties", {})
            state = US_STATES.get(props.get("state", ""))
            town = props.get("city") or props.get("name")
            if props.get("countrycode") == "US" and state and town:
                return Place(f"{town}, {state}", lat, lng)
        return None

    def _get(self, path: str, params: list[tuple[str, str]]) -> dict:
        try:
            response = self.client.get(f"{self.base_url}{path}", params=params)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise UpstreamUnavailable(
                "Address search is temporarily unavailable. Please try again."
            ) from exc


def to_place(feature: dict) -> Place | None:
    """A US Photon feature → Place with a "Name, City, ST" label; anything else → None."""
    props = feature.get("properties", {})
    state = US_STATES.get(props.get("state", ""))
    if props.get("countrycode") != "US" or not state:
        return None
    street = " ".join(p for p in (props.get("housenumber"), props.get("street")) if p)
    first = props.get("name") or street
    parts = [first]
    city = props.get("city")
    if city and city != first:
        parts.append(city)
    parts.append(state)
    lng, lat = feature["geometry"]["coordinates"]
    return Place(", ".join(p for p in parts if p), lat, lng)

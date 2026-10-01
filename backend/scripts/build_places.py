"""Build geo/data/us_places.csv from the GeoNames cities1000 dump.

Data: GeoNames (https://www.geonames.org), licensed CC BY 4.0.
Usage (from backend/): uv run python scripts/build_places.py
"""

import csv
import io
import urllib.request
import zipfile
from pathlib import Path

SOURCE = "https://download.geonames.org/export/dump/cities1000.zip"
OUT = Path(__file__).resolve().parent.parent / "geo" / "data" / "us_places.csv"
US_STATES = set(
    [
        "AL",
        "AK",
        "AZ",
        "AR",
        "CA",
        "CO",
        "CT",
        "DE",
        "DC",
        "FL",
        "GA",
        "HI",
        "ID",
        "IL",
        "IN",
        "IA",
        "KS",
        "KY",
        "LA",
        "ME",
        "MD",
        "MA",
        "MI",
        "MN",
        "MS",
        "MO",
        "MT",
        "NE",
        "NV",
        "NH",
        "NJ",
        "NM",
        "NY",
        "NC",
        "ND",
        "OH",
        "OK",
        "OR",
        "PA",
        "RI",
        "SC",
        "SD",
        "TN",
        "TX",
        "UT",
        "VT",
        "VA",
        "WA",
        "WV",
        "WI",
        "WY",
    ]
)


def main() -> None:
    with urllib.request.urlopen(SOURCE, timeout=120) as response:
        archive = zipfile.ZipFile(io.BytesIO(response.read()))
    text = archive.read("cities1000.txt").decode("utf-8")
    rows = []
    for line in text.splitlines():
        f = line.split("\t")
        # 1 name, 4 lat, 5 lng, 6 feature class, 8 country, 10 admin1 (state), 17 timezone
        if f[8] != "US" or f[6] != "P" or f[10] not in US_STATES:
            continue
        rows.append((f[1], f[10], round(float(f[4]), 5), round(float(f[5]), 5), f[17]))
    rows.sort(key=lambda row: (row[1], row[0]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["name", "state", "lat", "lng", "timezone"])
        writer.writerows(rows)
    print(f"Wrote {len(rows)} places to {OUT}")


if __name__ == "__main__":
    main()

"""Shape planner output into the public API payload (spec §7.2)."""

from collections.abc import Callable, Sequence
from dataclasses import asdict, replace
from datetime import datetime

from geo.polyline import RouteLocator, simplify
from geo.types import Route, RouteStep
from hos import ENGINE_VERSION
from hos.compliance import RuleCheck
from hos.daily_logs import DailyLog
from hos.models import WORK_STATUSES, DutyStatus, EventKind, TripPlan
from hos.rules import ASSUMPTIONS, DEFAULT_RULES, describe
from hos.timeutil import hhmm

from .clock import HomeClock
from .models import Trip

STOP_KINDS = frozenset(
    {
        EventKind.PICKUP,
        EventKind.DROPOFF,
        EventKind.FUEL,
        EventKind.BREAK,
        EventKind.REST,
        EventKind.RESTART,
    }
)
COUNTED_STOPS = {
    "fuel": EventKind.FUEL,
    "break": EventKind.BREAK,
    "rest": EventKind.REST,
    "restart": EventKind.RESTART,
}


def trip_payload(trip: Trip) -> dict:
    payload = {
        "id": trip.id,
        "created_at": trip.created_at.isoformat(timespec="seconds"),
        **trip.result,
    }
    # Trips saved before route instructions existed have legs without "steps": serve an empty list.
    route = payload["route"]
    payload["route"] = {**route, "legs": [{"steps": [], **leg} for leg in route["legs"]]}
    return payload


def trip_result(
    *,
    inputs: dict,
    plan: TripPlan,
    logs: Sequence[DailyLog],
    checks: Sequence[RuleCheck],
    route: Route,
    clock: HomeClock,
    locator: RouteLocator,
    place_at_mile: Callable[[float], str],
) -> dict:
    header = {
        **inputs["log_details"],
        "time_zone": f"{clock.iana} ({clock.abbreviation}, UTC{clock.utc_offset})",
    }
    labels = [
        inputs[f]["label"] for f in ("current_location", "pickup_location", "dropoff_location")
    ]
    return {
        "engine_version": ENGINE_VERSION,
        "inputs": inputs,
        "home_time_zone": {
            "iana": clock.iana,
            "abbreviation": clock.abbreviation,
            "utc_offset": clock.utc_offset,
        },
        "summary": _summary(plan, logs, clock),
        "route": {
            "geometry": {
                "type": "LineString",
                "coordinates": [list(c) for c in simplify(route.coordinates)],
            },
            "legs": [
                {
                    "from": labels[i],
                    "to": labels[i + 1],
                    "miles": round(leg.miles, 1),
                    "hours": round(leg.duration_min / 60, 2),
                    "steps": route_steps(leg.steps),
                }
                for i, leg in enumerate(route.legs)
            ],
        },
        "stops": _stops(plan, clock, locator, place_at_mile),
        "daily_logs": [_daily_log(log, clock, header) for log in logs],
        "compliance": [asdict(c) for c in checks],
        "assumptions": {"rules": describe(DEFAULT_RULES), "notes": list(ASSUMPTIONS)},
    }


def route_steps(steps: Sequence[RouteStep]) -> list[dict]:
    """A leg's directions, rounded for display. Consecutive steps on the same named road merge
    into the first one (the manoeuvre that joined it), which keeps long legs short; a turn onto a
    different road, or an unnamed one, is never merged away."""
    merged: list[RouteStep] = []
    for step in steps:
        last = merged[-1] if merged else None
        if last and step.road and step.road == last.road:
            merged[-1] = replace(
                last, miles=last.miles + step.miles, minutes=last.minutes + step.minutes
            )
        else:
            merged.append(step)
    return [
        {
            "instruction": step.instruction,
            "road": step.road,
            "miles": round(step.miles, 1),
            "minutes": round(step.minutes),
        }
        for step in merged
    ]


def _iso(moment: datetime) -> str:
    return moment.isoformat(timespec="seconds")


def _summary(plan: TripPlan, logs: Sequence[DailyLog], clock: HomeClock) -> dict:
    dropoff = plan.first(EventKind.DROPOFF)
    return {
        "total_miles": round(plan.total_miles, 1),
        "driving_hours": plan.minutes_in(DutyStatus.DRIVING) / 60,
        "on_duty_hours": plan.minutes_in(*WORK_STATUSES) / 60,
        "starts_at": _iso(clock.at(plan.start_min)),
        "arrives_at": _iso(clock.at(dropoff.end_min)),
        "days": len(logs),
        "stops": {
            name: sum(1 for e in plan.events if e.kind is kind)
            for name, kind in COUNTED_STOPS.items()
        },
    }


def _stops(
    plan: TripPlan, clock: HomeClock, locator: RouteLocator, place_at_mile: Callable[[float], str]
) -> list[dict]:
    def stop(id_: str, kind: str, status: DutyStatus, start: int, end: int, mile: float) -> dict:
        lat, lng = locator.at_mile(mile)
        return {
            "id": id_,
            "kind": kind,
            "status": status.value,
            "starts_at": _iso(clock.at(start)),
            "ends_at": _iso(clock.at(end)),
            "duration_minutes": end - start,
            "mile": round(mile, 1),
            "lat": round(lat, 5),
            "lng": round(lng, 5),
            "place": place_at_mile(mile),
        }

    first = next(e for e in plan.events if e.kind is not EventKind.OFF_BEFORE)
    out = [stop("s0", "start", first.status, plan.start_min, plan.start_min, 0.0)]
    for i, e in enumerate(plan.events, start=1):
        if e.kind in STOP_KINDS:
            out.append(stop(f"s{i}", e.kind.value, e.status, e.start_min, e.end_min, e.start_mi))
    return out


def _daily_log(log: DailyLog, clock: HomeClock, header: dict) -> dict:
    return {
        "date": clock.date_of_day(log.day_index).isoformat(),
        "day_number": log.day_index + 1,
        "from": log.from_place,
        "to": log.to_place,
        "miles_today": round(log.miles_today, 1),
        "segments": [
            {"status": s.status.value, "start_minute": s.start_minute, "end_minute": s.end_minute}
            for s in log.segments
        ],
        "totals": {status.value: round(hours, 2) for status, hours in log.totals.items()},
        "remarks": [
            {"minute": r.minute, "time": hhmm(r.minute), "place": r.place, "note": r.note}
            for r in log.remarks
        ],
        "brackets": [
            {"start_minute": b.start_minute, "end_minute": b.end_minute, "place": b.place}
            for b in log.brackets
        ],
        "header": header,
        "recap": {key: round(value, 2) for key, value in asdict(log.recap).items()},
    }

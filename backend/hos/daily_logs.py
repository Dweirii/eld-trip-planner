"""Cut a planned timeline into Driver's Daily Log sheets, one per calendar day (spec §5.6)."""

from collections.abc import Callable, Sequence
from dataclasses import dataclass

from .models import WORK_STATUSES, DutyEvent, DutyStatus, EventKind, TripPlan
from .rules import DEFAULT_RULES, HOSRules
from .timeutil import MINUTES_PER_DAY

# The provided paper-log template's 70-hour/8-day recap column:
#   A = on-duty hours over the last 7 days including today
#   B = hours available tomorrow = 70 − A
#   C = on-duty hours over the last 5 days including today
RECAP_A_DAYS = 7
RECAP_C_DAYS = 5

NOTES: dict[EventKind, str] = {
    EventKind.DRIVE: "Driving",
    EventKind.PICKUP: "Pickup — on duty",
    EventKind.DROPOFF: "Dropoff — on duty",
    EventKind.FUEL: "Fuel stop — on duty",
    EventKind.BREAK: "30-min break — off duty",
    EventKind.REST: "10-h rest — sleeper berth",
    EventKind.RESTART: "34-h restart — off duty",
    EventKind.OFF_AFTER: "Trip complete — off duty",
}

STATIONARY_KINDS = frozenset(
    {
        EventKind.PICKUP,
        EventKind.DROPOFF,
        EventKind.FUEL,
        EventKind.BREAK,
        EventKind.REST,
        EventKind.RESTART,
    }
)

PlaceNamer = Callable[[float], str]


@dataclass(frozen=True, slots=True)
class LogSegment:
    status: DutyStatus
    start_minute: int  # minutes after that day's midnight
    end_minute: int


@dataclass(frozen=True, slots=True)
class Remark:
    minute: int
    place: str
    note: str


@dataclass(frozen=True, slots=True)
class Bracket:
    start_minute: int
    end_minute: int
    place: str


@dataclass(frozen=True, slots=True)
class Recap:
    on_duty_today: float
    a_last_7_days: float
    b_available_tomorrow: float
    c_last_5_days: float


@dataclass(frozen=True, slots=True)
class DailyLog:
    day_index: int
    segments: tuple[LogSegment, ...]
    totals: dict[DutyStatus, float]  # hours per log line; always sums to 24
    miles_today: float
    from_place: str
    to_place: str
    remarks: tuple[Remark, ...]
    brackets: tuple[Bracket, ...]
    recap: Recap


def build_daily_logs(
    plan: TripPlan, place_at_mile: PlaceNamer, rules: HOSRules = DEFAULT_RULES
) -> list[DailyLog]:
    """One sheet per calendar day, from day 1 through the day the trip ends."""
    days = (plan.end_min - 1) // MINUTES_PER_DAY + 1
    return [_build_day(plan, day, place_at_mile, rules) for day in range(days)]


def mile_at(plan: TripPlan, minute: int) -> float:
    """Road-mile position of the truck at ``minute`` (interpolated while driving)."""
    for e in plan.events:
        if e.start_min <= minute < e.end_min:
            if e.kind is EventKind.DRIVE:
                return e.start_mi + e.miles * (minute - e.start_min) / e.duration_min
            return e.start_mi
    return plan.events[-1].end_mi


def rolling_hours(daily_hours: Sequence[float], day: int, window_days: int) -> float:
    """Sum of ``daily_hours`` over the ``window_days`` days ending on ``day`` (inclusive)."""
    return sum(daily_hours[max(0, day - window_days + 1) : day + 1])


def _build_day(plan: TripPlan, day: int, place_at_mile: PlaceNamer, rules: HOSRules) -> DailyLog:
    lo, hi = day * MINUTES_PER_DAY, (day + 1) * MINUTES_PER_DAY
    segments = _segments(plan.events, lo, hi)
    totals = {status: 0.0 for status in DutyStatus}
    for segment in segments:
        totals[segment.status] += (segment.end_minute - segment.start_minute) / 60
    return DailyLog(
        day_index=day,
        segments=segments,
        totals=totals,
        miles_today=_driven_miles(plan.events, lo, hi),
        from_place=place_at_mile(mile_at(plan, lo)),
        to_place=place_at_mile(mile_at(plan, min(hi, plan.end_min))),
        remarks=_remarks(plan, lo, hi, place_at_mile),
        brackets=_brackets(plan.events, lo, hi, place_at_mile),
        recap=_recap(plan, day, rules),
    )


def _overlap(event: DutyEvent, lo: int, hi: int) -> int:
    return max(0, min(event.end_min, hi) - max(event.start_min, lo))


def _segments(events: Sequence[DutyEvent], lo: int, hi: int) -> tuple[LogSegment, ...]:
    out: list[LogSegment] = []
    for e in events:
        start, end = max(e.start_min, lo), min(e.end_min, hi)
        if start >= end:
            continue
        if out and out[-1].status is e.status and out[-1].end_minute == start - lo:
            out[-1] = LogSegment(e.status, out[-1].start_minute, end - lo)
        else:
            out.append(LogSegment(e.status, start - lo, end - lo))
    return tuple(out)


def _driven_miles(events: Sequence[DutyEvent], lo: int, hi: int) -> float:
    return sum(
        e.miles * _overlap(e, lo, hi) / e.duration_min
        for e in events
        if e.kind is EventKind.DRIVE and e.duration_min
    )


def _remarks(plan: TripPlan, lo: int, hi: int, place_at_mile: PlaceNamer) -> tuple[Remark, ...]:
    out: list[Remark] = []
    previous: DutyEvent | None = None
    for e in plan.events:
        if e.kind in NOTES:
            if e.start_min < lo < e.end_min:
                out.append(
                    Remark(0, place_at_mile(mile_at(plan, lo)), f"{NOTES[e.kind]} (continued)")
                )
            elif lo <= e.start_min < hi and not (
                previous is not None and previous.kind is e.kind is EventKind.DRIVE
            ):
                out.append(Remark(e.start_min - lo, place_at_mile(e.start_mi), NOTES[e.kind]))
        previous = e
    return tuple(out)


def _brackets(
    events: Sequence[DutyEvent], lo: int, hi: int, place_at_mile: PlaceNamer
) -> tuple[Bracket, ...]:
    return tuple(
        Bracket(max(e.start_min, lo) - lo, min(e.end_min, hi) - lo, place_at_mile(e.start_mi))
        for e in events
        if e.kind in STATIONARY_KINDS and _overlap(e, lo, hi) > 0
    )


def _work_minutes(plan: TripPlan, lo: int, hi: int) -> int:
    if hi <= lo:
        return 0
    return sum(_overlap(e, lo, hi) for e in plan.events if e.status in WORK_STATUSES)


def _recap(plan: TripPlan, day: int, rules: HOSRules) -> Recap:
    """Recap per the template. Prior cycle hours count in every window until a 34-h restart."""
    day_end = (day + 1) * MINUTES_PER_DAY
    restarts = [
        e.end_min for e in plan.events if e.kind is EventKind.RESTART and e.end_min <= day_end
    ]
    counted_from = max(restarts, default=0)
    prior_hours = 0.0 if restarts else plan.cycle_used_min / 60
    daily = [
        _work_minutes(plan, max(k * MINUTES_PER_DAY, counted_from), (k + 1) * MINUTES_PER_DAY) / 60
        for k in range(day + 1)
    ]
    a = prior_hours + rolling_hours(daily, day, RECAP_A_DAYS)
    c = prior_hours + rolling_hours(daily, day, RECAP_C_DAYS)
    return Recap(
        on_duty_today=_work_minutes(plan, day * MINUTES_PER_DAY, day_end) / 60,
        a_last_7_days=a,
        b_available_tomorrow=max(0.0, rules.cycle_limit_min / 60 - a),
        c_last_5_days=c,
    )

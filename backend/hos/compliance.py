"""Independent verification of a plan against every rule (spec §5.7).

It re-derives shifts, breaks and cycle totals from the event list alone and
never calls planner code, so a planner bug cannot hide itself.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from .daily_logs import DailyLog
from .models import DutyEvent, DutyStatus, EventKind, TripPlan
from .rules import DEFAULT_RULES, HOSRules
from .timeutil import MINUTES_PER_DAY

REST_STATUSES = frozenset({DutyStatus.OFF_DUTY, DutyStatus.SLEEPER_BERTH})
_TOLERANCE = 1e-6


@dataclass(frozen=True, slots=True)
class RuleCheck:
    id: str
    title: str
    citation: str
    limit: float
    observed: float
    unit: str
    passed: bool


@dataclass(slots=True)
class _Shift:
    start_min: int
    driving_min: int = 0
    last_driving_end: int | None = None


def check(
    plan: TripPlan, logs: Sequence[DailyLog], rules: HOSRules = DEFAULT_RULES
) -> list[RuleCheck]:
    shifts = _shifts(plan.events, rules)
    return [
        _driving_limit(shifts, rules),
        _driving_window(shifts, rules),
        _break(plan.events, rules),
        _cycle(plan, rules),
        _fuel(plan, rules),
        _pickup_dropoff(plan, rules),
        _log_totals(logs),
    ]


def _shifts(events: Sequence[DutyEvent], rules: HOSRules) -> list[_Shift]:
    """A new shift starts at the first work after ≥10 consecutive hours off/sleeper."""
    shifts: list[_Shift] = []
    current: _Shift | None = None
    rest_run = 0
    for e in events:
        if e.status in REST_STATUSES:
            rest_run += e.duration_min
            if rest_run >= rules.daily_rest_min:
                current = None
            continue
        rest_run = 0
        if current is None:
            current = _Shift(start_min=e.start_min)
            shifts.append(current)
        if e.status is DutyStatus.DRIVING:
            current.driving_min += e.duration_min
            current.last_driving_end = e.end_min
    return shifts


def _hours_check(
    id_: str, title: str, citation: str, limit_min: float, observed_min: float
) -> RuleCheck:
    return RuleCheck(
        id=id_,
        title=title,
        citation=citation,
        limit=limit_min / 60,
        observed=observed_min / 60,
        unit="h",
        passed=observed_min <= limit_min + _TOLERANCE,
    )


def _driving_limit(shifts: Sequence[_Shift], rules: HOSRules) -> RuleCheck:
    observed = max((s.driving_min for s in shifts), default=0)
    return _hours_check(
        "driving_11h",
        "11-hour driving limit",
        "49 CFR 395.3(a)(3)",
        rules.max_driving_min,
        observed,
    )


def _driving_window(shifts: Sequence[_Shift], rules: HOSRules) -> RuleCheck:
    observed = max(
        (s.last_driving_end - s.start_min for s in shifts if s.last_driving_end is not None),
        default=0,
    )
    return _hours_check(
        "window_14h",
        "14-hour driving window",
        "49 CFR 395.3(a)(2)",
        rules.driving_window_min,
        observed,
    )


def _break(events: Sequence[DutyEvent], rules: HOSRules) -> RuleCheck:
    since_break = non_driving = observed = 0
    for e in events:
        if e.status is DutyStatus.DRIVING:
            non_driving = 0
            since_break += e.duration_min
            observed = max(observed, since_break)
        else:
            non_driving += e.duration_min
            if non_driving >= rules.break_min:
                since_break = 0
    return _hours_check(
        "break_30m",
        "30-minute break after 8 hours of driving",
        "49 CFR 395.3(a)(3)(ii)",
        rules.break_after_driving_min,
        observed,
    )


def _cycle(plan: TripPlan, rules: HOSRules) -> RuleCheck:
    cycle, off_run, peak = plan.cycle_used_min, 0, 0
    for e in plan.events:
        if e.status in REST_STATUSES:
            off_run += e.duration_min
            if off_run >= rules.restart_min:
                cycle = 0
            continue
        off_run = 0
        cycle += e.duration_min
        if e.status is DutyStatus.DRIVING:
            peak = max(peak, cycle)
    return _hours_check(
        "cycle_70h", "70-hour / 8-day limit", "49 CFR 395.3(b)(2)", rules.cycle_limit_min, peak
    )


def _fuel(plan: TripPlan, rules: HOSRules) -> RuleCheck:
    marks = [0.0, *(e.start_mi for e in plan.events if e.kind is EventKind.FUEL), plan.total_miles]
    observed = max(b - a for a, b in zip(marks, marks[1:], strict=False))
    return RuleCheck(
        id="fuel_1000mi",
        title="Fuel at least every 1,000 miles",
        citation="Assessment brief",
        limit=rules.fuel_interval_mi,
        observed=round(observed, 1),
        unit="mi",
        passed=observed <= rules.fuel_interval_mi + _TOLERANCE,
    )


def _pickup_dropoff(plan: TripPlan, rules: HOSRules) -> RuleCheck:
    stops = [e for e in plan.events if e.kind in (EventKind.PICKUP, EventKind.DROPOFF)]
    passed = (
        [e.kind for e in stops] == [EventKind.PICKUP, EventKind.DROPOFF]
        and stops[0].duration_min >= rules.pickup_min
        and stops[1].duration_min >= rules.dropoff_min
    )
    return RuleCheck(
        id="pickup_dropoff_1h",
        title="1 hour on duty at pickup and dropoff",
        citation="Assessment brief",
        limit=rules.pickup_min / 60,
        observed=min((e.duration_min for e in stops), default=0) / 60,
        unit="h",
        passed=passed,
    )


def _log_is_complete(log: DailyLog) -> bool:
    segments = log.segments
    contiguous = (
        bool(segments)
        and segments[0].start_minute == 0
        and segments[-1].end_minute == MINUTES_PER_DAY
        and all(
            a.end_minute == b.start_minute for a, b in zip(segments, segments[1:], strict=False)
        )
    )
    return contiguous and abs(sum(log.totals.values()) - 24) < _TOLERANCE


def _log_totals(logs: Sequence[DailyLog]) -> RuleCheck:
    bad = [log for log in logs if not _log_is_complete(log)]
    return RuleCheck(
        id="log_totals_24h",
        title="Every daily log totals 24 hours",
        citation="49 CFR 395.8",
        limit=24.0,
        observed=sum(bad[0].totals.values()) if bad else 24.0,
        unit="h",
        passed=bool(logs) and not bad,
    )

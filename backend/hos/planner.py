"""Simulate a trip under the HOS rules and emit a contiguous timeline of duty events.

The algorithm (spec §5.4): drive each leg in chunks. A chunk ends at the leg's end
or at the first limit reached. Before every chunk, required stops are inserted
in priority order: 34-h restart > fuel > 10-h rest > 30-min break.
"""

from collections.abc import Sequence

from .models import DutyEvent, EventKind, Leg, TripPlan
from .rules import DEFAULT_RULES, HOSRules
from .timeutil import MINUTES_PER_DAY, ceil_to, floor_to

_MILES_EPS = 1e-9


def plan_trip(
    legs: Sequence[Leg],
    cycle_used_hours: float,
    start_min: int,
    rules: HOSRules = DEFAULT_RULES,
) -> TripPlan:
    """Plan current → pickup → dropoff.

    Args:
        legs: exactly two legs (current → pickup, pickup → dropoff); a leg may be 0 miles.
        cycle_used_hours: on-duty hours already used in the 70-hour/8-day cycle.
        start_min: trip start as minutes after midnight of day 1, on the grid.
        rules: the limits to apply.
    """
    _validate(legs, cycle_used_hours, start_min, rules)
    cycle_used_min = round(cycle_used_hours * 60)
    planner = _Planner(rules, cycle_used_min)
    planner.run(legs, start_min)
    return TripPlan(
        events=tuple(planner.events),
        cycle_used_min=cycle_used_min,
        start_min=start_min,
        total_miles=sum(leg.miles for leg in legs),
    )


def _validate(
    legs: Sequence[Leg], cycle_used_hours: float, start_min: int, rules: HOSRules
) -> None:
    if len(legs) != 2:
        raise ValueError("plan_trip expects exactly two legs (to pickup, to dropoff)")
    if not 0 <= cycle_used_hours <= rules.cycle_limit_min / 60:
        raise ValueError("cycle_used_hours must be between 0 and the cycle limit")
    if not (0 <= start_min < MINUTES_PER_DAY and start_min % rules.quantum_min == 0):
        raise ValueError("start_min must be a grid minute within the first day")
    for leg in legs:
        if leg.miles < 0 or (leg.miles > 0 and leg.duration_min <= 0):
            raise ValueError("legs need non-negative miles and a positive duration when miles > 0")


class _Planner:
    """Mutable simulation state; used once per plan."""

    def __init__(self, rules: HOSRules, cycle_used_min: int) -> None:
        self.rules = rules
        self.events: list[DutyEvent] = []
        self.t = 0
        self.mile = 0.0
        self.shift_start: int | None = None  # first on-duty minute after the last reset
        self.shift_drive = 0
        self.drive_since_break = 0
        self.non_driving_run = 0
        self.cycle = cycle_used_min
        self.miles_since_fuel = 0.0  # full tank at the start

    def run(self, legs: Sequence[Leg], start_min: int) -> None:
        if start_min > 0:
            self._emit(EventKind.OFF_BEFORE, start_min)
        self._drive_leg(legs[0])
        self._work(EventKind.PICKUP, self.rules.pickup_min)
        self._drive_leg(legs[1])
        self._work(EventKind.DROPOFF, self.rules.dropoff_min)
        end_of_day = -(-self.t // MINUTES_PER_DAY) * MINUTES_PER_DAY
        if end_of_day > self.t:
            self._emit(EventKind.OFF_AFTER, end_of_day - self.t)

    # ── driving ─────────────────────────────────────────────────────────
    def _drive_leg(self, leg: Leg) -> None:
        remaining = leg.miles
        if remaining <= _MILES_EPS:
            return
        speed = leg.miles / leg.duration_min  # miles per minute
        while remaining > _MILES_EPS:
            self._take_required_stops(speed)
            to_finish = ceil_to(remaining / speed, self.rules.quantum_min)
            minutes = min(to_finish, *self._driving_bounds(speed).values())
            miles = remaining if minutes == to_finish else minutes * speed
            self._drive(minutes, miles)
            remaining -= miles

    def _driving_bounds(self, speed: float) -> dict[str, int]:
        """Minutes of driving each rule still allows (≤ 0 means a stop is due)."""
        r = self.rules
        if self.shift_start is None:
            window_left = r.driving_window_min
        else:
            window_left = self.shift_start + r.driving_window_min - self.t
        return {
            "shift": r.max_driving_min - self.shift_drive,
            "window": window_left,
            "break": r.break_after_driving_min - self.drive_since_break,
            "cycle": floor_to(r.cycle_limit_min - self.cycle, r.quantum_min),
            "fuel": floor_to((r.fuel_interval_mi - self.miles_since_fuel) / speed, r.quantum_min),
        }

    def _take_required_stops(self, speed: float) -> None:
        r = self.rules
        while True:
            bounds = self._driving_bounds(speed)
            if bounds["cycle"] <= 0:
                self._off(EventKind.RESTART, r.restart_min)
            elif bounds["fuel"] <= 0:
                self._work(EventKind.FUEL, r.fuel_min)
                self.miles_since_fuel = 0.0
            elif bounds["shift"] <= 0 or bounds["window"] <= 0:
                self._off(EventKind.REST, r.daily_rest_min)
            elif bounds["break"] <= 0:
                self._off(EventKind.BREAK, r.break_min)
            else:
                return

    def _drive(self, minutes: int, miles: float) -> None:
        self._begin_shift()
        self._emit(EventKind.DRIVE, minutes, miles)
        self.shift_drive += minutes
        self.drive_since_break += minutes
        self.cycle += minutes
        self.miles_since_fuel += miles
        self.non_driving_run = 0

    # ── not driving ─────────────────────────────────────────────────────
    def _work(self, kind: EventKind, minutes: int) -> None:
        """On duty, not driving: pickup, dropoff or fueling."""
        self._begin_shift()
        self._emit(kind, minutes)
        self.cycle += minutes
        self._not_driving(minutes)

    def _off(self, kind: EventKind, minutes: int) -> None:
        """Off duty or sleeper berth: break, 10-h rest or 34-h restart."""
        self._emit(kind, minutes)
        if kind in (EventKind.REST, EventKind.RESTART):
            self.shift_start = None
            self.shift_drive = 0
        if kind is EventKind.RESTART:
            self.cycle = 0
        self._not_driving(minutes)

    def _not_driving(self, minutes: int) -> None:
        self.non_driving_run += minutes
        if self.non_driving_run >= self.rules.break_min:
            self.drive_since_break = 0

    def _begin_shift(self) -> None:
        if self.shift_start is None:
            self.shift_start = self.t

    def _emit(self, kind: EventKind, minutes: int, miles: float = 0.0) -> None:
        self.events.append(DutyEvent(kind, self.t, self.t + minutes, self.mile, self.mile + miles))
        self.t += minutes
        self.mile += miles

"""Value types shared by the planner, the daily-log builder and the compliance checker."""

from dataclasses import dataclass
from enum import StrEnum


class DutyStatus(StrEnum):
    """The four lines of the log grid."""

    OFF_DUTY = "off_duty"
    SLEEPER_BERTH = "sleeper_berth"
    DRIVING = "driving"
    ON_DUTY = "on_duty"  # on duty, not driving


class EventKind(StrEnum):
    """Why the driver is in a status."""

    OFF_BEFORE = "off_before"  # midnight of day 1 → trip start
    DRIVE = "drive"
    PICKUP = "pickup"
    DROPOFF = "dropoff"
    FUEL = "fuel"
    BREAK = "break"
    REST = "rest"
    RESTART = "restart"
    OFF_AFTER = "off_after"  # dropoff → end of that day


KIND_STATUS: dict[EventKind, DutyStatus] = {
    EventKind.OFF_BEFORE: DutyStatus.OFF_DUTY,
    EventKind.DRIVE: DutyStatus.DRIVING,
    EventKind.PICKUP: DutyStatus.ON_DUTY,
    EventKind.DROPOFF: DutyStatus.ON_DUTY,
    EventKind.FUEL: DutyStatus.ON_DUTY,
    EventKind.BREAK: DutyStatus.OFF_DUTY,
    EventKind.REST: DutyStatus.SLEEPER_BERTH,
    EventKind.RESTART: DutyStatus.OFF_DUTY,
    EventKind.OFF_AFTER: DutyStatus.OFF_DUTY,
}

WORK_STATUSES = frozenset({DutyStatus.DRIVING, DutyStatus.ON_DUTY})


@dataclass(frozen=True, slots=True)
class Leg:
    """One routed leg: road miles and the drive time the routing profile expects."""

    miles: float
    duration_min: float


@dataclass(frozen=True, slots=True)
class DutyEvent:
    """A contiguous period in one duty status.

    Minutes count from midnight of trip day 1; miles are road miles from the trip start.
    """

    kind: EventKind
    start_min: int
    end_min: int
    start_mi: float
    end_mi: float

    @property
    def status(self) -> DutyStatus:
        return KIND_STATUS[self.kind]

    @property
    def duration_min(self) -> int:
        return self.end_min - self.start_min

    @property
    def miles(self) -> float:
        return self.end_mi - self.start_mi


@dataclass(frozen=True, slots=True)
class TripPlan:
    """The planner's output: an ordered, contiguous timeline starting at minute 0."""

    events: tuple[DutyEvent, ...]
    cycle_used_min: int
    start_min: int
    total_miles: float

    @property
    def end_min(self) -> int:
        return self.events[-1].end_min

    def first(self, kind: EventKind) -> DutyEvent | None:
        return next((e for e in self.events if e.kind is kind), None)

    def minutes_in(self, *statuses: DutyStatus) -> int:
        return sum(e.duration_min for e in self.events if e.status in statuses)

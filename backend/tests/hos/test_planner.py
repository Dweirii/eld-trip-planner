import pytest

from hos.models import EventKind, Leg
from hos.planner import plan_trip
from hos.rules import HOSRules

K = EventKind


def leg(miles: float, mph: float) -> Leg:
    return Leg(miles=miles, duration_min=miles / mph * 60 if miles else 0.0)


def hm(text: str) -> int:
    hours, minutes = text.split(":")
    return int(hours) * 60 + int(minutes)


def timeline(plan):
    return [(e.kind, e.start_min, e.end_min) for e in plan.events]


def test_spec_worked_example_break_then_eleven_hours_then_rest():
    # Spec §5.4: start 08:00, long drive, cycle 0.
    plan = plan_trip([leg(600, 50), leg(50, 50)], cycle_used_hours=0, start_min=hm("08:00"))

    assert timeline(plan) == [
        (K.OFF_BEFORE, 0, hm("08:00")),
        (K.DRIVE, hm("08:00"), hm("16:00")),
        (K.BREAK, hm("16:00"), hm("16:30")),
        (K.DRIVE, hm("16:30"), hm("19:30")),
        (K.REST, hm("19:30"), 1440 + hm("05:30")),
        (K.DRIVE, 1440 + hm("05:30"), 1440 + hm("06:30")),
        (K.PICKUP, 1440 + hm("06:30"), 1440 + hm("07:30")),
        (K.DRIVE, 1440 + hm("07:30"), 1440 + hm("08:30")),
        (K.DROPOFF, 1440 + hm("08:30"), 1440 + hm("09:30")),
        (K.OFF_AFTER, 1440 + hm("09:30"), 2880),
    ]
    assert plan.events[1].miles == pytest.approx(400)


def test_fmcsa_page_7_eleven_hours_of_driving_end_at_1830():
    # FMCSA guide p.7: on duty 06:00, driving from 07:00; 11 h of driving reached at 18:30.
    plan = plan_trip([leg(0, 50), leg(700, 50)], cycle_used_hours=0, start_min=hm("06:00"))

    first_rest = plan.first(K.REST)
    drives_before_rest = [
        e for e in plan.events if e.kind is K.DRIVE and e.end_min <= first_rest.start_min
    ]
    assert plan.events[1].kind is K.PICKUP and plan.events[1].start_min == hm("06:00")
    assert drives_before_rest[0].start_min == hm("07:00")
    assert sum(e.duration_min for e in drives_before_rest) == 660
    assert first_rest.start_min == hm("18:30")


def test_driving_window_closes_driving_even_with_hours_left():
    # FMCSA guide p.6 principle, with a 10-hour window so the window binds before 11 h.
    rules = HOSRules(driving_window_min=600)
    plan = plan_trip([leg(0, 50), leg(700, 50)], 0, hm("06:00"), rules)

    first_rest = plan.first(K.REST)
    assert first_rest.start_min == hm("16:00")
    assert all(
        e.end_min <= hm("16:00")
        for e in plan.events
        if e.kind is K.DRIVE and e.start_min < hm("16:00")
    )


def test_pickup_resets_the_break_clock():
    # Pickup is 60 consecutive non-driving minutes, so driving can continue 8 h after it.
    plan = plan_trip([leg(300, 50), leg(500, 50)], 0, hm("06:00"))

    kinds = [e.kind for e in plan.events]
    assert kinds[:4] == [K.OFF_BEFORE, K.DRIVE, K.PICKUP, K.DRIVE]
    assert plan.events[3].duration_min == 300  # 11 h − 6 h already driven


def test_cycle_restart_mid_trip():
    plan = plan_trip([leg(0, 50), leg(600, 50)], cycle_used_hours=65, start_min=hm("08:00"))

    assert timeline(plan) == [
        (K.OFF_BEFORE, 0, 480),
        (K.PICKUP, 480, 540),
        (K.DRIVE, 540, 780),  # 66 h + 4 h = 70 h
        (K.RESTART, 780, 2820),
        (K.DRIVE, 2820, 3300),
        (K.DROPOFF, 3300, 3360),
        (K.OFF_AFTER, 3360, 4320),
    ]


def test_full_cycle_restarts_before_first_drive_and_ends_at_midnight():
    plan = plan_trip([leg(100, 50), leg(100, 50)], cycle_used_hours=70, start_min=hm("08:00"))

    assert timeline(plan) == [
        (K.OFF_BEFORE, 0, 480),
        (K.RESTART, 480, 2520),
        (K.DRIVE, 2520, 2640),
        (K.PICKUP, 2640, 2700),
        (K.DRIVE, 2700, 2820),
        (K.DROPOFF, 2820, 2880),
    ]  # ends exactly at midnight: no OFF_AFTER


def test_fuel_at_least_every_1000_miles():
    plan = plan_trip([leg(0, 60), leg(2400, 60)], cycle_used_hours=0, start_min=0)

    fuel_marks = [e.start_mi for e in plan.events if e.kind is K.FUEL]
    marks = [0.0, *fuel_marks, plan.total_miles]
    assert len(fuel_marks) == 2
    assert fuel_marks == pytest.approx([990, 1980])
    assert max(b - a for a, b in zip(marks, marks[1:], strict=False)) <= 1000
    assert all(e.duration_min == 30 for e in plan.events if e.kind is K.FUEL)


def test_zero_mile_first_leg_starts_with_pickup_at_trip_start():
    plan = plan_trip([leg(0, 50), leg(100, 50)], 0, hm("09:00"))

    assert plan.events[1].kind is K.PICKUP
    assert plan.events[1].start_min == hm("09:00")
    assert plan.events[1].start_mi == 0
    assert not any(e.kind is K.DRIVE and e.duration_min == 0 for e in plan.events)


def test_pickup_and_dropoff_are_one_hour_on_duty_at_the_right_miles():
    plan = plan_trip([leg(120, 60), leg(180, 60)], 0, hm("07:00"))

    pickup, dropoff = plan.first(K.PICKUP), plan.first(K.DROPOFF)
    assert pickup.duration_min == dropoff.duration_min == 60
    assert pickup.start_mi == pytest.approx(120)
    assert dropoff.start_mi == pytest.approx(300)


def test_timeline_is_contiguous_on_the_grid_and_miles_add_up():
    plan = plan_trip(
        [leg(437.3, 53.1), leg(1712.9, 57.4)], cycle_used_hours=41.25, start_min=hm("13:45")
    )

    assert plan.events[0].start_min == 0
    assert all(a.end_min == b.start_min for a, b in zip(plan.events, plan.events[1:], strict=False))
    assert all(e.start_min % 15 == 0 and e.end_min % 15 == 0 for e in plan.events)
    assert plan.end_min % 1440 == 0
    assert sum(e.miles for e in plan.events if e.kind is K.DRIVE) == pytest.approx(437.3 + 1712.9)


@pytest.mark.parametrize(
    ("legs", "cycle", "start"),
    [
        ([leg(10, 50)], 0, 0),
        ([leg(10, 50), leg(10, 50)], 70.5, 0),
        ([leg(10, 50), leg(10, 50)], -1, 0),
        ([leg(10, 50), leg(10, 50)], 0, 7),
        ([leg(10, 50), leg(10, 50)], 0, 1440),
        ([Leg(10, 0), leg(10, 50)], 0, 0),
    ],
)
def test_invalid_inputs_are_rejected(legs, cycle, start):
    with pytest.raises(ValueError):
        plan_trip(legs, cycle, start)

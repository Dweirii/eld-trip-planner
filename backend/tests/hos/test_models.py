from hos.models import DutyEvent, DutyStatus, EventKind, TripPlan
from hos.rules import ASSUMPTIONS, DEFAULT_RULES, describe


def test_each_event_kind_maps_to_a_log_line():
    assert DutyEvent(EventKind.DRIVE, 0, 60, 0, 50).status is DutyStatus.DRIVING
    assert DutyEvent(EventKind.PICKUP, 0, 60, 0, 0).status is DutyStatus.ON_DUTY
    assert DutyEvent(EventKind.FUEL, 0, 30, 0, 0).status is DutyStatus.ON_DUTY
    assert DutyEvent(EventKind.REST, 0, 600, 0, 0).status is DutyStatus.SLEEPER_BERTH
    assert DutyEvent(EventKind.BREAK, 0, 30, 0, 0).status is DutyStatus.OFF_DUTY
    assert DutyEvent(EventKind.RESTART, 0, 2040, 0, 0).status is DutyStatus.OFF_DUTY


def test_event_duration_and_miles():
    event = DutyEvent(EventKind.DRIVE, 480, 960, 100.0, 500.0)
    assert event.duration_min == 480
    assert event.miles == 400.0


def test_trip_plan_helpers():
    plan = TripPlan(
        events=(
            DutyEvent(EventKind.DRIVE, 0, 60, 0, 50),
            DutyEvent(EventKind.PICKUP, 60, 120, 50, 50),
            DutyEvent(EventKind.OFF_AFTER, 120, 1440, 50, 50),
        ),
        cycle_used_min=0,
        start_min=0,
        total_miles=50,
    )
    assert plan.end_min == 1440
    assert plan.first(EventKind.PICKUP).start_min == 60
    assert plan.first(EventKind.FUEL) is None
    assert plan.minutes_in(DutyStatus.DRIVING, DutyStatus.ON_DUTY) == 120


def test_default_rules_match_the_regulations():
    assert DEFAULT_RULES.max_driving_min == 660
    assert DEFAULT_RULES.driving_window_min == 840
    assert DEFAULT_RULES.break_after_driving_min == 480
    assert DEFAULT_RULES.cycle_limit_min == 4200
    assert DEFAULT_RULES.restart_min == 2040
    assert DEFAULT_RULES.fuel_interval_mi == 1000


def test_describe_lists_every_rule_with_a_source():
    rows = describe(DEFAULT_RULES)
    assert {
        "label": "Driving limit per shift",
        "value": "11 h",
        "source": "49 CFR 395.3(a)(3)",
    } in rows
    assert all(row["source"] for row in rows)


def test_fueling_row_names_the_assumed_duration():
    fueling = next(row for row in describe(DEFAULT_RULES) if row["label"] == "Fueling")
    assert fueling["source"] == "Assessment brief (interval); duration assumed"


def test_assumptions_cover_on_duty_after_limits_and_header_defaults():
    assert (
        "Only driving is barred once the 11-hour, 14-hour or 70-hour limit is reached; on-duty "
        "work such as fueling, pickup or dropoff may continue, so a daily recap can show more "
        "than 70 on-duty hours."
    ) in ASSUMPTIONS
    assert (
        "Log-sheet header details (driver, carrier, truck/trailer, shipping document) are "
        "optional inputs with sensible defaults."
    ) in ASSUMPTIONS
    assert ASSUMPTIONS[-1].startswith("Log-sheet header details")

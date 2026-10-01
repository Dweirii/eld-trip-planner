from hos.compliance import check
from hos.daily_logs import DailyLog, LogSegment, Recap, build_daily_logs
from hos.models import DutyEvent, DutyStatus, EventKind, Leg, TripPlan
from hos.planner import plan_trip

K = EventKind


def ev(kind, start, end, start_mi=0.0, end_mi=None):
    return DutyEvent(kind, start, end, start_mi, start_mi if end_mi is None else end_mi)


def hand_plan(*events, cycle_used_min=0):
    return TripPlan(
        events=events, cycle_used_min=cycle_used_min, start_min=0, total_miles=events[-1].end_mi
    )


def results(plan):
    return {c.id: c for c in check(plan, build_daily_logs(plan, lambda mile: "X"))}


def test_a_planned_trip_passes_every_rule():
    plan = plan_trip([Leg(600, 720), Leg(1900, 2100)], cycle_used_hours=30, start_min=480)
    checks = check(plan, build_daily_logs(plan, lambda mile: "X"))

    assert [c.id for c in checks] == [
        "driving_11h",
        "window_14h",
        "break_30m",
        "cycle_70h",
        "fuel_1000mi",
        "pickup_dropoff_1h",
        "log_totals_24h",
    ]
    assert all(c.passed for c in checks), [c for c in checks if not c.passed]


def test_detects_more_than_11_hours_of_driving():
    plan = hand_plan(
        ev(K.PICKUP, 0, 60),
        ev(K.DRIVE, 60, 540, 0, 400),
        ev(K.BREAK, 540, 570, 400),
        ev(K.DRIVE, 570, 795, 400, 590),
        ev(K.DROPOFF, 795, 855, 590),
        ev(K.OFF_AFTER, 855, 1440, 590),
    )
    result = results(plan)["driving_11h"]
    assert (result.observed, result.passed) == (11.75, False)


def test_fmcsa_page_6_no_driving_after_the_14th_hour():
    # On duty 06:00 → driving after 20:00 violates the window even with <11 h driven.
    plan = hand_plan(
        ev(K.OFF_BEFORE, 0, 360),
        ev(K.PICKUP, 360, 420),
        ev(K.DRIVE, 420, 900, 0, 400),
        ev(K.BREAK, 900, 1080, 400),
        ev(K.DRIVE, 1080, 1230, 400, 525),
        ev(K.DROPOFF, 1230, 1290, 525),
        ev(K.OFF_AFTER, 1290, 1440, 525),
    )
    result = results(plan)
    assert (result["window_14h"].observed, result["window_14h"].passed) == (14.5, False)
    assert result["driving_11h"].passed


def test_detects_driving_more_than_8_hours_without_a_break():
    plan = hand_plan(
        ev(K.PICKUP, 0, 60),
        ev(K.DRIVE, 60, 555, 0, 410),
        ev(K.DROPOFF, 555, 615, 410),
        ev(K.OFF_AFTER, 615, 1440, 410),
    )
    result = results(plan)["break_30m"]
    assert (result.observed, result.passed) == (8.25, False)


def test_detects_driving_past_70_hours():
    plan = hand_plan(
        ev(K.PICKUP, 0, 60),
        ev(K.DRIVE, 60, 120, 0, 50),
        ev(K.DROPOFF, 120, 180, 50),
        ev(K.OFF_AFTER, 180, 1440, 50),
        cycle_used_min=69 * 60,
    )
    result = results(plan)["cycle_70h"]
    assert (result.observed, result.passed) == (71.0, False)


def test_a_34_hour_restart_resets_the_cycle():
    plan = hand_plan(
        ev(K.RESTART, 0, 2040),
        ev(K.DRIVE, 2040, 2100, 0, 50),
        ev(K.PICKUP, 2100, 2160, 50),
        ev(K.DRIVE, 2160, 2220, 50, 100),
        ev(K.DROPOFF, 2220, 2280, 100),
        ev(K.OFF_AFTER, 2280, 2880, 100),
        cycle_used_min=70 * 60,
    )
    assert results(plan)["cycle_70h"].passed


def test_detects_a_fuel_gap_over_1000_miles():
    plan = hand_plan(
        ev(K.PICKUP, 0, 60),
        ev(K.DRIVE, 60, 540, 0, 1050),
        ev(K.DROPOFF, 540, 600, 1050),
        ev(K.OFF_AFTER, 600, 1440, 1050),
    )
    result = results(plan)["fuel_1000mi"]
    assert (result.observed, result.passed) == (1050, False)


def test_detects_a_log_that_does_not_total_24_hours():
    plan = plan_trip([Leg(50, 60), Leg(50, 60)], 0, 480)
    bad = DailyLog(
        day_index=0,
        segments=(LogSegment(DutyStatus.OFF_DUTY, 0, 1425),),
        totals={s: 0.0 for s in DutyStatus} | {DutyStatus.OFF_DUTY: 23.75},
        miles_today=0,
        from_place="X",
        to_place="X",
        remarks=(),
        brackets=(),
        recap=Recap(0, 0, 70, 0),
    )
    result = {c.id: c for c in check(plan, [bad])}["log_totals_24h"]
    assert (result.observed, result.passed) == (23.75, False)

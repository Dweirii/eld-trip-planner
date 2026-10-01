import pytest

from hos.daily_logs import Bracket, LogSegment, Remark, build_daily_logs, rolling_hours
from hos.models import DutyStatus, Leg
from hos.planner import plan_trip

S = DutyStatus


def leg(miles: float, mph: float) -> Leg:
    return Leg(miles=miles, duration_min=miles / mph * 60 if miles else 0.0)


def mp(mile: float) -> str:
    return f"MP{mile:.0f}"


@pytest.fixture
def worked_example_logs():
    # Same trip as the planner's worked example, with 10 h of cycle already used.
    plan = plan_trip([leg(600, 50), leg(50, 50)], cycle_used_hours=10, start_min=480)
    return build_daily_logs(plan, mp)


def test_one_sheet_per_calendar_day(worked_example_logs):
    assert [log.day_index for log in worked_example_logs] == [0, 1]


def test_day_one_grid_segments_and_totals(worked_example_logs):
    day = worked_example_logs[0]
    assert day.segments == (
        LogSegment(S.OFF_DUTY, 0, 480),
        LogSegment(S.DRIVING, 480, 960),
        LogSegment(S.OFF_DUTY, 960, 990),
        LogSegment(S.DRIVING, 990, 1170),
        LogSegment(S.SLEEPER_BERTH, 1170, 1440),
    )
    assert day.totals == {S.OFF_DUTY: 8.5, S.SLEEPER_BERTH: 4.5, S.DRIVING: 11.0, S.ON_DUTY: 0.0}
    assert sum(day.totals.values()) == 24
    assert day.miles_today == pytest.approx(550)
    assert (day.from_place, day.to_place) == ("MP0", "MP550")


def test_day_two_totals_and_places(worked_example_logs):
    day = worked_example_logs[1]
    assert day.totals == {S.OFF_DUTY: 14.5, S.SLEEPER_BERTH: 5.5, S.DRIVING: 2.0, S.ON_DUTY: 2.0}
    assert day.miles_today == pytest.approx(100)
    assert (day.from_place, day.to_place) == ("MP550", "MP650")


def test_remarks_mark_every_duty_change_with_a_place(worked_example_logs):
    assert worked_example_logs[0].remarks == (
        Remark(480, "MP0", "Driving"),
        Remark(960, "MP400", "30-min break — off duty"),
        Remark(990, "MP400", "Driving"),
        Remark(1170, "MP550", "10-h rest — sleeper berth"),
    )
    assert worked_example_logs[1].remarks == (
        Remark(0, "MP550", "10-h rest — sleeper berth (continued)"),
        Remark(330, "MP550", "Driving"),
        Remark(390, "MP600", "Pickup — on duty"),
        Remark(450, "MP600", "Driving"),
        Remark(510, "MP650", "Dropoff — on duty"),
        Remark(570, "MP650", "Trip complete — off duty"),
    )


def test_brackets_cover_each_stationary_stop_clipped_to_the_day(worked_example_logs):
    assert worked_example_logs[0].brackets == (
        Bracket(960, 990, "MP400"),
        Bracket(1170, 1440, "MP550"),
    )
    assert worked_example_logs[1].brackets[0] == Bracket(0, 330, "MP550")


def test_recap_counts_prior_cycle_hours(worked_example_logs):
    day1, day2 = (log.recap for log in worked_example_logs)
    assert (
        day1.on_duty_today,
        day1.a_last_7_days,
        day1.b_available_tomorrow,
        day1.c_last_5_days,
    ) == (
        11.0,
        21.0,
        49.0,
        21.0,
    )
    assert (
        day2.on_duty_today,
        day2.a_last_7_days,
        day2.b_available_tomorrow,
        day2.c_last_5_days,
    ) == (
        4.0,
        25.0,
        45.0,
        25.0,
    )


def test_drive_across_midnight_splits_miles_by_time():
    plan = plan_trip([leg(300, 60), leg(60, 60)], cycle_used_hours=0, start_min=1200)  # 20:00
    logs = build_daily_logs(plan, mp)

    assert [round(log.miles_today, 6) for log in logs] == [240, 120]
    assert logs[1].remarks[0] == Remark(0, "MP240", "Driving (continued)")


def test_dropoff_ending_exactly_at_midnight_has_no_empty_extra_day():
    plan = plan_trip([leg(100, 50), leg(100, 50)], cycle_used_hours=70, start_min=480)
    logs = build_daily_logs(plan, mp)

    assert len(logs) == 2
    assert logs[-1].segments[-1] == LogSegment(S.ON_DUTY, 1380, 1440)
    assert all(sum(log.totals.values()) == 24 for log in logs)


def test_recap_after_a_restart_drops_prior_hours():
    plan = plan_trip([leg(100, 50), leg(100, 50)], cycle_used_hours=70, start_min=480)
    day1, day2 = (log.recap for log in build_daily_logs(plan, mp))

    assert (day1.a_last_7_days, day1.b_available_tomorrow) == (70.0, 0.0)  # restart not finished
    assert (day2.on_duty_today, day2.a_last_7_days, day2.b_available_tomorrow) == (6.0, 6.0, 64.0)


def test_rolling_window_matches_fmcsa_page_11_table():
    daily = [0, 10, 8.5, 12.5, 9, 10, 12, 5, 6, 0]  # Sunday … Tuesday
    assert rolling_hours(daily, day=7, window_days=8) == 67
    assert rolling_hours(daily, day=8, window_days=8) == 73
    assert rolling_hours(daily, day=9, window_days=8) == 63

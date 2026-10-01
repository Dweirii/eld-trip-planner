from datetime import UTC, date, datetime

from trips.clock import HomeClock


def test_explicit_start_is_snapped_up_to_the_quarter_hour():
    clock = HomeClock.create(
        "America/Chicago", datetime(2026, 10, 1, 6, 5), now_utc=datetime(2026, 1, 1, tzinfo=UTC)
    )
    assert clock.start_minute == 6 * 60 + 15
    assert clock.day0 == date(2026, 10, 1)
    assert (clock.abbreviation, clock.utc_offset) == ("CDT", "-05:00")
    assert clock.at(clock.start_minute).isoformat() == "2026-10-01T06:15:00-05:00"


def test_start_just_before_midnight_rolls_to_the_next_day():
    clock = HomeClock.create(
        "America/Chicago", datetime(2026, 10, 1, 23, 50), now_utc=datetime(2026, 1, 1, tzinfo=UTC)
    )
    assert clock.day0 == date(2026, 10, 2)
    assert clock.start_minute == 0
    assert clock.start_local == "2026-10-02T00:00"


def test_default_start_is_now_in_the_home_time_zone():
    now = datetime(2026, 12, 15, 14, 7, 30, tzinfo=UTC)  # 08:07:30 CST
    clock = HomeClock.create("America/Chicago", None, now_utc=now)
    assert clock.start_local == "2026-12-15T08:15"
    assert (clock.abbreviation, clock.utc_offset) == ("CST", "-06:00")


def test_offset_stays_fixed_for_the_whole_trip_even_across_dst():
    clock = HomeClock.create(
        "America/New_York", datetime(2026, 10, 31, 8, 0), now_utc=datetime(2026, 1, 1, tzinfo=UTC)
    )
    assert clock.at(3 * 1440).isoformat() == "2026-11-03T00:00:00-04:00"
    assert clock.date_of_day(3) == date(2026, 11, 3)

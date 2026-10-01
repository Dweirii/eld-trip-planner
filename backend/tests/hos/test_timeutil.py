from hos.timeutil import MINUTES_PER_DAY, ceil_to, floor_to, hhmm


def test_ceil_to_rounds_up_to_the_quarter_hour():
    assert ceil_to(0) == 0
    assert ceil_to(1) == 15
    assert ceil_to(15) == 15
    assert ceil_to(15.2) == 30


def test_ceil_to_ignores_floating_point_noise():
    assert ceil_to(285.0000000001) == 285
    assert ceil_to(284.9999999999) == 285


def test_floor_to_rounds_down_and_handles_negatives():
    assert floor_to(29.9) == 15
    assert floor_to(30) == 30
    assert floor_to(29.9999999999) == 30
    assert floor_to(-5) == -15


def test_hhmm_formats_minutes_of_day():
    assert hhmm(0) == "00:00"
    assert hhmm(645) == "10:45"
    assert hhmm(MINUTES_PER_DAY) == "24:00"

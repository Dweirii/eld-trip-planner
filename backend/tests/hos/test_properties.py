"""Property tests: hundreds of random trips must always satisfy every invariant."""

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from hos.compliance import check
from hos.daily_logs import build_daily_logs
from hos.models import EventKind, Leg
from hos.planner import plan_trip

miles = st.one_of(st.just(0.0), st.floats(min_value=1, max_value=1500, allow_nan=False))
long_miles = st.floats(min_value=1, max_value=2500, allow_nan=False)
mph = st.floats(min_value=35, max_value=65, allow_nan=False)
cycle = st.integers(min_value=0, max_value=280).map(lambda quarters: quarters / 4)  # 0–70 h
start = st.integers(min_value=0, max_value=95).map(lambda q: q * 15)


@settings(max_examples=250, deadline=None)
@given(leg1=miles, leg2=long_miles, mph1=mph, mph2=mph, cycle_used=cycle, start_min=start)
def test_every_random_trip_is_compliant_and_well_formed(
    leg1, leg2, mph1, mph2, cycle_used, start_min
):
    legs = [Leg(leg1, leg1 / mph1 * 60 if leg1 else 0.0), Leg(leg2, leg2 / mph2 * 60)]
    plan = plan_trip(legs, cycle_used, start_min)
    logs = build_daily_logs(plan, lambda mile: "X")

    failed = [c for c in check(plan, logs) if not c.passed]
    assert not failed, failed
    assert plan.events[0].start_min == 0
    assert all(a.end_min == b.start_min for a, b in zip(plan.events, plan.events[1:], strict=False))
    assert all(e.duration_min > 0 for e in plan.events)
    assert all(e.start_min % 15 == 0 for e in plan.events)
    assert all(sum(log.totals.values()) == pytest.approx(24) for log in logs)
    driven = sum(e.miles for e in plan.events if e.kind is EventKind.DRIVE)
    assert driven == pytest.approx(leg1 + leg2)
    assert sum(log.miles_today for log in logs) == pytest.approx(leg1 + leg2)

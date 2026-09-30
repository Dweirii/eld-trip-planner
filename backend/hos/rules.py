"""Hours-of-Service limits and planning assumptions (49 CFR Part 395, property carriers)."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class HOSRules:
    """Every limit the planner and the compliance checker apply.

    Durations are whole minutes; distances are statute miles.
    """

    max_driving_min: int = 11 * 60  # 49 CFR 395.3(a)(3)
    driving_window_min: int = 14 * 60  # 49 CFR 395.3(a)(2)
    break_after_driving_min: int = 8 * 60  # 49 CFR 395.3(a)(3)(ii)
    break_min: int = 30  # 49 CFR 395.3(a)(3)(ii)
    daily_rest_min: int = 10 * 60  # 49 CFR 395.3(a)(1)
    cycle_limit_min: int = 70 * 60  # 49 CFR 395.3(b)(2)
    cycle_days: int = 8  # 49 CFR 395.3(b)(2)
    restart_min: int = 34 * 60  # 49 CFR 395.3(c)
    fuel_interval_mi: float = 1000.0  # assessment brief
    fuel_min: int = 30  # assumption: a typical fuel stop
    pickup_min: int = 60  # assessment brief
    dropoff_min: int = 60  # assessment brief
    quantum_min: int = 15  # paper-log grid resolution


DEFAULT_RULES = HOSRules()

ASSUMPTIONS: tuple[str, ...] = (
    "Property-carrying driver on the 70-hour/8-day schedule; no adverse driving conditions.",
    "Trip sequence: drive to pickup, 1 hour on duty, drive to dropoff, 1 hour on duty.",
    "The driver starts with full 11-hour and 14-hour allowances (at least 10 hours off before the trip).",
    "Cycle hours already used count toward 70 hours for the whole trip and never roll off; "
    "a 34-hour restart resets them.",
    "The truck starts with a full tank and fuels at least every 1,000 miles (30 minutes on duty).",
    "Any 30 consecutive minutes not driving satisfies the 30-minute break "
    "(off duty, sleeper berth, fueling, pickup or dropoff).",
    "Daily 10-hour rests are logged in the sleeper berth; breaks and 34-hour restarts off duty.",
    "Only driving is barred once the 11-hour, 14-hour or 70-hour limit is reached; on-duty work "
    "such as fueling, pickup or dropoff may continue, so a daily recap can show more than "
    "70 on-duty hours.",
    "Times use the home terminal's time zone (the current location) at its UTC offset at trip start.",
    "Drive times come from a truck-profile route and are rounded to the 15-minute log grid.",
    "Log-sheet header details (driver, carrier, truck/trailer, shipping document) are optional "
    "inputs with sensible defaults.",
)


def _hours(minutes: int) -> str:
    return f"{minutes / 60:g} h"


def describe(rules: HOSRules = DEFAULT_RULES) -> list[dict[str, str]]:
    """A human-readable rule table for the UI's Assumptions tab."""
    return [
        {
            "label": "Driving limit per shift",
            "value": _hours(rules.max_driving_min),
            "source": "49 CFR 395.3(a)(3)",
        },
        {
            "label": "Driving window",
            "value": _hours(rules.driving_window_min),
            "source": "49 CFR 395.3(a)(2)",
        },
        {
            "label": "Break required after driving",
            "value": f"{rules.break_min} min after {_hours(rules.break_after_driving_min)}",
            "source": "49 CFR 395.3(a)(3)(ii)",
        },
        {
            "label": "Daily rest",
            "value": _hours(rules.daily_rest_min),
            "source": "49 CFR 395.3(a)(1)",
        },
        {
            "label": "Cycle limit",
            "value": f"{_hours(rules.cycle_limit_min)} / {rules.cycle_days} days",
            "source": "49 CFR 395.3(b)(2)",
        },
        {"label": "Cycle restart", "value": _hours(rules.restart_min), "source": "49 CFR 395.3(c)"},
        {
            "label": "Fueling",
            "value": f"every {rules.fuel_interval_mi:,.0f} mi, {rules.fuel_min} min",
            "source": "Assessment brief (interval); duration assumed",
        },
        {
            "label": "Pickup / dropoff",
            "value": f"{rules.pickup_min} min / {rules.dropoff_min} min on duty",
            "source": "Assessment brief",
        },
    ]

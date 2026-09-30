"""Minute arithmetic on the 15-minute paper-log grid."""

import math

MINUTES_PER_DAY = 1440
_EPS = 1e-6  # absorbs float noise such as 285.0000000001


def ceil_to(minutes: float, quantum: int = 15) -> int:
    """Round up to the next multiple of ``quantum`` minutes."""
    return int(math.ceil((minutes - _EPS) / quantum)) * quantum


def floor_to(minutes: float, quantum: int = 15) -> int:
    """Round down to the previous multiple of ``quantum`` minutes."""
    return int(math.floor((minutes + _EPS) / quantum)) * quantum


def hhmm(minute_of_day: int) -> str:
    """Format minutes since midnight (0–1440) as ``HH:MM``."""
    hours, minutes = divmod(minute_of_day, 60)
    return f"{hours:02d}:{minutes:02d}"

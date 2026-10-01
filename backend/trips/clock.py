"""Home-terminal clock: turns planner minutes into real, offset-stamped datetimes (spec §3.2 #8)."""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

QUARTER_HOUR = timedelta(minutes=15)


@dataclass(frozen=True, slots=True)
class HomeClock:
    iana: str
    abbreviation: str
    offset: timedelta
    day0: date
    start_minute: int

    @classmethod
    def create(cls, iana: str, start_local: datetime | None, now_utc: datetime) -> "HomeClock":
        """``start_local`` is a naive wall-clock time at the home terminal (None → now)."""
        zone = ZoneInfo(iana)
        local = (
            start_local
            if start_local is not None
            else now_utc.astimezone(zone).replace(tzinfo=None)
        )
        local = _ceil_quarter_hour(local)
        return cls(
            iana=iana,
            abbreviation=zone.tzname(local) or iana,
            offset=zone.utcoffset(local) or timedelta(0),
            day0=local.date(),
            start_minute=local.hour * 60 + local.minute,
        )

    @property
    def tz(self) -> timezone:
        return timezone(self.offset)

    def at(self, minute: int) -> datetime:
        return datetime.combine(self.day0, time(), tzinfo=self.tz) + timedelta(minutes=minute)

    def date_of_day(self, day_index: int) -> date:
        return self.day0 + timedelta(days=day_index)

    @property
    def utc_offset(self) -> str:
        total = int(self.offset.total_seconds() // 60)
        hours, minutes = divmod(abs(total), 60)
        return f"{'-' if total < 0 else '+'}{hours:02d}:{minutes:02d}"

    @property
    def start_local(self) -> str:
        return self.at(self.start_minute).strftime("%Y-%m-%dT%H:%M")


def _ceil_quarter_hour(local: datetime) -> datetime:
    floored = local.replace(minute=local.minute - local.minute % 15, second=0, microsecond=0)
    return floored if floored == local else floored + QUARTER_HOUR

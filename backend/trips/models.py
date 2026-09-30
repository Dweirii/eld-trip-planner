"""A planned trip: key inputs as columns (readable admin), the full plan as JSON."""

import secrets
import string

from django.db import models

_ALPHABET = string.ascii_letters + string.digits


def new_trip_id() -> str:
    """10-character base62 id, short enough for shareable /trips/{id} URLs."""
    return "".join(secrets.choice(_ALPHABET) for _ in range(10))


class Trip(models.Model):
    id = models.CharField(primary_key=True, max_length=10, default=new_trip_id, editable=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    current_label = models.CharField(max_length=200)
    pickup_label = models.CharField(max_length=200)
    dropoff_label = models.CharField(max_length=200)
    cycle_used_hours = models.DecimalField(max_digits=4, decimal_places=2)
    total_miles = models.DecimalField(max_digits=8, decimal_places=1)
    days = models.PositiveSmallIntegerField()
    engine_version = models.CharField(max_length=20)
    request = models.JSONField()
    result = models.JSONField()

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.current_label} → {self.pickup_label} → {self.dropoff_label}"

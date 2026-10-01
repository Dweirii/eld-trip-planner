"""Postgres-backed caches that protect the free provider quotas."""

from django.db import models


class GeocodeCache(models.Model):
    """Geocoder results by normalized query; services re-fetch rows older than 30 days."""

    query = models.CharField(
        max_length=255, unique=True
    )  # normalized "search:…" or "reverse:…" key
    results = models.JSONField()
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.query


class RouteCache(models.Model):
    """Truck routes by profile and rounded coordinates; kept indefinitely."""

    key = models.CharField(max_length=255, unique=True)  # profile + rounded coordinates
    payload = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.key

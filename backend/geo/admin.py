from django.contrib import admin

from .models import GeocodeCache, RouteCache


@admin.register(GeocodeCache)
class GeocodeCacheAdmin(admin.ModelAdmin):
    """Browse and search cached geocoder answers."""

    list_display = ("query", "updated_at")
    search_fields = ("query",)


@admin.register(RouteCache)
class RouteCacheAdmin(admin.ModelAdmin):
    """Browse and search cached truck routes."""

    list_display = ("key", "created_at")
    search_fields = ("key",)

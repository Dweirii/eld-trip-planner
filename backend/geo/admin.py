from django.contrib import admin

from .models import GeocodeCache, RouteCache


@admin.register(GeocodeCache)
class GeocodeCacheAdmin(admin.ModelAdmin):
    list_display = ("query", "updated_at")
    search_fields = ("query",)


@admin.register(RouteCache)
class RouteCacheAdmin(admin.ModelAdmin):
    list_display = ("key", "created_at")
    search_fields = ("key",)

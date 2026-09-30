from django.contrib import admin

from .models import Trip


@admin.register(Trip)
class TripAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "created_at",
        "current_label",
        "pickup_label",
        "dropoff_label",
        "cycle_used_hours",
        "total_miles",
        "days",
    )
    search_fields = ("id", "current_label", "pickup_label", "dropoff_label")
    readonly_fields = [f.name for f in Trip._meta.fields]

from django.apps import AppConfig


class GeoConfig(AppConfig):
    """Geocoding, truck routing and their caches."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "geo"
    verbose_name = "Geocoding & routing"

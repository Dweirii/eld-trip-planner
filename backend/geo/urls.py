from django.urls import path

from .views import GeocodeSearchView, ReverseGeocodeView

urlpatterns = [
    path("", GeocodeSearchView.as_view(), name="geocode-search"),
    path("reverse/", ReverseGeocodeView.as_view(), name="geocode-reverse"),
]

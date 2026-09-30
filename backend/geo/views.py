"""Address autocomplete and "use my location" endpoints."""

from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from config.errors import ErrorSerializer

from . import services
from .serializers import GeocodeQuerySerializer, PlaceSerializer, ReverseQuerySerializer


class GeocodeSearchView(APIView):
    """Address autocomplete across the contiguous United States."""

    @extend_schema(
        summary="Search US places (autocomplete)",
        parameters=[GeocodeQuerySerializer],
        responses={200: PlaceSerializer(many=True), 400: ErrorSerializer, 503: ErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        """Up to limit US places matching q; towns first, street addresses when q has digits."""
        params = GeocodeQuerySerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        places = services.search_places(params.validated_data["q"], params.validated_data["limit"])
        return Response(PlaceSerializer(places, many=True).data)


class ReverseGeocodeView(APIView):
    """The "use my location" lookup: the nearest US town to a coordinate."""

    @extend_schema(
        summary="Nearest US town to a coordinate",
        parameters=[ReverseQuerySerializer],
        responses={200: PlaceSerializer, 404: ErrorSerializer, 503: ErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        """The nearest US town to lat/lng, or 404 when there is none."""
        params = ReverseQuerySerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        place = services.reverse_place(params.validated_data["lat"], params.validated_data["lng"])
        if place is None:
            raise NotFound("No US town found near that point.")
        return Response(PlaceSerializer(place).data)

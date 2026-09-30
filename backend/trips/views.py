"""HTTP endpoints for planning and fetching trips."""

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from config.errors import ErrorSerializer

from . import presenters, services
from .models import Trip
from .serializers import TripRequestSerializer, TripResponseSerializer


class TripCreateView(APIView):
    @extend_schema(
        summary="Plan a trip",
        description="Geocodes the stops, routes a truck, applies the HOS rules, and saves the plan.",
        request=TripRequestSerializer,
        responses={
            201: TripResponseSerializer,
            400: ErrorSerializer,
            422: ErrorSerializer,
            503: ErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        serializer = TripRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        trip = services.plan_and_save(serializer.validated_data)
        return Response(
            TripResponseSerializer(presenters.trip_payload(trip)).data,
            status=status.HTTP_201_CREATED,
        )


class TripDetailView(APIView):
    @extend_schema(
        summary="Get a planned trip", responses={200: TripResponseSerializer, 404: ErrorSerializer}
    )
    def get(self, request: Request, trip_id: str) -> Response:
        trip = Trip.objects.filter(pk=trip_id).first()
        if trip is None:
            raise NotFound("Trip not found.")
        return Response(TripResponseSerializer(presenters.trip_payload(trip)).data)

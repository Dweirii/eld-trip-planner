"""Request validation and the response shape (spec §7). Response serializers also render output,
so the OpenAPI schema and the real payload cannot drift apart."""

from datetime import datetime
from decimal import Decimal

from rest_framework import serializers

from geo.providers.photon import US_BOUNDS
from geo.serializers import PlaceSerializer
from hos.models import DutyStatus

START_TIME_FORMAT = "%Y-%m-%dT%H:%M"
STATUS_CHOICES = [s.value for s in DutyStatus]
STOP_KINDS = ["start", "pickup", "dropoff", "fuel", "break", "rest", "restart"]

DEFAULT_LOG_DETAILS: dict[str, str] = {
    "driver_name": "Alex Driver",
    "co_driver_name": "",
    "carrier_name": "Milepost Freight Co.",
    "main_office_address": "Green Bay, WI",
    "home_terminal_address": "Green Bay, WI",
    "truck_number": "TRK 1042",
    "trailer_number": "TRL 88317",
    "shipping_document": "BOL-000142",
    "shipper_commodity": "General freight",
}


# ── Request ──────────────────────────────────────────────────────────────
class LocationInputSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=200)
    lat = serializers.FloatField(min_value=-90, max_value=90, required=False)
    lng = serializers.FloatField(min_value=-180, max_value=180, required=False)

    def validate(self, attrs: dict) -> dict:
        if ("lat" in attrs) != ("lng" in attrs):
            raise serializers.ValidationError("Provide both lat and lng, or neither.")
        if "lat" in attrs:
            west, south, east, north = US_BOUNDS
            if not (south <= attrs["lat"] <= north and west <= attrs["lng"] <= east):
                raise serializers.ValidationError(
                    "Locations must be in the contiguous United States."
                )
        return attrs


class LogDetailsSerializer(serializers.Serializer):
    driver_name = serializers.CharField(max_length=80, required=False, allow_blank=True)
    co_driver_name = serializers.CharField(max_length=80, required=False, allow_blank=True)
    carrier_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    main_office_address = serializers.CharField(max_length=160, required=False, allow_blank=True)
    home_terminal_address = serializers.CharField(max_length=160, required=False, allow_blank=True)
    truck_number = serializers.CharField(max_length=40, required=False, allow_blank=True)
    trailer_number = serializers.CharField(max_length=40, required=False, allow_blank=True)
    shipping_document = serializers.CharField(max_length=80, required=False, allow_blank=True)
    shipper_commodity = serializers.CharField(max_length=160, required=False, allow_blank=True)


class PlanTripSerializer(serializers.Serializer):
    current_location = LocationInputSerializer()
    pickup_location = LocationInputSerializer()
    dropoff_location = LocationInputSerializer()
    current_cycle_used_hours = serializers.DecimalField(
        max_digits=4, decimal_places=2, min_value=Decimal("0"), max_value=Decimal("70")
    )
    start_time = serializers.CharField(
        required=False, help_text="Local home-terminal time, YYYY-MM-DDTHH:MM. Defaults to now."
    )
    log_details = LogDetailsSerializer(required=False)

    def validate_start_time(self, value: str) -> datetime:
        try:
            parsed = datetime.strptime(value, START_TIME_FORMAT)
        except ValueError as exc:
            raise serializers.ValidationError("Use the format YYYY-MM-DDTHH:MM.") from exc
        if not 2000 <= parsed.year <= 2100:
            raise serializers.ValidationError("Start time must be between the years 2000 and 2100.")
        return parsed


# ── Response ─────────────────────────────────────────────────────────────
class TripInputsSerializer(serializers.Serializer):
    current_location = PlaceSerializer()
    pickup_location = PlaceSerializer()
    dropoff_location = PlaceSerializer()
    current_cycle_used_hours = serializers.FloatField()
    start_time = serializers.CharField()
    log_details = LogDetailsSerializer()


class HomeTimeZoneSerializer(serializers.Serializer):
    iana = serializers.CharField()
    abbreviation = serializers.CharField()
    utc_offset = serializers.CharField()


# "break" is a Python keyword, so this serializer is built with type().
StopCountsSerializer = type(
    "StopCountsSerializer",
    (serializers.Serializer,),
    {
        "fuel": serializers.IntegerField(),
        "break": serializers.IntegerField(),
        "rest": serializers.IntegerField(),
        "restart": serializers.IntegerField(),
    },
)


class SummarySerializer(serializers.Serializer):
    total_miles = serializers.FloatField()
    driving_hours = serializers.FloatField()
    on_duty_hours = serializers.FloatField()
    starts_at = serializers.CharField()
    arrives_at = serializers.CharField()
    days = serializers.IntegerField()
    stops = StopCountsSerializer()


class GeometrySerializer(serializers.Serializer):
    type = serializers.CharField()
    coordinates = serializers.ListField(child=serializers.ListField(child=serializers.FloatField()))


class RouteStepSerializer(serializers.Serializer):
    instruction = serializers.CharField()
    road = serializers.CharField(help_text='The road this step runs on; "" when it has no name.')
    miles = serializers.FloatField()
    minutes = serializers.IntegerField()


# "from" is a Python keyword, so these two serializers are built with type().
RouteLegSerializer = type(
    "RouteLegSerializer",
    (serializers.Serializer,),
    {
        "from": serializers.CharField(),
        "to": serializers.CharField(),
        "miles": serializers.FloatField(),
        "hours": serializers.FloatField(),
        "steps": RouteStepSerializer(
            many=True,
            help_text=(
                "Turn-by-turn directions; consecutive steps on the same road are merged. "
                "Empty when the leg has no driving or the trip was saved before directions existed."
            ),
        ),
    },
)


class RouteSerializer(serializers.Serializer):
    geometry = GeometrySerializer()
    legs = RouteLegSerializer(many=True)


class StopSerializer(serializers.Serializer):
    id = serializers.CharField()
    kind = serializers.ChoiceField(choices=STOP_KINDS)
    status = serializers.ChoiceField(choices=STATUS_CHOICES)
    starts_at = serializers.CharField()
    ends_at = serializers.CharField()
    duration_minutes = serializers.IntegerField()
    mile = serializers.FloatField()
    lat = serializers.FloatField()
    lng = serializers.FloatField()
    place = serializers.CharField()


class SegmentSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=STATUS_CHOICES)
    start_minute = serializers.IntegerField()
    end_minute = serializers.IntegerField()


class TotalsSerializer(serializers.Serializer):
    off_duty = serializers.FloatField()
    sleeper_berth = serializers.FloatField()
    driving = serializers.FloatField()
    on_duty = serializers.FloatField()


class RemarkSerializer(serializers.Serializer):
    minute = serializers.IntegerField()
    time = serializers.CharField()
    place = serializers.CharField()
    note = serializers.CharField()


class BracketSerializer(serializers.Serializer):
    start_minute = serializers.IntegerField()
    end_minute = serializers.IntegerField()
    place = serializers.CharField()


class RecapSerializer(serializers.Serializer):
    on_duty_today = serializers.FloatField()
    a_last_7_days = serializers.FloatField()
    b_available_tomorrow = serializers.FloatField()
    c_last_5_days = serializers.FloatField()


class LogHeaderSerializer(LogDetailsSerializer):
    time_zone = serializers.CharField()


DailyLogSerializer = type(
    "DailyLogSerializer",
    (serializers.Serializer,),
    {
        "date": serializers.CharField(),
        "day_number": serializers.IntegerField(),
        "from": serializers.CharField(),
        "to": serializers.CharField(),
        "miles_today": serializers.FloatField(),
        "segments": SegmentSerializer(many=True),
        "totals": TotalsSerializer(),
        "remarks": RemarkSerializer(many=True),
        "brackets": BracketSerializer(many=True),
        "header": LogHeaderSerializer(),
        "recap": RecapSerializer(),
    },
)


class RuleCheckSerializer(serializers.Serializer):
    id = serializers.CharField()
    title = serializers.CharField()
    citation = serializers.CharField()
    limit = serializers.FloatField()
    observed = serializers.FloatField()
    unit = serializers.CharField()
    passed = serializers.BooleanField()


class RuleDescriptionSerializer(serializers.Serializer):
    label = serializers.CharField()
    value = serializers.CharField()
    source = serializers.CharField()


class AssumptionsSerializer(serializers.Serializer):
    rules = RuleDescriptionSerializer(many=True)
    notes = serializers.ListField(child=serializers.CharField())


class TripResponseSerializer(serializers.Serializer):
    id = serializers.CharField()
    created_at = serializers.CharField()
    engine_version = serializers.CharField()
    inputs = TripInputsSerializer()
    home_time_zone = HomeTimeZoneSerializer()
    summary = SummarySerializer()
    route = RouteSerializer()
    stops = StopSerializer(many=True)
    daily_logs = DailyLogSerializer(many=True)
    compliance = RuleCheckSerializer(many=True)
    assumptions = AssumptionsSerializer()

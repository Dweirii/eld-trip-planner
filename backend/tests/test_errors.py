from django.http import Http404
from rest_framework import exceptions

from config.errors import ApiError, api_exception_handler
from geo.errors import LocationNotFound, RouteNotFound, UpstreamUnavailable


def handle(exc):
    return api_exception_handler(exc, {})


def test_api_errors_use_the_envelope_with_field():
    response = handle(ApiError("Pickup and dropoff are the same place.", field="dropoff_location"))
    assert response.status_code == 400
    assert response.data == {
        "error": {
            "code": "validation_error",
            "message": "Pickup and dropoff are the same place.",
            "field": "dropoff_location",
        }
    }


def test_geo_errors_carry_their_own_status_and_code():
    assert handle(LocationNotFound("nope", field="pickup_location")).status_code == 422
    assert handle(RouteNotFound("no route")).data["error"]["code"] == "route_not_found"
    assert handle(UpstreamUnavailable("down")).status_code == 503


def test_drf_validation_errors_become_validation_error_with_details():
    response = handle(exceptions.ValidationError({"current_cycle_used_hours": ["Too high."]}))
    assert response.status_code == 400
    assert response.data["error"]["code"] == "validation_error"
    assert response.data["error"]["details"] == {"current_cycle_used_hours": ["Too high."]}


def test_not_found_is_mapped():
    assert handle(Http404()).data["error"]["code"] == "not_found"
    assert handle(exceptions.NotFound("Trip not found.")).data == {
        "error": {"code": "not_found", "message": "Trip not found."}
    }


def test_unexpected_errors_become_a_generic_500():
    response = handle(RuntimeError("boom"))
    assert response.status_code == 500
    assert response.data["error"]["code"] == "server_error"
    assert "boom" not in response.data["error"]["message"]

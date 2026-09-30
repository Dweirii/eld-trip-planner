"""Unknown paths answer with the JSON error envelope, never a redirect or an HTML page."""

import pytest

pytestmark = pytest.mark.django_db

HINT = "Not found. API paths end with a slash, e.g. /api/trips/."


def test_post_without_trailing_slash_is_a_json_404_not_a_redirect(client):
    response = client.post(
        "/api/trips",
        {
            "current_location": {"label": "Chicago, IL"},
            "pickup_location": {"label": "St. Louis, MO"},
            "dropoff_location": {"label": "Dallas, TX"},
            "current_cycle_used_hours": 10,
        },
        content_type="application/json",
    )

    assert response.status_code == 404
    assert response["Content-Type"] == "application/json"
    assert response.json() == {"error": {"code": "not_found", "message": HINT}}


def test_unknown_api_path_is_a_json_404(client):
    response = client.get("/api/nope/")

    assert response.status_code == 404
    assert response["Content-Type"] == "application/json"
    assert response.json()["error"] == {"code": "not_found", "message": HINT}

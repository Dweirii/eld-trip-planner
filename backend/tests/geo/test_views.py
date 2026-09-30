import pytest

pytestmark = pytest.mark.django_db


def test_geocode_search_returns_places(client):
    response = client.get("/api/geocode/", {"q": "chi"})
    assert response.status_code == 200
    assert response.json() == [{"label": "Chicago, IL", "lat": 41.8781, "lng": -87.6298}]


def test_geocode_search_requires_three_characters(client):
    response = client.get("/api/geocode/", {"q": "ch"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"
    assert "q" in response.json()["error"]["details"]


def test_geocode_outage_is_503(client):
    response = client.get("/api/geocode/", {"q": "outage city"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "upstream_unavailable"


def test_reverse_geocode(client):
    response = client.get("/api/geocode/reverse/", {"lat": 41.88, "lng": -87.63})
    assert response.status_code == 200
    assert response.json()["label"] == "Chicago, IL"


def test_reverse_geocode_outside_the_us_is_404(client):
    response = client.get("/api/geocode/reverse/", {"lat": 10, "lng": 10})
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"

def test_health_reports_ok_and_engine_version(client):
    response = client.get("/api/health/")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "engine_version": "1.0.0"}

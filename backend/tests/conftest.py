"""Shared pytest configuration: every test uses the in-memory providers."""

import pytest

from tests.fakes import FakeGeocoder, FakeRouter


@pytest.fixture(autouse=True)
def fake_providers(settings):
    settings.GEO_GEOCODER = "tests.fakes.FakeGeocoder"
    settings.GEO_ROUTER = "tests.fakes.FakeRouter"
    FakeGeocoder.calls.clear()
    FakeRouter.calls.clear()

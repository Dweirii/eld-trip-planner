"""Project-level endpoints."""

from django.http import HttpRequest, JsonResponse

from hos import ENGINE_VERSION


def health(request: HttpRequest) -> JsonResponse:
    """Liveness probe; also used by the frontend to warm the function."""
    return JsonResponse({"status": "ok", "engine_version": ENGINE_VERSION})

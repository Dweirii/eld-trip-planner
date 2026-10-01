"""Project-level endpoints."""

from django.http import HttpRequest, JsonResponse

from hos import ENGINE_VERSION

from .errors import error_body


def health(request: HttpRequest) -> JsonResponse:
    """Liveness probe; also used by the frontend to warm the function."""
    return JsonResponse({"status": "ok", "engine_version": ENGINE_VERSION})


def not_found(request: HttpRequest, exception: Exception | None = None) -> JsonResponse:
    """JSON 404 for every unknown path (API clients never get an HTML page)."""
    return JsonResponse(
        error_body("not_found", "Not found. API paths end with a slash, e.g. /api/trips/."),
        status=404,
    )

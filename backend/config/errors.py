"""The API's single error envelope: {"error": {"code", "message", "field"?, "details"?}}."""

import logging

from django.http import Http404
from rest_framework import exceptions, serializers, status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


class ApiError(Exception):
    """A client-facing error. Subclasses set ``status_code`` and ``code``."""

    status_code = status.HTTP_400_BAD_REQUEST
    code = "validation_error"

    def __init__(self, message: str, *, field: str | None = None, details: object = None) -> None:
        super().__init__(message)
        self.message = message
        self.field = field
        self.details = details


def error_body(code: str, message: str, field: str | None = None, details: object = None) -> dict:
    body: dict[str, object] = {"code": code, "message": message}
    if field:
        body["field"] = field
    if details is not None:
        body["details"] = details
    return {"error": body}


def api_exception_handler(exc: Exception, context: dict) -> Response:
    """DRF EXCEPTION_HANDLER: every error leaves the API in the same shape."""
    if isinstance(exc, Http404):
        exc = exceptions.NotFound()
    if isinstance(exc, ApiError):
        return Response(
            error_body(exc.code, exc.message, exc.field, exc.details), status=exc.status_code
        )
    if isinstance(exc, exceptions.ValidationError):
        return Response(
            error_body("validation_error", "Some fields are invalid.", details=exc.detail),
            status=status.HTTP_400_BAD_REQUEST,
        )
    response = exception_handler(exc, context)
    if response is not None:
        response.data = error_body(getattr(exc, "default_code", "error"), str(exc.detail))
        return response
    logger.exception("Unhandled API error", exc_info=exc)
    return Response(
        error_body("server_error", "Something went wrong on our side. Please try again."),
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


class ErrorBodySerializer(serializers.Serializer):
    code = serializers.CharField()
    message = serializers.CharField()
    field = serializers.CharField(required=False)
    details = serializers.JSONField(required=False)


class ErrorSerializer(serializers.Serializer):
    """OpenAPI description of the error envelope."""

    error = ErrorBodySerializer()
